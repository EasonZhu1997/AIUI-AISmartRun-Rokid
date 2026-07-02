<script type="application/json" def>
{
  "navigationBarTitleText": "SmartRun HUD",
  "description": "跑步实时数据 HUD：心率、配速、步频、时长、距离与心率区间",
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
// Step 1：HUD 静态页 + 演示数据驱动。信息架构迁移自 FunpizzaSmartRun CXR-L
// 定版 HUD（RokidManager.buildRunningLayout）：上排大字 心率/配速/步频/时长，
// 下排小字 距离/时钟/状态，底部教练提示条，左侧心率区间 5 格点阵。
// Step 2 将把 demo ticker 换成 BLE(0x180D) 数据源，session/format 逻辑不变。
import { RunSession } from '../../lib/session.js';
import { hrZone } from '../../lib/hr.js';
import {
  formatElapsed, formatPace, paceSecPerKmFromKmh, formatDistanceKm, formatBpm,
} from '../../lib/format.js';

const TICK_MS = 1000;   // 官方性能约定：合并字段、1s 聚合一次 setData

function clockHHmm() {
  const d = new Date();
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getHours()}:${mm}`;
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
    sourceTag: '演示数据',
    coachLine: '● 等待开始运动',
    paused: false,
    running: false,
    dots: [
      { id: 5, cls: 'dot' }, { id: 4, cls: 'dot' }, { id: 3, cls: 'dot' },
      { id: 2, cls: 'dot' }, { id: 1, cls: 'dot' },
    ],
  },

  onUnload() { this.stopTicker(); },
  onHide() { this.stopTicker(); },
  onShow() { if (this.data.running && !this.timer) this.startTicker(); },

  toggleRun() {
    if (!this.data.running) {
      this.session = new RunSession(Date.now());
      this.demoPhase = 0;
      this.setData({ running: true, paused: false, coachLine: '' });
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
    this.session = null;
    this.setData({
      running: false, paused: false,
      bpm: '--', zoneCap: '心率 · bpm', pace: '--:--', cadence: '--',
      elapsed: '00:00', distance: '--',
      coachLine: '● 等待开始运动',
      dots: this.data.dots.map((d) => ({ id: d.id, cls: 'dot' })),
    });
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

    // —— 演示数据源（Step 2 起由 BLE 通知回调喂 s.onXxx，本段整体删除）——
    this.demoPhase = (this.demoPhase || 0) + 1;
    const wobble = Math.sin(this.demoPhase / 9);
    s.onSpeed(11.5 + wobble * 1.5, now);
    s.onHeartRate(Math.round(148 + wobble * 14));
    s.onCadence(Math.round(176 + wobble * 6));
    // ————————————————————————————————————————————

    const snap = s.snapshot(now);
    const zone = hrZone(snap.bpm ?? 0);
    const paceSec = snap.paused ? null
      : paceSecPerKmFromKmh(11.5 + wobble * 1.5) ?? snap.avgPaceSecPerKm;

    this.setData({
      bpm: formatBpm(snap.bpm),
      zoneCap: zone > 0 ? `心率 Z${zone} · bpm` : '心率 · bpm',
      pace: formatPace(paceSec),
      cadence: snap.cadenceSpm != null ? String(snap.cadenceSpm) : '--',
      elapsed: formatElapsed(snap.elapsedMs),
      distance: formatDistanceKm(snap.distanceM),
      clock: clockHHmm(),
      dots: this.data.dots.map((d) => ({
        id: d.id, cls: d.id <= zone ? 'dot dot-on' : 'dot',
      })),
    });
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

    <text ink:if="{{ coachLine }}" class="coach">{{ coachLine }}</text>

    <view class="controls">
      <button class="btn-primary" bindtap="toggleRun">
        {{ !running ? '开始' : (paused ? '继续' : '暂停') }}
      </button>
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
  min-width: 120px;
  padding: 8px 12px;
  text-align: center;
  color: #031106;
  background-color: var(--color-primary, #40ff5e);
  border-radius: var(--radius-md, 12px);
  font-weight: bold;
}

.btn-ghost {
  min-width: 100px;
  padding: 8px 12px;
  margin-left: 10px;
  text-align: center;
  color: #b9ccc0;
  background-color: #0d1510;
  border: 1px solid #223529;
  border-radius: var(--radius-md, 12px);
}
</style>
