<script type="application/json" def>
{
  "navigationBarTitleText": "AISmartRun 设置",
  "description": "中文：设置跑步前的基础偏好，包括估算步长、自动接入心率、语音提示和记忆增强。\n\nEnglish: Configures basic running preferences, including estimated stride length, automatic heart-rate connection, voice cues and memory-assisted coaching.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "strideLabel": { "type": "string", "description": "中文：估算步长显示值。 English: Estimated stride length label." },
        "heartLabel": { "type": "string", "description": "中文：自动心率开关状态。 English: Automatic heart-rate setting state." },
        "voiceLabel": { "type": "string", "description": "中文：语音提示开关状态。 English: Voice cue setting state." },
        "memoryLabel": { "type": "string", "description": "中文：记忆增强开关状态。 English: Memory-assisted coaching state." }
      },
      "required": ["strideLabel", "heartLabel", "voiceLabel", "memoryLabel"]
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import {
  readRunSettings, writeRunSettings, nextStrideM, formatStrideM, formatSwitch,
} from '../../lib/settings.js';

const FOCUS_COUNT = 4;

function rowClass(index, focusIndex) {
  return index === focusIndex ? 'setting-row row-active' : 'setting-row';
}

export default {
  data: {
    strideM: 0.85,
    autoHeartRate: true,
    voiceCue: true,
    memoryContext: true,
    strideLabel: '0.85m',
    heartLabel: '开',
    voiceLabel: '开',
    memoryLabel: '开',
    statusText: '已保存',
    focusIndex: 0,
    rowStrideClass: 'setting-row row-active',
    rowHeartClass: 'setting-row',
    rowVoiceClass: 'setting-row',
    rowMemoryClass: 'setting-row',
  },

  onLoad() {
    this.applySettings(readRunSettings(wx), '已保存');
  },

  currentSettings() {
    return {
      strideM: this.data.strideM,
      autoHeartRate: this.data.autoHeartRate,
      voiceCue: this.data.voiceCue,
      memoryContext: this.data.memoryContext,
    };
  },

  applySettings(settings, statusText) {
    const focusIndex = this.data.focusIndex || 0;
    this.setData({
      ...settings,
      strideLabel: formatStrideM(settings.strideM),
      heartLabel: formatSwitch(settings.autoHeartRate),
      voiceLabel: formatSwitch(settings.voiceCue),
      memoryLabel: formatSwitch(settings.memoryContext),
      statusText,
      rowStrideClass: rowClass(0, focusIndex),
      rowHeartClass: rowClass(1, focusIndex),
      rowVoiceClass: rowClass(2, focusIndex),
      rowMemoryClass: rowClass(3, focusIndex),
    });
  },

  savePatch(patch) {
    const next = writeRunSettings(wx, { ...this.currentSettings(), ...patch });
    this.applySettings(next, '已保存');
  },

  cycleStride() {
    this.savePatch({ strideM: nextStrideM(this.data.strideM) });
  },

  toggleHeart() {
    this.savePatch({ autoHeartRate: !this.data.autoHeartRate });
  },

  toggleVoice() {
    this.savePatch({ voiceCue: !this.data.voiceCue });
  },

  toggleMemory() {
    this.savePatch({ memoryContext: !this.data.memoryContext });
  },

  moveFocus(delta) {
    const next = (this.data.focusIndex + delta + FOCUS_COUNT) % FOCUS_COUNT;
    this.setData({
      focusIndex: next,
      rowStrideClass: rowClass(0, next),
      rowHeartClass: rowClass(1, next),
      rowVoiceClass: rowClass(2, next),
      rowMemoryClass: rowClass(3, next),
    });
  },

  activateFocused() {
    switch (this.data.focusIndex) {
      case 0: this.cycleStride(); break;
      case 1: this.toggleHeart(); break;
      case 2: this.toggleVoice(); break;
      case 3: this.toggleMemory(); break;
      default: break;
    }
  },

  openRun() {
    if (typeof wx.redirectTo === 'function') {
      wx.redirectTo({ url: '/pages/run_hud/index' });
      return;
    }
    wx.navigateTo({ url: '/pages/run_hud/index' });
  },

  goBack() {
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
      this.goBack();
      return;
    }
    if (code === 'ArrowDown') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.moveFocus(1);
      return;
    }
    if (code === 'ArrowUp') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.moveFocus(-1);
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'GlobalHook') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.activateFocused();
    }
  },
};
</script>

<page>
  <view class="settings-wrap">
    <card class="settings-card">
      <view class="settings-top">
        <view class="title-row">
          <image class="runner-logo" src="../../assets/smartrun-runner-48.png" mode="aspectFit" />
          <text class="settings-title">设置</text>
        </view>
        <text class="status-chip">{{ statusText }}</text>
      </view>

      <view class="{{ rowStrideClass }}" bindtap="cycleStride">
        <text class="setting-name">步长</text>
        <text class="setting-value">{{ strideLabel }}</text>
      </view>
      <view class="{{ rowHeartClass }}" bindtap="toggleHeart">
        <text class="setting-name">自动心率</text>
        <text class="setting-value">{{ heartLabel }}</text>
      </view>
      <view class="{{ rowVoiceClass }}" bindtap="toggleVoice">
        <text class="setting-name">语音提示</text>
        <text class="setting-value">{{ voiceLabel }}</text>
      </view>
      <view class="{{ rowMemoryClass }}" bindtap="toggleMemory">
        <text class="setting-name">记忆增强</text>
        <text class="setting-value">{{ memoryLabel }}</text>
      </view>

      <view class="settings-footer">
        <text class="footer-note">跑前设置</text>
        <view class="run-action" bindtap="openRun">
          <text class="run-action-text">开跑</text>
        </view>
      </view>
    </card>
  </view>
</page>

<style>
.settings-wrap {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 300px;
}

.settings-card {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 300px;
  padding: 10px 12px;
  background-color: #000000;
  border: 2px solid var(--color-primary-60, rgba(64, 255, 94, 0.6));
  border-radius: 12px;
}

.settings-top {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  margin-bottom: 8px;
}

.title-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.runner-logo {
  width: 28px;
  height: 28px;
  margin-right: 8px;
}

.settings-title {
  color: var(--color-primary, #40ff5e);
  font-size: 30px;
  line-height: 32px;
  font-weight: bold;
  font-family: monospace;
}

.status-chip {
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

.setting-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: 43px;
  margin-bottom: 5px;
  padding: 0 12px;
  border: 2px solid var(--color-primary-40, rgba(64, 255, 94, 0.4));
  border-radius: 12px;
  background-color: #000000;
}

.row-active {
  border-width: 4px;
  background-color: var(--color-primary-08, rgba(64, 255, 94, 0.08));
}

.setting-name {
  color: var(--color-primary, #40ff5e);
  font-size: 24px;
  line-height: 30px;
  font-weight: bold;
}

.setting-value {
  color: var(--color-primary, #40ff5e);
  font-size: 26px;
  line-height: 30px;
  font-weight: bold;
  font-family: monospace;
}

.settings-footer {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  margin-top: 1px;
  border-top: 1px solid var(--color-primary-40, rgba(64, 255, 94, 0.4));
}

.footer-note {
  color: var(--color-primary-60, rgba(64, 255, 94, 0.6));
  font-size: 20px;
  line-height: 26px;
  font-weight: bold;
}

.run-action {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 96px;
  height: 32px;
  border: 3px solid var(--color-primary, #40ff5e);
  border-radius: 12px;
  background-color: #000000;
}

.run-action-text {
  color: var(--color-primary, #40ff5e);
  font-size: 24px;
  line-height: 28px;
  font-weight: bold;
}
</style>
