<script type="application/json" def>
{
  "navigationBarTitleText": "AISmartRun 跑步",
  "description": "中文：跑步页会自动开始记录。单眼镜模式显示时间、步频、估算距离和配速；接入心率后才在同一面板补充心率，不切换页面。\n\nEnglish: The run page starts tracking automatically. Glasses-only mode shows time, step rate, estimated distance and pace; heart rate appears in the same panel only after heart-rate data is connected.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "bpm": { "type": "string", "description": "中文：当前心率；仅在心率接入时显示。 English: Current heart rate; shown only when heart-rate data is connected." },
        "pace": { "type": "string", "description": "中文：当前配速。 English: Current running pace." },
        "cadence": { "type": "string", "description": "中文：每分钟步数。 English: Steps per minute." },
        "elapsed": { "type": "string", "description": "中文：本次跑步已经用时。 English: Time elapsed in this run." },
        "distVal": { "type": "string", "description": "中文：已跑距离；原地跑时可作为步数显示。 English: Distance covered; may show steps for stationary running." },
        "showHeartRate": { "type": "boolean", "description": "中文：是否显示心率列。 English: Whether the heart-rate column is visible." }
      },
      "required": ["bpm", "pace", "cadence", "elapsed", "distVal", "showHeartRate"]
    }
  }
}
</script>

<script setup>
// 极简跑步数据页:进页自动开跑,零配置。
//   跑步页是纯展示卡片,不放可点击按钮。单眼镜模式不占心率位;接入心率后同屏补充心率列。
//   距离/配速/步频：眼镜自带加速度计计步 → 步长积分估算(无需任何外设,粗估仅供参考)。
//   息屏/切页自动暂停记录,回来自动继续 —— 时长与距离口径一致,不会"时长照走距离冻结"。
//   跑步中 Backspace 需 3 秒内按两次才退出,防误触丢掉整段跑步数据。
import wx from 'wx';
import { RunSession } from '../../lib/session.js';
import { parseHeartRateMeasurement, hrZone } from '../../lib/hr.js';
import { StepDetector } from '../../lib/imu.js';
import { nextProactiveCue } from '../../lib/coach.js';
import { writeLiveSnapshot, clearLiveSnapshot } from '../../lib/live.js';
import { buildRunUploadPayload, enqueueRunUpload } from '../../lib/run_upload.js';
import { readRunSettings, DEFAULT_RUN_SETTINGS } from '../../lib/settings.js';
import {
  unifiedPaceMod, unifiedDistMod, unifiedElapsedMod, glassesDistMod, glassesElapsedMod,
} from '../../lib/hud.js';
import {
  hasPreferredHeartRateDevice,
  matchesHeartRateDevice,
  readHeartRateDevice,
  writeHeartRateDevice,
} from '../../lib/devices.js';
import {
  formatElapsed, formatPace, paceSecPerKmFromKmh, formatDistanceKm, formatBpm,
} from '../../lib/format.js';

const TICK_MS = 1000;
const HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
const IMU_HZ = 50;          // 加速度计采样率
const DEFAULT_STRIDE_M = DEFAULT_RUN_SETTINGS.strideM;  // 粗估步长,可在设置页调整
const AUTO_BLE_TIMEOUT_MS = 6000;   // 自动连蓝牙:6s 没扫到心率设备就静默进无蓝牙模式
const HR_STALE_MS = 8000;           // 心率 8s 无新 notify 视为断连 → 静默回单眼镜
const ACCEL_STALE_MS = 10000;       // 传感器构造成功但 10s 无回调 → 降级仅计时
const EXIT_CONFIRM_MS = 3000;       // 跑步中 Backspace 双击确认窗口
const START_CUE = '开跑，呼吸放稳。';
const EXIT_CONFIRM_LINE = '再按一次结束';

export default {
  data: {
    bpm: '',
    pace: '--:--',
    cadence: '--',
    elapsed: '00:00',
    distVal: '0.00',
    modeLabel: '单眼镜模式',
    modeChipClass: 'mode-chip',
    footerClass: 'coach-line',
    showHeartRate: false,
    sourceMain: '眼镜估算',
    coachLine: '准备开跑',
    paused: false,
    running: false,
    // 长值防溢出:按字符数换小字号 class(WXSS 无 overflow/ellipsis 可用)
    paceMod: '',
    distMod: '',
    elapsedMod: '',
    gDistMod: '',
    gElapsedMod: '',
    // BLE 状态机：idle | scanning | connecting | connected。HUD 内不展示按钮。
    bleState: 'idle',
    dot5: 'dot',
    dot4: 'dot',
    dot3: 'dot',
    dot2: 'dot',
    dot1: 'dot',
  },

  onLoad() {
    // 一键开跑:进页立即记录。心率不是主流程,无心率也能完整显示跑步数据。
    this.runSettings = readRunSettings(wx);
    this.runStrideM = this.runSettings.strideM || DEFAULT_STRIDE_M;
    this.startRun();
    if (this.runSettings.autoHeartRate) this.autoConnectBle();
  },

  onUnload() {
    this.queueRunForUpload();   // 系统级卸载(被杀/被导航)也不丢跑步摘要
    this.stopTicker();
    this.stopAccel();
    this.clearAutoBleTimer();
    this.teardownBle();
    clearLiveSnapshot(wx);
  },

  // 跑步摘要入待传队列(只传汇总指标,无轨迹):首页 onLoad 静默补传到后端 runs 表,
  // 眼镜用户由此复用 APK 生态的跑后 AI 点评/洞察/周报管线。幂等:一次会话只入队一次。
  queueRunForUpload() {
    if (this.runUploadQueued || !this.session) return;
    const now = Date.now();
    const snap = this.session.snapshot(now);
    const payload = buildRunUploadPayload({
      startMs: this.session.startMs,
      endMs: now,
      elapsedMs: snap.elapsedMs,
      distanceM: snap.distanceM,
      avgPaceSecPerKm: snap.avgPaceSecPerKm,
      avgBpm: this.session.avgBpm(),
      maxBpm: this.session.maxBpm(),
      avgCadenceSpm: this.session.avgCadenceSpm(),
    });
    if (!payload) return;   // 不够门槛(误进误出)不制造垃圾记录
    this.runUploadQueued = true;
    enqueueRunUpload(wx, payload);
  },

  // 息屏/浮层/切页:停传感器的同时暂停记录 —— 加速度计停了距离就不会涨,
  // 时长若照走会得到"时长+10分钟、距离+0"的坏数据;自动暂停保证两者口径一致。
  onHide() {
    this.stopTicker();
    this.stopAccel();
    if (this.session && this.data.running && !this.session.paused) {
      const now = Date.now();
      this.session.pause(now);
      this.autoPausedByHide = true;
      const snap = this.session.snapshot(now);
      writeLiveSnapshot(wx, {
        bpm: snap.bpm, zone: hrZone(snap.bpm), paceSecPerKm: null,
        cadenceSpm: snap.cadenceSpm, distanceM: snap.distanceM,
        elapsedMs: snap.elapsedMs, paused: true,
      }, now);
      this.setData({ paused: true, coachLine: '已暂停' });
    }
  },

  // 回来后:恢复记录 + ticker + 加速度计,否则步数/步频/距离永久冻结。
  // startAccel 内部先 stopAccel、回调有 session.paused 守卫,恢复是幂等安全的。
  onShow() {
    if (!this.data.running) return;
    if (this.session && this.session.paused && this.autoPausedByHide) {
      this.session.resume(Date.now());
      this.autoPausedByHide = false;
      this.setData({ paused: false, coachLine: '' });
    }
    if (!this.timer) this.startTicker();
    if (!this.accel) this.startAccel();
    // HUD 无按钮,回到页面是跑步中恢复心率的唯一途径:
    // 心率已断且自动心率开着 → 静默重试一轮自动连接。
    if (this.data.bleState === 'idle' && this.runSettings && this.runSettings.autoHeartRate) {
      this.autoConnectBle();
    }
  },

  // ── 跑步会话 ────────────────────────────────────────────────
  startRun() {
    if (this.data.running) return;
    this.session = new RunSession(Date.now());
    this.stepDet = new StepDetector({ strideM: this.runStrideM || DEFAULT_STRIDE_M });
    this.prevCue = null;
    this.exitArmedAt = null;
    this.autoPausedByHide = false;
    this.startAccel();
    this.setData({ running: true, paused: false });
    if (this.imuOk === false) {
      this.setData({
        coachLine: '单眼镜计时中',
        ...this.hudModeFields({ connected: false }),
      });
    } else if (!this.runSettings || this.runSettings.voiceCue !== false) {
      this.speakCue(START_CUE);
    }
    this.startTicker();
  },

  hudModeFields(opts = {}) {
    const connected = opts.connected === true;
    if (connected) {
      return {
        modeLabel: '心率接入',
        modeChipClass: 'mode-chip',
        footerClass: 'coach-line',
        showHeartRate: true,
        sourceMain: '心率+眼镜',
      };
    }
    if (this.imuOk === false) {
      return {
        modeLabel: '单眼镜模式',
        modeChipClass: 'mode-chip mode-muted',
        footerClass: 'coach-line line-muted',
        showHeartRate: false,
        sourceMain: '仅计时',
      };
    }
    return {
      modeLabel: '单眼镜模式',
      modeChipClass: 'mode-chip',
      footerClass: 'coach-line',
      showHeartRate: false,
      sourceMain: '眼镜估算',
    };
  },

  markImuUnavailable() {
    this.stopAccel();
    this.imuOk = false;
    this.setData({
      coachLine: '单眼镜计时中',
      ...this.hudModeFields({ connected: this.data.showHeartRate }),
    });
  },

  // ── IMU 计步(无蓝牙设备兜底:眼镜自带加速度计)──────────────
  startAccel() {
    this.stopAccel();
    if (typeof Accelerometer === 'undefined') { this.markImuUnavailable(); return; }
    try {
      const sensor = new Accelerometer({ frequency: IMU_HZ });
      sensor.addEventListener('reading', () => {
        this.lastAccelAt = Date.now();
        if (this.stepDet && this.session && !this.session.paused) {
          this.stepDet.push(sensor.x, sensor.y, sensor.z, this.lastAccelAt);
        }
      });
      sensor.addEventListener('error', () => this.markImuUnavailable());
      sensor.start();
      this.accel = sensor;
      this.imuOk = true;
      this.lastAccelAt = Date.now();
    } catch (_e) {
      this.markImuUnavailable();
    }
  },

  stopAccel() {
    if (this.accel) { try { this.accel.stop(); } catch (_e) {} this.accel = null; }
  },

  // 主动语音教练:显示 + TTS 播报(playTTS 优先,退回 Web speechSynthesis)
  speakCue(text) {
    this.setData({ coachLine: text });
    this.playCueTts(text);
  },

  playCueTts(text) {
    if (this.runSettings && this.runSettings.voiceCue === false) return;
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

  clearAutoBleTimer() {
    if (this.autoBleTimer) {
      clearTimeout(this.autoBleTimer);
      this.autoBleTimer = null;
    }
  },

  tick() {
    const s = this.session;
    if (!s) return;
    const now = Date.now();

    // 心率新鲜度:GATT 断连事件 + 8s 无 notify 双保险。
    // 设备停止广播/走出范围时 characteristicvaluechanged 只是"不再来",必须超时兜底,
    // 否则 HUD 永久显示冻结的旧心率,还会把它当"此刻"喂给 AI 教练。
    const hrFresh = this.lastHrAtMs != null && (now - this.lastHrAtMs) <= HR_STALE_MS;
    if (this.data.bleState === 'connected' && this.lastHrAtMs != null && !hrFresh) {
      this.onBleDropped();
    }
    const hrLive = this.data.bleState === 'connected' && hrFresh;

    // 传感器看门狗:构造成功但停止回调 → 降级仅计时,而不是永远显示 '--'。
    if (this.imuOk === true && this.accel && this.lastAccelAt != null
        && now - this.lastAccelAt > ACCEL_STALE_MS) {
      this.markImuUnavailable();
    }

    // 步频用眼镜 IMU 真实计步(无外设也能用),由「步频×步长」估算瞬时速度喂 RunSession
    //   → 复用其距离累加/配速逻辑。心率仅来自 BLE,无 BLE 时整列不显示。
    const cadence = this.stepDet ? this.stepDet.cadenceSpm(now) : 0;
    const strideM = this.runStrideM || DEFAULT_STRIDE_M;
    const speedKmh = cadence > 0 ? (cadence / 60) * strideM * 3.6 : 0;
    if (!s.paused) {
      s.onSpeed(speedKmh, now);
      s.onCadence(cadence);
    }

    const snap = s.snapshot(now);
    const hasHeartRate = hrLive && Number.isFinite(snap.bpm);
    const zone = hrZone(hasHeartRate ? snap.bpm : 0);
    // 配速只反映"此刻":暂停或静止(步频 0)时显示占位,不用全程平均冒充当前配速。
    const paceSec = snap.paused || cadence <= 0 ? null : paceSecPerKmFromKmh(speedKmh);

    // 双击退出确认超时回收:3 秒没按第二次就当没按过。
    let coachLine;
    if (this.exitArmedAt && now - this.exitArmedAt > EXIT_CONFIRM_MS) {
      this.exitArmedAt = null;
      if (this.data.coachLine === EXIT_CONFIRM_LINE) coachLine = '';
    }

    // 主动语音教练：里程碑 / 区间变化时不等提问就开口(并入本拍 setData,保持 1Hz 单次合并)
    if (!snap.paused && !this.exitArmedAt) {
      const cur = {
        distanceM: snap.distanceM, elapsedMs: snap.elapsedMs,
        zone, cadenceSpm: cadence, paceSecPerKm: paceSec,
      };
      const cue = nextProactiveCue(this.prevCue, cur);
      if (cue) { coachLine = cue; this.playCueTts(cue); }
      this.prevCue = cur;
    }

    const distVal = formatDistanceKm(snap.distanceM);
    const paceVal = formatPace(paceSec);
    const elapsedVal = formatElapsed(snap.elapsedMs);
    // 同一张跑步数据面板:无心率时不渲染心率位;眼镜自身始终给时间,传感器可用时估算步频/配速/距离。
    this.setData({
      bpm: hasHeartRate ? formatBpm(snap.bpm) : '',
      pace: paceVal,
      cadence: cadence > 0 ? String(cadence) : '--',
      elapsed: elapsedVal,
      distVal,
      paceMod: unifiedPaceMod(paceVal),
      distMod: unifiedDistMod(distVal),
      elapsedMod: unifiedElapsedMod(elapsedVal),
      gDistMod: glassesDistMod(distVal),
      gElapsedMod: glassesElapsedMod(elapsedVal),
      dot5: zone >= 5 ? 'dot dot-on' : 'dot',
      dot4: zone >= 4 ? 'dot dot-on' : 'dot',
      dot3: zone >= 3 ? 'dot dot-on' : 'dot',
      dot2: zone >= 2 ? 'dot dot-on' : 'dot',
      dot1: zone >= 1 ? 'dot dot-on' : 'dot',
      ...(coachLine !== undefined ? { coachLine } : {}),
      ...this.hudModeFields({ connected: hasHeartRate }),
    });

    // 把真实快照写进 storage,供 coach 页读取(带时间戳,教练只认 10s 内的"此刻")
    writeLiveSnapshot(wx, {
      bpm: snap.bpm, zone, paceSecPerKm: paceSec, cadenceSpm: cadence,
      distanceM: snap.distanceM, elapsedMs: snap.elapsedMs, paused: snap.paused,
    }, now);
  },

  // ── BLE 心率（官方 heart_rate 样例模式）───────────────────────
  // 进页自动尝试接入心率:已记住设备优先,6s 没扫到 → 静默进无蓝牙模式。
  // 若平台要求用户手势才能扫描(onLoad 无手势被拒),catch 静默降级,不打断单眼镜模式。
  async autoConnectBle() {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      return;  // 无 BLE 能力(如浏览器渲染)→ 无蓝牙模式
    }
    if (this.data.bleState !== 'idle') return;
    const preferred = readHeartRateDevice(wx);
    if (hasPreferredHeartRateDevice(preferred) && typeof navigator.bluetooth.getDevices === 'function') {
      const rememberedConnected = await this.tryRememberedBleDevice(preferred);
      if (rememberedConnected || this.data.bleState !== 'idle') return;
    }
    if (typeof navigator.bluetooth.scanDevices !== 'function') return;
    this.autoPicked = false;
    this.autoFallbackDevice = null;
    this.clearAutoBleTimer();
    this.setData({
      bleState: 'scanning',
      ...(this.data.running ? {} : { coachLine: '找心率设备' }),
    });
    try {
      const scan = await navigator.bluetooth.scanDevices({ filters: [{ services: ['heart_rate'] }] });
      this.scanSession = scan;
      scan.onDeviceFound((event) => {
        if (this.autoPicked) return;
        const device = event && event.device;
        if (!device) return;
        if (!this.autoFallbackDevice) this.autoFallbackDevice = device;
        if (!matchesHeartRateDevice(device, preferred)) return;
        this.autoPicked = true;
        // 命中已记住设备 → 连接并刷新记忆;没有首选时连第一个,但不自动写为首选
        //   (防止邻近跑者的心率带被永久记住;首选只在设备页显式配对时写入)。
        this.connectDevice(device, { remember: hasPreferredHeartRateDevice(preferred) });
      });
      this.autoBleTimer = setTimeout(() => {
        this.autoBleTimer = null;
        if (this.autoPicked || this.data.bleState !== 'scanning') return;
        if (this.autoFallbackDevice) {
          this.autoPicked = true;
          this.connectDevice(this.autoFallbackDevice, { remember: false });
          return;
        }
        this.stopScan();
        if (!this.data.running) this.setData({ coachLine: '用眼镜估算距离' });
      }, AUTO_BLE_TIMEOUT_MS);
    } catch (_e) {
      // 无设备权限 / 需手势被拒 → 静默降级,无蓝牙模式(距离仍走 IMU)
      this.scanSession = null;
      this.setData({
        bleState: 'idle',
        ...(this.data.running ? {} : { coachLine: '' }),
      });
    }
  },

  async tryRememberedBleDevice(preferred) {
    try {
      const devices = await navigator.bluetooth.getDevices();
      const device = devices && devices.find((d) => matchesHeartRateDevice(d, preferred));
      if (!device) return false;
      return await this.connectDevice(device, { remember: true });
    } catch (_e) {
      return false;
    }
  },

  async stopScan() {
    this.clearAutoBleTimer();
    if (this.scanSession) {
      try { await this.scanSession.stop(); } catch (_) {}
      this.scanSession = null;
    }
    if (this.data.bleState === 'scanning') {
      this.setData({ bleState: 'idle' });
    }
  },

  // 连一个心率设备 + 订阅 notify。remember=true 才写首选(已记住设备/设备页配对)。
  async connectDevice(device, opts = {}) {
    if (!device || this.data.bleState === 'connecting') return false;
    await this.stopScan();
    this.setData({ bleState: 'connecting' });
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic(HR_MEASUREMENT_UUID);
      const listener = () => {
        const m = parseHeartRateMeasurement(characteristic.value);
        if (!m) return;
        this.lastHrAtMs = Date.now();
        if (this.session) this.session.onHeartRate(m.bpm);
      };
      this.hrCharacteristic = characteristic;
      this.hrListener = listener;
      characteristic.addEventListener('characteristicvaluechanged', listener);
      await characteristic.startNotifications();
      this.bleDevice = device;
      this.lastHrAtMs = null;  // 心率列等第一个有效 notify 再出现
      // 设备主动断开(关机/走出范围)→ 立即静默回单眼镜,不等 8s 超时。
      if (typeof device.addEventListener === 'function') {
        this.bleDropListener = () => this.onBleDropped();
        device.addEventListener('gattserverdisconnected', this.bleDropListener);
      }
      if (opts.remember === true) writeHeartRateDevice(wx, device);

      this.setData({
        bleState: 'connected',
        ...(this.data.running ? {} : { coachLine: '心率已连接' }),
      });
      return true;
    } catch (e) {
      console.error('HR connect failed', e);
      this.teardownBle();
      this.setData({ bleState: 'idle' });
      return false;
    }
  },

  // 心率源没了(GATT 断连事件 / 8s 无数据):静默回单眼镜,跑步不中断。
  onBleDropped() {
    if (this.data.bleState !== 'connected' && this.data.bleState !== 'connecting') return;
    this.teardownBle();
    this.setData({
      bleState: 'idle',
      bpm: '',
      ...this.hudModeFields({ connected: false }),
    });
  },

  teardownBle() {
    this.clearAutoBleTimer();
    if (this.scanSession) { try { this.scanSession.stop(); } catch (_) {} }
    if (this.hrCharacteristic && this.hrListener) {
      try { this.hrCharacteristic.removeEventListener('characteristicvaluechanged', this.hrListener); } catch (_) {}
      try { this.hrCharacteristic.stopNotifications(); } catch (_) {}
    }
    if (this.bleDevice && this.bleDropListener
        && typeof this.bleDevice.removeEventListener === 'function') {
      try { this.bleDevice.removeEventListener('gattserverdisconnected', this.bleDropListener); } catch (_) {}
    }
    if (this.bleDevice && this.bleDevice.gatt) {
      try { this.bleDevice.gatt.disconnect(); } catch (_) {}
    }
    this.scanSession = null;
    this.hrCharacteristic = null;
    this.hrListener = null;
    this.bleDevice = null;
    this.bleDropListener = null;
    this.lastHrAtMs = null;
    this.autoFallbackDevice = null;
    this.autoPicked = false;
  },

  exitRunPage() {
    this.queueRunForUpload();
    this.stopTicker();
    this.stopAccel();
    this.clearAutoBleTimer();
    this.teardownBle();
    clearLiveSnapshot(wx);
    if (typeof wx.navigateBack === 'function') {
      wx.navigateBack({ delta: 1 });
      return;
    }
    if (typeof wx.redirectTo === 'function') wx.redirectTo({ url: '/pages/index/index' });
  },

  onKeyUp(event) {
    const code = event && event.code;
    if (code === 'Backspace') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      // 跑步中单键退出=整段数据蒸发,必须双击确认;非跑步态直接返回。
      if (this.data.running && this.session) {
        const now = Date.now();
        if (!this.exitArmedAt || now - this.exitArmedAt > EXIT_CONFIRM_MS) {
          this.exitArmedAt = now;
          this.setData({ coachLine: EXIT_CONFIRM_LINE });
          return;
        }
      }
      this.exitRunPage();
    }
  },
};
</script>

<page>
  <view class="hud-wrap">
  <card class="hud">
    <view class="hud-top">
      <image class="runner-logo" src="../../assets/smartrun-runner-48.png" mode="aspectFit" />
      <text class="{{ modeChipClass }}">{{ modeLabel }}</text>
    </view>

    <view class="unified-grid" ink:if="{{ showHeartRate }}">
      <view class="zone">
        <view class="{{ dot5 }}"></view>
        <view class="{{ dot4 }}"></view>
        <view class="{{ dot3 }}"></view>
        <view class="{{ dot2 }}"></view>
        <view class="{{ dot1 }}"></view>
      </view>
      <view class="run-metric run-hero">
        <text class="run-value run-value-hero">{{ bpm }}</text>
        <text class="metric-label">心率</text>
      </view>
      <view class="run-metric run-wide">
        <text class="run-value {{ paceMod }}">{{ pace }}</text>
        <text class="metric-label">配速</text>
      </view>
      <view class="run-metric">
        <text class="run-value">{{ cadence }}</text>
        <text class="metric-label">步频</text>
      </view>
      <view class="run-metric">
        <text class="run-value {{ distMod }}">{{ distVal }}</text>
        <text class="metric-label">距离</text>
      </view>
      <view class="run-metric run-wide">
        <text class="run-value {{ elapsedMod }}">{{ elapsed }}</text>
        <text class="metric-label">时长</text>
      </view>
    </view>

    <view class="glasses-grid" ink:else>
      <view class="run-metric run-main">
        <text class="run-value run-value-big">{{ pace }}</text>
        <text class="metric-label">配速</text>
      </view>
      <view class="run-metric">
        <text class="run-value run-value-big">{{ cadence }}</text>
        <text class="metric-label">步频</text>
      </view>
      <view class="run-metric">
        <text class="run-value run-value-big {{ gDistMod }}">{{ distVal }}</text>
        <text class="metric-label">距离</text>
      </view>
      <view class="run-metric run-main">
        <text class="run-value run-value-big {{ gElapsedMod }}">{{ elapsed }}</text>
        <text class="metric-label">时长</text>
      </view>
    </view>

    <view class="passive-footer">
      <text class="{{ footerClass }}">{{ coachLine ? coachLine : (paused ? '已暂停' : '节奏很好，保持') }}</text>
      <text class="footer-source">{{ sourceMain }}</text>
    </view>
  </card>
  </view>
</page>

<style>
.hud-wrap {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 150px;
}

.hud {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 150px;
  background-color: #000000;
  border: 2px solid var(--color-primary-60, rgba(64, 255, 94, 0.6));
  border-radius: 12px;
  padding: 5px 10px 4px;
}

.hud-top {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  margin-bottom: 3px;
}

.runner-logo {
  width: 26px;
  height: 26px;
}

.mode-chip {
  height: 24px;
  padding: 0 9px;
  border: 2px solid var(--color-primary-60, rgba(64, 255, 94, 0.6));
  border-radius: 12px;
  color: var(--color-primary, #40ff5e);
  font-size: 18px;
  line-height: 22px;
  font-weight: bold;
  background-color: var(--color-primary-08, rgba(64, 255, 94, 0.08));
}

.mode-muted {
  border-color: var(--color-primary-40, rgba(64, 255, 94, 0.4));
  color: var(--color-primary-60, rgba(64, 255, 94, 0.6));
  background-color: var(--color-primary-08, rgba(64, 255, 94, 0.08));
}

.unified-grid {
  display: grid;
  grid-template-columns: 16px 68px 82px 62px 88px 96px;
  column-gap: 5px;
  height: 76px;
  align-items: center;
}

.glasses-grid {
  display: grid;
  grid-template-columns: 112px 92px 96px 112px;
  column-gap: 5px;
  height: 76px;
  align-items: center;
}

.run-metric {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 76px;
  border: 2px solid var(--color-primary-40, rgba(64, 255, 94, 0.4));
  border-radius: 12px;
  background-color: #000000;
}

.run-hero {
  align-items: center;
  padding-left: 2px;
  border-left: 3px solid var(--color-primary, #40ff5e);
  background-color: var(--color-primary-08, rgba(64, 255, 94, 0.08));
}

.run-main {
  border-left: 3px solid var(--color-primary, #40ff5e);
  background-color: var(--color-primary-08, rgba(64, 255, 94, 0.08));
}

.run-value {
  color: var(--color-primary, #40ff5e);
  font-size: 28px;
  line-height: 32px;
  font-weight: bold;
  font-family: monospace;
  text-align: center;
}

.run-value-hero {
  font-size: 34px;
  line-height: 36px;
}

.run-value-big {
  font-size: 34px;
  line-height: 36px;
}

/* 长值降档:unified 基础 28px → 24/20;glasses 基础 34px → 28/24 */
.v-mid {
  font-size: 24px;
  line-height: 28px;
}

.v-sm {
  font-size: 20px;
  line-height: 24px;
}

.g-mid {
  font-size: 28px;
  line-height: 32px;
}

.g-sm {
  font-size: 24px;
  line-height: 28px;
}

.metric-label {
  color: var(--color-primary-60, rgba(64, 255, 94, 0.6));
  font-size: 18px;
  line-height: 20px;
  font-weight: bold;
  text-align: center;
}

.zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 76px;
}

.dot {
  width: 10px;
  height: 6px;
  margin-bottom: 5px;
  border-radius: 3px;
  background-color: var(--color-primary-40, rgba(64, 255, 94, 0.4));
}

.dot-on {
  width: 10px;
  background-color: var(--color-primary, #40ff5e);
}

.passive-footer {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 27px;
  margin-top: 4px;
  border-top: 1px solid var(--color-primary-40, rgba(64, 255, 94, 0.4));
}

.coach-line {
  color: var(--color-primary, #40ff5e);
  font-size: 20px;
  line-height: 26px;
  font-weight: bold;
}

.footer-source {
  color: var(--color-primary-60, rgba(64, 255, 94, 0.6));
  font-size: 18px;
  line-height: 24px;
  font-weight: bold;
}

.line-muted {
  color: var(--color-primary-60, rgba(64, 255, 94, 0.6));
}

</style>
