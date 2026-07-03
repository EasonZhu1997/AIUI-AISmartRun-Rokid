<script type="application/json" def>
{
  "navigationBarTitleText": "SmartRun",
  "description": "SmartRun 起跑页：选数据源（蓝牙心率/无蓝牙）和场景（户外/室内原地），点开始跑步直接进 HUD 自动开跑",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "src": { "type": "string", "description": "数据源：ble=蓝牙心率, imu=无蓝牙(眼镜IMU计步)" },
        "scene": { "type": "string", "description": "场景：out=户外跑, in=室内原地(超慢跑口径)" }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { MODE_STORAGE_KEY, normalizeMode, defaultMode } from '../../lib/modes.js';

// 参考 -L APK WorkoutTypes:室内/室外是横切维度。眼镜端只保留两组必选项,
// 文案全部超短(跑者没时间读)。可点控件一律 view+text(button 文字渲染不稳)。
export default {
  data: {
    src: 'imu',
    scene: 'out',
  },

  onLoad() {
    let saved = null;
    try { saved = wx.getStorageSync(MODE_STORAGE_KEY); } catch (_e) {}
    const m = normalizeMode(saved || defaultMode());
    this.setData({ src: m.src, scene: m.scene });
  },

  saveMode() {
    try {
      wx.setStorageSync(MODE_STORAGE_KEY, { src: this.data.src, scene: this.data.scene });
    } catch (_e) {}
  },

  pickBle() { this.setData({ src: 'ble' }); this.saveMode(); },
  pickImu() { this.setData({ src: 'imu' }); this.saveMode(); },
  pickOut() { this.setData({ scene: 'out' }); this.saveMode(); },
  pickIn() { this.setData({ scene: 'in' }); this.saveMode(); },

  startRun() {
    this.saveMode();
    wx.navigateTo({ url: '/pages/run_hud/index' });
  },

  openCoach() {
    wx.navigateTo({ url: '/pages/coach/index' });
  },
};
</script>

<page>
  <view class="container">
    <view class="head-row">
      <text class="title">SmartRun</text>
      <text class="subtitle">AI 跑步教练</text>
    </view>

    <view class="opt-row">
      <text class="opt-label">数据源</text>
      <view class="chip {{ src === 'ble' ? 'chip-on' : '' }}" bindtap="pickBle">
        <text class="chip-txt {{ src === 'ble' ? 'chip-txt-on' : '' }}">蓝牙心率</text>
      </view>
      <view class="chip {{ src === 'imu' ? 'chip-on' : '' }}" bindtap="pickImu">
        <text class="chip-txt {{ src === 'imu' ? 'chip-txt-on' : '' }}">无蓝牙</text>
      </view>
    </view>

    <view class="opt-row">
      <text class="opt-label">场景</text>
      <view class="chip {{ scene === 'out' ? 'chip-on' : '' }}" bindtap="pickOut">
        <text class="chip-txt {{ scene === 'out' ? 'chip-txt-on' : '' }}">户外跑</text>
      </view>
      <view class="chip {{ scene === 'in' ? 'chip-on' : '' }}" bindtap="pickIn">
        <text class="chip-txt {{ scene === 'in' ? 'chip-txt-on' : '' }}">室内原地</text>
      </view>
    </view>

    <view class="cta-row">
      <view class="cta" bindtap="startRun">
        <text class="cta-txt">开始跑步</text>
      </view>
      <view class="cta-ghost" bindtap="openCoach">
        <text class="cta-ghost-txt">问教练</text>
      </view>
    </view>
  </view>
</page>

<style>
.container {
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  background-color: #000000;
  border: 2px solid #143a20;
  border-radius: var(--radius-md, 12px);
}

.head-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.title {
  color: var(--color-primary, #40ff5e);
  font-size: 20px;
  line-height: 24px;
  font-weight: bold;
}

.subtitle {
  color: #8fe0a0;
  font-size: 11px;
  line-height: 15px;
  margin-left: 8px;
}

.opt-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
}

.opt-label {
  color: #73a785;
  font-size: 11px;
  line-height: 15px;
  width: 44px;
}

.chip {
  min-width: 88px;
  padding: 5px 10px;
  margin-left: 8px;
  background-color: #0d1510;
  border: 1px solid #24452f;
  border-radius: var(--radius-md, 12px);
}

.chip-on {
  background-color: #143a20;
  border: 1px solid var(--color-primary, #40ff5e);
}

.chip-txt {
  color: #73a785;
  font-size: 13px;
  line-height: 17px;
  text-align: center;
}

.chip-txt-on {
  color: var(--color-primary, #40ff5e);
  font-weight: bold;
}

.cta-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-top: 10px;
}

.cta {
  min-width: 132px;
  padding: 8px 14px;
  background-color: var(--color-primary, #40ff5e);
  border-radius: var(--radius-md, 12px);
}

.cta-txt {
  color: #031106;
  font-size: 15px;
  line-height: 19px;
  font-weight: bold;
  text-align: center;
}

.cta-ghost {
  min-width: 88px;
  padding: 8px 14px;
  margin-left: 10px;
  background-color: #132117;
  border: 1px solid #24452f;
  border-radius: var(--radius-md, 12px);
}

.cta-ghost-txt {
  color: #8dffab;
  font-size: 14px;
  line-height: 18px;
  text-align: center;
}
</style>
