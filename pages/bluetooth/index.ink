<script type="application/json" def>
{
  "navigationBarTitleText": "AISmartRun 设备",
  "description": "中文：搜索并记住标准蓝牙心率设备，控制自动心率开关；跑步页开跑后会优先连接已记住的设备。\n\nEnglish: Searches and remembers a standard Bluetooth heart-rate device and controls the automatic heart-rate switch; after a run starts, the run page prefers the remembered device.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "statusText": { "type": "string", "description": "中文：设备页当前状态。 English: Current device page status." },
        "savedLabel": { "type": "string", "description": "中文：首选心率设备显示名。 English: Preferred heart-rate device label." },
        "scanLabel": { "type": "string", "description": "中文：搜索动作状态。 English: Search action state." },
        "autoLabel": { "type": "string", "description": "中文：自动心率开关。 English: Automatic heart-rate switch state." },
        "deviceNote": { "type": "string", "description": "中文：设备搜索结果提示。 English: Device search result note." }
      },
      "required": ["statusText", "savedLabel", "scanLabel", "autoLabel", "deviceNote"]
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { classifyDevice } from '../../lib/registry.js';
import { readRunSettings, writeRunSettings, formatSwitch } from '../../lib/settings.js';
import {
  clearHeartRateDevice,
  deviceDisplayName,
  hasPreferredHeartRateDevice,
  heartRateDeviceLabel,
  readHeartRateDevice,
  writeHeartRateDevice,
} from '../../lib/devices.js';

const SEARCH_TIMEOUT_MS = 8000;
const FOCUS_COUNT = 4;

function rowClass(index, focusIndex) {
  return index === focusIndex ? 'device-row row-active' : 'device-row';
}

function eventServiceUuids(event) {
  const device = event && event.device;
  const fromDevice = device && (device.uuids || device.serviceUuids || device.advertisedServices);
  const fromEvent = event && (event.uuids || event.serviceUuids || event.advertisedServices);
  const fromAd = event && event.advertisementData && event.advertisementData.serviceUuids;
  return fromDevice || fromEvent || fromAd || ['heart_rate'];
}

export default {
  data: {
    statusText: '设备',
    savedLabel: '自动选择',
    scanLabel: '扫描',
    autoLabel: '开',
    forgetLabel: '无',
    deviceNote: '未搜索',
    focusIndex: 1,
    rowSavedClass: 'device-row',
    rowScanClass: 'device-row row-active',
    rowAutoClass: 'device-row',
    rowForgetClass: 'device-row',
    bleState: 'idle',
  },

  onLoad() {
    this.applyStoredState('设备');
  },

  onUnload() {
    this.cleanupDevicePage();
  },

  onHide() {
    this.cleanupDevicePage();
  },

  applyStoredState(statusText) {
    const settings = readRunSettings(wx);
    const device = readHeartRateDevice(wx);
    const hasDevice = hasPreferredHeartRateDevice(device);
    const focusIndex = this.data.focusIndex || 0;
    this.setData({
      statusText,
      savedLabel: heartRateDeviceLabel(device),
      autoLabel: formatSwitch(settings.autoHeartRate),
      forgetLabel: hasDevice ? '清除' : '无',
      rowSavedClass: rowClass(0, focusIndex),
      rowScanClass: rowClass(1, focusIndex),
      rowAutoClass: rowClass(2, focusIndex),
      rowForgetClass: rowClass(3, focusIndex),
    });
  },

  moveFocus(delta) {
    const next = (this.data.focusIndex + delta + FOCUS_COUNT) % FOCUS_COUNT;
    this.setData({
      focusIndex: next,
      rowSavedClass: rowClass(0, next),
      rowScanClass: rowClass(1, next),
      rowAutoClass: rowClass(2, next),
      rowForgetClass: rowClass(3, next),
    });
  },

  clearSearchTimer() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  },

  async stopScan(keepStatus = false) {
    this.clearSearchTimer();
    if (this.scanSession) {
      try { await this.scanSession.stop(); } catch (_e) {}
      this.scanSession = null;
    }
    if (this.data.bleState === 'scanning') {
      this.setData({
        bleState: 'idle',
        scanLabel: '扫描',
        statusText: keepStatus ? this.data.statusText : '设备',
      });
    }
  },

  async disconnectDevice() {
    try {
      if (this.connectedDevice && this.connectedDevice.gatt) {
        await this.connectedDevice.gatt.disconnect();
      }
    } catch (_e) {}
    this.connectedDevice = null;
  },

  async cleanupDevicePage() {
    await this.stopScan(true);
    await this.disconnectDevice();
  },

  async toggleScan() {
    if (this.data.bleState === 'scanning') {
      await this.stopScan();
      this.setData({ deviceNote: '已停止' });
      return;
    }
    await this.startScan();
  },

  selectPreferredDevice() {
    if (this.foundDevice) {
      this.connectDevice(this.foundDevice);
      return;
    }
    this.startScan();
  },

  async startScan() {
    if (typeof navigator === 'undefined' || !navigator.bluetooth
        || (typeof navigator.bluetooth.scanDevices !== 'function'
          && typeof navigator.bluetooth.getDevices !== 'function')) {
      this.setData({
        statusText: '不可用',
        scanLabel: '扫描',
        deviceNote: '单眼镜可跑',
      });
      return;
    }
    await this.stopScan(true);
    this.foundDevice = null;
    if (typeof navigator.bluetooth.getDevices === 'function') {
      const rememberedConnected = await this.tryRememberedDevice();
      if (rememberedConnected || this.data.bleState !== 'idle') return;
    }
    if (typeof navigator.bluetooth.scanDevices !== 'function') {
      this.setData({
        statusText: '不可用',
        scanLabel: '扫描',
        deviceNote: '需要授权',
      });
      return;
    }
    this.setData({
      bleState: 'scanning',
      statusText: '扫描中',
      scanLabel: '停止',
      deviceNote: '搜索心率',
    });
    try {
      const scan = await navigator.bluetooth.scanDevices({
        filters: [{ services: ['heart_rate'] }],
      });
      this.scanSession = scan;
      scan.onDeviceFound((event) => {
        if (this.foundDevice || this.data.bleState !== 'scanning') return;
        const device = event && event.device;
        const info = classifyDevice(eventServiceUuids(event), device && device.name);
        if (!device || !info.supported || info.capabilities.indexOf('heartRate') < 0) {
          this.setData({ statusText: '不支持', deviceNote: '非标准心率' });
          return;
        }
        this.foundDevice = device;
        this.setData({
          statusText: '发现设备',
          savedLabel: deviceDisplayName(device),
          deviceNote: '连接中',
        });
        this.connectDevice(device);
      });
      this.searchTimer = setTimeout(() => {
        this.searchTimer = null;
        if (!this.foundDevice && this.data.bleState === 'scanning') {
          this.stopScan();
          this.setData({
            statusText: '未发现',
            scanLabel: '扫描',
            deviceNote: '靠近心率设备',
          });
        }
      }, SEARCH_TIMEOUT_MS);
    } catch (_e) {
      this.scanSession = null;
      this.setData({
        bleState: 'idle',
        statusText: '扫描失败',
        scanLabel: '扫描',
        deviceNote: '需要手势',
      });
    }
  },

  async tryRememberedDevice() {
    const preferred = readHeartRateDevice(wx);
    if (!hasPreferredHeartRateDevice(preferred)) return false;
    try {
      const devices = await navigator.bluetooth.getDevices();
      const device = devices && devices.find((d) => (
        d && (d.id === preferred.deviceId || deviceDisplayName(d) === preferred.deviceName)
      ));
      if (!device) return false;
      this.setData({
        statusText: '已授权',
        savedLabel: deviceDisplayName(device),
        deviceNote: '连接已记住',
      });
      return await this.connectDevice(device);
    } catch (_e) {
      return false;
    }
  },

  async connectDevice(device) {
    if (!device || this.data.bleState === 'connecting') return false;
    await this.stopScan(true);
    this.setData({
      bleState: 'connecting',
      statusText: '连接中',
      scanLabel: '扫描',
      deviceNote: '验证心率',
    });
    try {
      const server = await device.gatt.connect();
      await server.getPrimaryService('heart_rate');
      this.connectedDevice = device;
      const saved = writeHeartRateDevice(wx, device);
      this.setData({
        bleState: 'connected',
        statusText: '已记住',
        savedLabel: heartRateDeviceLabel(saved),
        forgetLabel: '清除',
        deviceNote: '首页优先连接',
      });
      return true;
    } catch (_e) {
      this.connectedDevice = null;
      this.setData({
        bleState: 'idle',
        statusText: '连接失败',
        scanLabel: '扫描',
        deviceNote: '可重试',
      });
      return false;
    }
  },

  toggleAutoHeart() {
    const settings = readRunSettings(wx);
    const next = writeRunSettings(wx, {
      ...settings,
      autoHeartRate: !settings.autoHeartRate,
    });
    if (!next.autoHeartRate) this.stopScan();
    this.setData({
      autoLabel: formatSwitch(next.autoHeartRate),
      statusText: '已保存',
      deviceNote: next.autoHeartRate ? '自动心率开' : '自动心率关',
    });
  },

  async forgetDevice() {
    await this.disconnectDevice();
    clearHeartRateDevice(wx);
    this.foundDevice = null;
    this.setData({
      statusText: '已清除',
      savedLabel: '自动选择',
      forgetLabel: '无',
      deviceNote: '不指定设备',
    });
  },

  activateFocused() {
    switch (this.data.focusIndex) {
      case 0:
        if (this.foundDevice) this.connectDevice(this.foundDevice);
        else this.startScan();
        break;
      case 1:
        this.toggleScan();
        break;
      case 2:
        this.toggleAutoHeart();
        break;
      case 3:
        this.forgetDevice();
        break;
      default:
        break;
    }
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  openRun() {
    if (typeof wx.redirectTo === 'function') {
      wx.redirectTo({ url: '/pages/run_hud/index' });
      return;
    }
    wx.navigateTo({ url: '/pages/run_hud/index' });
  },

  goBack() {
    this.cleanupDevicePage();
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
    if (code === 'ArrowDown' || code === 'ArrowRight') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.moveFocus(1);
      return;
    }
    if (code === 'ArrowUp' || code === 'ArrowLeft') {
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
  <view class="device-wrap">
    <card class="device-card" role="group">
      <view class="device-top">
        <view class="title-row">
          <image class="runner-logo" src="../../assets/smartrun-runner-48.png" mode="aspectFit" />
          <text class="device-title">设备</text>
        </view>
        <text class="status-chip">{{ statusText }}</text>
      </view>

      <view class="device-list" role="navigation">
        <button class="{{ rowSavedClass }}" bindtap="selectPreferredDevice" tabindex="0">
          <text class="setting-name">首选心率</text>
          <text class="setting-value">{{ savedLabel }}</text>
        </button>
        <button class="{{ rowScanClass }}" bindtap="toggleScan" tabindex="1">
          <text class="setting-name">搜索设备</text>
          <text class="setting-value">{{ scanLabel }}</text>
        </button>
        <button class="{{ rowAutoClass }}" bindtap="toggleAutoHeart" tabindex="2">
          <text class="setting-name">自动心率</text>
          <text class="setting-value">{{ autoLabel }}</text>
        </button>
        <button class="{{ rowForgetClass }}" bindtap="forgetDevice" tabindex="3">
          <text class="setting-name">忘记设备</text>
          <text class="setting-value">{{ forgetLabel }}</text>
        </button>
      </view>

      <view class="device-footer">
        <text class="footer-note">{{ deviceNote }}</text>
        <view class="actions" role="navigation">
          <button class="footer-action" bindtap="openSettings" tabindex="4">
            <text class="action-text">设置</text>
          </button>
          <button class="footer-action action-primary" bindtap="openRun" tabindex="5">
            <text class="action-text">开跑</text>
          </button>
        </view>
      </view>
    </card>
  </view>
</page>

<style>
.device-wrap {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 300px;
}

.device-card {
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

.device-top {
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

.device-title {
  color: var(--color-primary, #40ff5e);
  font-size: 30px;
  line-height: 32px;
  font-weight: bold;
  font-family: monospace;
}

.device-list {
  display: flex;
  flex-direction: column;
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

.device-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  padding: 0 12px;
  height: 43px;
  margin-bottom: 5px;
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
  text-align: right;
}

.device-footer {
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

.actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.footer-action {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;
  width: 86px;
  height: 32px;
  border: 2px solid var(--color-primary-60, rgba(64, 255, 94, 0.6));
  border-radius: 12px;
}

.action-primary {
  width: 96px;
  border-width: 4px;
  border-color: var(--color-primary, #40ff5e);
  background-color: var(--color-primary-08, rgba(64, 255, 94, 0.08));
}

.action-text {
  color: var(--color-primary, #40ff5e);
  font-size: 22px;
  line-height: 28px;
  font-weight: bold;
}
</style>
