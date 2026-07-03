<script type="application/json" def>
{
  "navigationBarTitleText": "SmartRun HUD",
  "description": "跑步实时数据 HUD：BLE 心率直连（0x180D），显示心率、配速、步频、时长、距离与心率区间",
  "schema": {
    "data": {
      "bpm": { "type": "string", "description": "当前心率 bpm，无数据为 --" },
      "pace": { "type": "string", "description": "当前配速 M:SS/km" },
      "cadence": { "type": "string", "description": "步频 spm" },
      "elapsed": { "type": "string", "description": "运动时长 mm:ss" },
      "distance": { "type": "string", "description": "距离 km" }
    }
  }
}
</script>

<script setup>
// Step 2：BLE 心率真链路（官方 bluetooth/heart_rate 样例模式）+ 会话聚合。
// 心率：navigator.bluetooth 直连标准 HRS(0x180D)，notify 回调喂 RunSession；
// 配速/步频：暂用演示源（Step 3 接 RSC/FTMS/IMU 后替换），sourceTag 如实标注。
// interactive 门槛：scan/connect/startNotifications 必须由用户点击触发
// （apis-device.md），断连后不自动重连——引导用户点「连接心率」。
import { RunSession } from '../../lib/session.js';
import { parseHeartRateMeasurement, hrZone } from '../../lib/hr.js';
import { StepDetector } from '../../lib/imu.js';
import { nextProactiveCue } from '../../lib/coach.js';
import {
  formatElapsed, formatPace, paceSecPerKmFromKmh, formatDistanceKm, formatBpm,
} from '../../lib/format.js';

const TICK_MS = 1000;
const HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
const IMU_HZ = 50;          // 加速度计采样率
const IMU_STRIDE_M = 0.85;  // 估算步长(m):距离=步频×步长积分,粗估仅供参考

function clockHHmm() {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default {
  data: {
    bpm: '--',
    zoneCap: '心率 · bpm',
    pace: '--:--',
    cadence: '--',
    elapsed: '00:00',
    distance: '--',
    clock: '--:--',
    sourceTag: '演示',
    coachLine: '● 等待开始运动',
    paused: false,
    running: false,
    // BLE 状态机：idle | scanning | connecting | connected
    bleState: 'idle',
    bleLabel: '连接心率',
    deviceName: '',
    devices: [],
    scanOpen: false,
    dots: [
      { id: 5, cls: 'dot' }, { id: 4, cls: 'dot' }, { id: 3, cls: 'dot' },
      { id: 2, cls: 'dot' }, { id: 1, cls: 'dot' },
    ],
  },

  onUnload() { this.stopTicker(); this.stopAccel(); this.teardownBle(); },
  onHide() { this.stopTicker(); this.stopAccel(); },
  onShow() { if (this.data.running && !this.timer) this.startTicker(); },

  // ── 跑步会话 ────────────────────────────────────────────────
  toggleRun() {
    if (!this.data.running) {
      this.session = new RunSession(Date.now());
      this.stepDet = new StepDetector({ strideM: IMU_STRIDE_M });
      this.prevCue = null;
      this.startAccel();
      this.setData({ running: true, paused: false });
      this.speakCue('开始跑步,注意呼吸和落地节奏。');
      this.startTicker();
      return;
    }
    const now = Date.now();
    if (this.data.paused) {
      this.session.resume(now);
      this.setData({ paused: false, coachLine: '' });
    } else {
      this.session.pause(now);
      this.setData({ paused: true, coachLine: '● 已暂停' });
    }
  },

  stopRun() {
    this.stopTicker();
    this.stopAccel();
    this.session = null;
    this.stepDet = null;
    this.prevCue = null;
    this.setData({
      running: false, paused: false,
      bpm: '--', zoneCap: '心率 · bpm', pace: '--:--', cadence: '--',
      elapsed: '00:00', distance: '--', sourceTag: '演示',
      coachLine: '● 等待开始运动',
      dots: this.data.dots.map((d) => ({ id: d.id, cls: 'dot' })),
    });
  },

  // ── IMU 计步(无蓝牙设备兜底:眼镜自带加速度计)──────────────
  startAccel() {
    this.stopAccel();
    if (typeof Accelerometer === 'undefined') { this.imuOk = false; return; }
    try {
      const sensor = new Accelerometer({ frequency: IMU_HZ });
      sensor.addEventListener('reading', () => {
        if (this.stepDet && this.session && !this.session.paused) {
          this.stepDet.push(sensor.x, sensor.y, sensor.z, Date.now());
        }
      });
      sensor.addEventListener('error', (e) => {
        this.imuOk = false;
        console.error('IMU error', e && e.error);
      });
      sensor.start();
      this.accel = sensor;
      this.imuOk = true;
    } catch (e) {
      this.imuOk = false;
      console.error('IMU start failed', e);
    }
  },

  stopAccel() {
    if (this.accel) { try { this.accel.stop(); } catch (_e) {} this.accel = null; }
  },

  // 主动语音教练:显示 + TTS 播报(playTTS 优先,退回 Web speechSynthesis)
  speakCue(text) {
    this.setData({ coachLine: '● ' + text });
    try {
      if (typeof wx !== 'undefined' && wx.speech && typeof wx.speech.playTTS === 'function') {
        wx.speech.playTTS(text);
      } else if (typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined') {
        speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      }
    } catch (_e) {}
  },

  startTicker() {
    this.stopTicker();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  },

  stopTicker() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },

  tick() {
    const s = this.session;
    if (!s) return;
    const now = Date.now();
    const hrLive = this.data.bleState === 'connected';

    // 运动数据来源：步频用眼镜 IMU 真实计步(无蓝牙也能用)；
    //   由「步频×步长」估算瞬时速度喂 RunSession → 复用其距离累加/配速/暂停逻辑。
    //   心率仅来自 BLE，无 BLE 则显示 --（不再造假演示值）。
    const cadence = this.stepDet ? this.stepDet.cadenceSpm(now) : 0;
    const speedKmh = cadence > 0 ? (cadence / 60) * IMU_STRIDE_M * 3.6 : 0;
    if (!s.paused) {
      s.onSpeed(speedKmh, now);
      s.onCadence(cadence);
    }

    const snap = s.snapshot(now);
    const zone = hrZone(snap.bpm ?? 0);
    const paceSec = snap.paused ? null
      : (paceSecPerKmFromKmh(speedKmh) ?? snap.avgPaceSecPerKm);

    let sourceTag;
    if (hrLive) sourceTag = `心率:${this.data.deviceName}`;
    else if (cadence > 0) sourceTag = 'IMU 计步';
    else sourceTag = this.imuOk === false ? 'IMU 不可用' : '眼镜待机';

    this.setData({
      bpm: formatBpm(snap.bpm),
      zoneCap: zone > 0 ? `心率 Z${zone} · bpm` : '心率 · bpm',
      pace: formatPace(paceSec),
      cadence: cadence > 0 ? String(cadence) : '--',
      elapsed: formatElapsed(snap.elapsedMs),
      distance: formatDistanceKm(snap.distanceM),
      clock: clockHHmm(),
      sourceTag,
      dots: this.data.dots.map((d) => ({
        id: d.id, cls: d.id <= zone ? 'dot dot-on' : 'dot',
      })),
    });

    // 主动语音教练：里程碑 / 区间变化时不等提问就开口
    if (!snap.paused) {
      const cur = {
        distanceM: snap.distanceM, elapsedMs: snap.elapsedMs,
        zone, cadenceSpm: cadence, paceSecPerKm: paceSec,
      };
      const cue = nextProactiveCue(this.prevCue, cur);
      if (cue) this.speakCue(cue);
      this.prevCue = cur;
    }
  },

  // ── BLE 心率（官方 heart_rate 样例模式）───────────────────────
  async toggleBle() {
    const st = this.data.bleState;
    if (st === 'connected') { await this.disconnectBle(); return; }
    if (st === 'scanning') { await this.stopScan(); return; }
    await this.startScan();
  },

  async startScan() {
    await this.stopScan();
    this.deviceMap = new Map();
    this.setData({
      bleState: 'scanning', bleLabel: '停止扫描',
      scanOpen: true, devices: [], coachLine: '● 正在扫描心率设备…',
    });
    try {
      const scan = await navigator.bluetooth.scanDevices({
        filters: [{ services: ['heart_rate'] }],
      });
      this.scanSession = scan;
      scan.onDeviceFound((event) => {
        const device = event.device;
        this.deviceMap.set(device.id, device);
        if (!this.data.devices.find((d) => d.id === device.id)) {
          this.setData({
            devices: [...this.data.devices,
              { id: device.id, name: device.name || '未知设备' }],
          });
        }
      });
    } catch (e) {
      console.error('HR scan failed', e);
      this.setData({
        bleState: 'idle', bleLabel: '连接心率', scanOpen: false,
        coachLine: '● 扫描失败：' + e.message,
      });
    }
  },

  async stopScan() {
    if (this.scanSession) {
      try { await this.scanSession.stop(); } catch (_) {}
      this.scanSession = null;
    }
    if (this.data.bleState === 'scanning') {
      this.setData({ bleState: 'idle', bleLabel: '连接心率', scanOpen: false, coachLine: '' });
    }
  },

  async selectDevice(e) {
    const id = e.currentTarget.attributes['data-id'];
    const device = this.deviceMap && this.deviceMap.get(id);
    if (!device || this.data.bleState === 'connecting') return;

    await this.stopScan();
    this.setData({
      bleState: 'connecting', bleLabel: '连接中…', scanOpen: false,
      coachLine: `● 正在连接 ${device.name || '设备'}…`,
    });
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic(HR_MEASUREMENT_UUID);
      const listener = () => {
        const m = parseHeartRateMeasurement(characteristic.value);
        if (m && this.session) this.session.onHeartRate(m.bpm);
        if (m && !this.session) this.setData({ bpm: formatBpm(m.bpm) });
      };
      this.hrCharacteristic = characteristic;
      this.hrListener = listener;
      characteristic.addEventListener('characteristicvaluechanged', listener);
      await characteristic.startNotifications();
      this.bleDevice = device;

      this.setData({
        bleState: 'connected', bleLabel: '断开心率',
        deviceName: device.name || '未知设备',
        coachLine: this.data.running ? '' : '● 心率已连接，点开始进入跑步',
      });
    } catch (e) {
      console.error('HR connect failed', e);
      this.teardownBle();
      this.setData({
        bleState: 'idle', bleLabel: '连接心率', deviceName: '',
        coachLine: '● 连接失败：' + e.message,
      });
    }
  },

  async disconnectBle() {
    try {
      if (this.hrCharacteristic && this.hrListener) {
        this.hrCharacteristic.removeEventListener('characteristicvaluechanged', this.hrListener);
        try { await this.hrCharacteristic.stopNotifications(); } catch (_) {}
      }
      if (this.bleDevice) await this.bleDevice.gatt.disconnect();
    } catch (e) {
      console.error('HR disconnect failed', e);
    } finally {
      this.teardownBle();
      this.setData({
        bleState: 'idle', bleLabel: '连接心率', deviceName: '',
        sourceTag: '演示', coachLine: '',
      });
    }
  },

  teardownBle() {
    if (this.scanSession) { try { this.scanSession.stop(); } catch (_) {} }
    this.scanSession = null;
    this.hrCharacteristic = null;
    this.hrListener = null;
    this.bleDevice = null;
    this.deviceMap = null;
  },
};
</script>

<page>
  <view class="hud">
    <view class="row-hero">
      <view class="zone-dots">
        <view ink:for="{{ dots }}" ink:for-item="dot" key="{{ dot.id }}" class="{{ dot.cls }}"></view>
      </view>
      <view class="metric">
        <text class="metric-value">{{ bpm }}</text>
        <text class="metric-cap">{{ zoneCap }}</text>
      </view>
      <view class="metric">
        <text class="metric-value">{{ pace }}</text>
        <text class="metric-cap">配速 · min/km</text>
      </view>
      <view class="metric">
        <text class="metric-value">{{ cadence }}</text>
        <text class="metric-cap">步频 · spm</text>
      </view>
      <view class="metric">
        <text class="metric-value">{{ elapsed }}</text>
        <text class="metric-cap">时长 · 分秒</text>
      </view>
    </view>

    <view class="sep"></view>

    <view class="row-minor">
      <view class="metric-sm">
        <text class="metric-sm-value">{{ distance }}</text>
        <text class="metric-cap">距离 · km</text>
      </view>
      <view class="metric-sm">
        <text class="metric-sm-value">{{ clock }}</text>
        <text class="metric-cap">时间 · 时:分</text>
      </view>
      <view class="metric-sm">
        <text class="metric-sm-value">{{ sourceTag }}</text>
        <text class="metric-cap">数据源</text>
      </view>
    </view>

    <view ink:if="{{ scanOpen }}" class="scan-list">
      <text class="scan-title">
        {{ devices.length > 0 ? '选择心率设备' : '扫描中… 请确认设备已开机广播' }}
      </text>
      <view
        ink:for="{{ devices }}"
        ink:for-item="device"
        key="{{ device.id }}"
        class="scan-item"
        data-id="{{ device.id }}"
        bindtap="selectDevice"
      >
        <text class="scan-item-name">{{ device.name }}</text>
        <text class="scan-item-id">{{ device.id }}</text>
      </view>
    </view>

    <text ink:if="{{ coachLine }}" class="coach">{{ coachLine }}</text>

    <view class="controls">
      <button class="btn-primary" bindtap="toggleRun">
        {{ !running ? '开始' : (paused ? '继续' : '暂停') }}
      </button>
      <button class="btn-ble" bindtap="toggleBle">{{ bleLabel }}</button>
      <button ink:if="{{ running }}" class="btn-ghost" bindtap="stopRun">结束</button>
    </view>
  </view>
</page>

<style>
.hud {
  display: flex;
  flex-direction: column;
  background-color: #000000;
  border: 2px solid #143a20;
  border-radius: var(--radius-md, 12px);
  padding: 14px 14px 12px;
}

.row-hero {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.zone-dots {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 8px;
}

.dot {
  width: 10px;
  height: 5px;
  background-color: #143a20;
  border-radius: 2px;
  margin-bottom: 3px;
}

.dot-on {
  background-color: var(--color-primary, #40ff5e);
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 104px;
}

.metric-value {
  color: var(--color-primary, #40ff5e);
  font-size: 30px;
  line-height: 34px;
  font-weight: bold;
  text-align: center;
}

.metric-cap {
  color: #8fe0a0;
  font-size: 10px;
  line-height: 14px;
  margin-top: 2px;
  text-align: center;
}

.sep {
  height: 1px;
  background-color: #1c3424;
  margin: 10px 6px;
}

.row-minor {
  display: flex;
  flex-direction: row;
  justify-content: center;
}

.metric-sm {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 140px;
}

.metric-sm-value {
  color: var(--color-primary, #40ff5e);
  font-size: 18px;
  line-height: 22px;
  font-weight: bold;
}

.scan-list {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  padding: 10px;
  background-color: #0d1510;
  border: 1px solid #193323;
  border-radius: var(--radius-md, 12px);
}

.scan-title {
  color: #8fe0a0;
  font-size: 12px;
  line-height: 16px;
  margin-bottom: 6px;
}

.scan-item {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  margin-bottom: 6px;
  background-color: #09100b;
  border: 1px solid #1e3024;
  border-radius: 8px;
}

.scan-item-name {
  color: #dbffe5;
  font-size: 14px;
  line-height: 18px;
}

.scan-item-id {
  color: #73a785;
  font-size: 10px;
  line-height: 14px;
  margin-top: 2px;
}

.coach {
  color: var(--color-primary, #40ff5e);
  font-size: 12px;
  line-height: 16px;
  text-align: center;
  margin-top: 8px;
}

.controls {
  display: flex;
  flex-direction: row;
  justify-content: center;
  margin-top: 10px;
}

.btn-primary {
  min-width: 100px;
  padding: 8px 12px;
  text-align: center;
  color: #031106;
  background-color: var(--color-primary, #40ff5e);
  border-radius: var(--radius-md, 12px);
  font-weight: bold;
}

.btn-ble {
  min-width: 100px;
  padding: 8px 12px;
  margin-left: 10px;
  text-align: center;
  color: #8dffab;
  background-color: #132117;
  border: 1px solid #24452f;
  border-radius: var(--radius-md, 12px);
}

.btn-ghost {
  min-width: 80px;
  padding: 8px 12px;
  margin-left: 10px;
  text-align: center;
  color: #b9ccc0;
  background-color: #0d1510;
  border: 1px solid #223529;
  border-radius: var(--radius-md, 12px);
}
</style>
