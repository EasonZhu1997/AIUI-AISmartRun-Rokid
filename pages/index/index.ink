<script type="application/json" def>
{
  "navigationBarTitleText": "AISmartRun",
  "description": "中文：AISmartRun 是 Rokid 眼镜上的跑步助手。首页显示单眼镜就绪和心率设备状态；点开跑后由跑步页自动接入已记住的心率设备。\n\nEnglish: AISmartRun is a running assistant for Rokid glasses. The home page shows glasses-ready and heart-rate device states; after starting a run, the run page automatically connects the remembered heart-rate device.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "statusText": { "type": "string", "description": "中文：首页总体状态。 English: Overall home status." },
        "heartLabel": { "type": "string", "description": "中文：心率设备状态。 English: Heart-rate device state." },
        "primaryClass": { "type": "string", "description": "中文：开跑动作样式。 English: Start-run action style." },
        "deviceClass": { "type": "string", "description": "中文：设备动作样式。 English: Device action style." }
      },
      "required": ["statusText", "heartLabel", "primaryClass", "deviceClass"]
    }
  }
}
</script>

<script setup>
// 正式首页:只做"就绪陈述",不建立蓝牙连接。
//   旧方案首页先连上心率显示"已接入",点开跑时又必须断开、由 HUD 重扫重连 ——
//   首页承诺与跑步页实际状态直接矛盾,还白耗一次连接。现在首页只读设置与
//   已记住设备给出诚实状态;真正的扫描/连接在开跑后由 run_hud 完成(已记住设备优先)。
import wx from 'wx';
import { readRunSettings } from '../../lib/settings.js';
import {
  hasPreferredHeartRateDevice,
  heartRateDeviceLabel,
  readHeartRateDevice,
} from '../../lib/devices.js';
import {
  resolveCoachBackendConfig, buildAnonLoginRequest, parseAnonLoginResponse,
  COACH_TOKEN_STORAGE_KEY,
} from '../../lib/coach_api.js';
import {
  readPendingRunUploads, writePendingRunUploads,
  buildRunUploadRequest, parseRunUploadResponse,
} from '../../lib/run_upload.js';

const UPLOAD_TIMEOUT_MS = 2500;   // 补传是后台行为,不许拖慢首页

function actionClass(index, focusIndex) {
  return index === focusIndex ? 'action action-primary' : 'action';
}

export default {
  data: {
    statusText: '已就绪',
    heartLabel: '待配对',
    glassesLabel: '已就绪',
    helperText: '无心率也可开跑',
    focusIndex: 1,
    primaryClass: 'action action-primary',
    deviceClass: 'action',
    dot1: 'dot dot-on',
    dot2: 'dot',
    dot3: 'dot',
  },

  onLoad() {
    this.refreshHeartReadiness();
    // 静默补传跑步记录(best-effort,不 await、不影响首页任何交互):
    // run_hud 退出时只入队,真正的网络发送收敛在这里 —— 页面存活期内完成更可靠。
    this.flushRunUploads();
  },

  onShow() {
    // 从设备页/设置页回来时刷新:首选设备和自动心率开关可能刚改过。
    this.refreshHeartReadiness();
    // 跑完退出走 navigateBack 回到的是已存在的首页实例(只触发 onShow 不触发 onLoad),
    // 补传必须也挂在这里,否则新跑完的记录要等下次冷启动才发。
    this.flushRunUploads();
  },

  // ── 跑步记录补传(source="aiui" 落后端 runs 表,复用 APK 生态跑后管线)──
  wxRequest(req) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      const timer = setTimeout(() => finish(null), UPLOAD_TIMEOUT_MS);
      try {
        wx.request({
          ...req,
          success: (r) => { clearTimeout(timer); finish(r); },
          fail: () => { clearTimeout(timer); finish(null); },
        });
      } catch (_e) { clearTimeout(timer); finish(null); }
    });
  },

  // 与教练页同一个稳定匿名设备 ID(同 key 'smartrun_device_id'):
  // 生成后写回 storage,不会每次补传都在后端注册新匿名用户。
  ensureDeviceId() {
    if (this.deviceIdCache) return this.deviceIdCache;
    let id = '';
    try { id = wx.getStorageSync('smartrun_device_id') || ''; } catch (_e) {}
    if (!id) {
      id = 'aiui-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      try { wx.setStorageSync('smartrun_device_id', id); } catch (_e) {}
    }
    this.deviceIdCache = id;
    return id;
  },

  // 复用教练页同一枚匿名 JWT;无 coach_app_key(后端链路未开通)则不发登录请求。
  async ensureUploadToken(config) {
    let token = '';
    try { token = wx.getStorageSync(COACH_TOKEN_STORAGE_KEY) || ''; } catch (_e) {}
    if (token) return token;
    if (!config.appKey) return '';
    const resp = await this.wxRequest(buildAnonLoginRequest({
      baseUrl: config.baseUrl,
      clientId: config.clientId,
      appKey: config.appKey,
      deviceId: this.ensureDeviceId(),
    }));
    const t = parseAnonLoginResponse(resp);
    if (t) { try { wx.setStorageSync(COACH_TOKEN_STORAGE_KEY, t); } catch (_e) {} }
    return t || '';
  },

  async flushRunUploads() {
    if (this.flushingUploads) return;   // onLoad+onShow 双触发/快速切页:防并发重复上传
    this.flushingUploads = true;
    try {
      const pending = readPendingRunUploads(wx);
      if (!pending.length) return;
      const config = resolveCoachBackendConfig(wx);
      const token = await this.ensureUploadToken(config);
      if (!token) return;   // 无 key / 登录失败:队列保留(cap 5),下次进首页再试
      const remain = [];
      for (let i = 0; i < pending.length; i += 1) {
        const resp = await this.wxRequest(buildRunUploadRequest({
          baseUrl: config.baseUrl, token, payload: pending[i],
        }));
        if (resp && resp.statusCode === 401) {
          // token 过期:清掉,本条与其余保留,下次重新直登再传
          try { wx.removeStorageSync(COACH_TOKEN_STORAGE_KEY); } catch (_e) {}
          remain.push(...pending.slice(i));
          break;
        }
        if (!parseRunUploadResponse(resp)) remain.push(pending[i]);
      }
      writePendingRunUploads(wx, remain);
    } finally {
      this.flushingUploads = false;
    }
  },

  // 心率就绪状态(不连接,只陈述):
  //   自动心率关 → 已关闭;宿主无蓝牙 → 不可用;有已记住设备 → 已记住(开跑自动连);
  //   无已记住设备 → 待配对(去设备页配对一次)。
  refreshHeartReadiness() {
    this.updateFocus(this.data.focusIndex);
    const settings = readRunSettings(wx);
    if (settings.autoHeartRate === false) {
      this.setData({
        statusText: '已就绪',
        heartLabel: '已关闭',
        helperText: '单眼镜模式开跑',
        dot1: 'dot dot-on', dot2: 'dot', dot3: 'dot',
      });
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      this.setData({
        statusText: '已就绪',
        heartLabel: '不可用',
        helperText: '单眼镜可跑',
        dot1: 'dot dot-on', dot2: 'dot', dot3: 'dot',
      });
      return;
    }
    const preferred = readHeartRateDevice(wx);
    if (hasPreferredHeartRateDevice(preferred)) {
      this.setData({
        statusText: '已就绪',
        heartLabel: heartRateDeviceLabel(preferred),
        helperText: '开跑自动连',
        dot1: 'dot dot-on', dot2: 'dot dot-on', dot3: 'dot',
      });
      return;
    }
    this.setData({
      statusText: '已就绪',
      heartLabel: '待配对',
      helperText: '设备页可配对',
      dot1: 'dot dot-on', dot2: 'dot', dot3: 'dot',
    });
  },

  updateFocus(index) {
    this.setData({
      focusIndex: index,
      deviceClass: actionClass(0, index),
      primaryClass: actionClass(1, index),
    });
  },

  openRun() {
    wx.navigateTo({ url: '/pages/run_hud/index' });
  },

  openBluetooth() {
    wx.navigateTo({ url: '/pages/bluetooth/index' });
  },

  exitApp() {
    if (typeof wx.exitMiniProgram === 'function') wx.exitMiniProgram();
  },

  activateFocused() {
    if (this.data.focusIndex === 0) {
      this.openBluetooth();
      return;
    }
    this.openRun();
  },

  onKeyUp(event) {
    const code = event && event.code;
    if (code === 'Backspace') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.exitApp();
      return;
    }
    if (code === 'ArrowLeft' || code === 'ArrowUp') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.updateFocus(0);
      return;
    }
    if (code === 'ArrowRight' || code === 'ArrowDown') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.updateFocus(1);
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'GlobalHook') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.activateFocused();
    }
  },

  // 首页语音唤醒 = 直接开跑:与"一键开跑"主线一致;想问教练在教练页语音唤醒。
  onVoiceWakeup() {
    this.openRun();
  },
};
</script>

<page>
  <view class="home-wrap">
    <card class="home-card" role="group">
      <view class="home-top">
        <view class="brand-row">
          <image class="runner-logo" src="../../assets/smartrun-runner-48.png" mode="aspectFit" />
          <text class="brand">AISmartRun</text>
        </view>
        <text class="status-chip">{{ statusText }}</text>
      </view>

      <view class="mode-strip">
        <view class="mode-copy">
          <text class="ready-main">自由跑</text>
          <text class="ready-sub">{{ helperText }}</text>
        </view>
        <view class="wait-dots">
          <view class="{{ dot1 }}"></view>
          <view class="{{ dot2 }}"></view>
          <view class="{{ dot3 }}"></view>
        </view>
      </view>

      <view class="device-panel">
        <view class="device-row">
          <text class="device-name">单眼镜</text>
          <text class="device-state">{{ glassesLabel }}</text>
        </view>
        <view class="device-row">
          <text class="device-name">心率</text>
          <text class="device-state muted">{{ heartLabel }}</text>
        </view>
      </view>

      <view class="actions" role="navigation">
        <view class="action-slot">
          <button class="{{ deviceClass }}" bindtap="openBluetooth" tabindex="0">
            <text class="action-text">设备</text>
          </button>
        </view>
        <view class="action-slot action-slot-last">
          <button class="{{ primaryClass }}" bindtap="openRun" tabindex="1">
            <text class="action-text">开跑</text>
          </button>
        </view>
      </view>
    </card>
  </view>
</page>

<style>
.home-wrap {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 228px;
}

.home-card {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 228px;
  padding: 10px 12px;
  background-color: #000000;
  border: 2px solid var(--color-primary-60, rgba(64, 255, 94, 0.6));
  border-radius: 12px;
}

.home-top {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  margin-bottom: 8px;
}

.brand-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.runner-logo {
  width: 28px;
  height: 28px;
  margin-right: 8px;
}

.brand {
  color: var(--color-primary, #40ff5e);
  font-size: 28px;
  line-height: 30px;
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

.mode-strip {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: 42px;
  margin-bottom: 8px;
  padding: 0 12px;
  border: 2px solid var(--color-primary-60, rgba(64, 255, 94, 0.6));
  border-radius: 12px;
  background-color: var(--color-primary-08, rgba(64, 255, 94, 0.08));
}

.mode-copy {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.ready-main {
  color: var(--color-primary, #40ff5e);
  font-size: 28px;
  line-height: 34px;
  font-weight: bold;
  font-family: monospace;
  margin-right: 12px;
}

.ready-sub {
  color: var(--color-primary-60, rgba(64, 255, 94, 0.6));
  font-size: 18px;
  line-height: 24px;
  font-weight: bold;
}

.device-panel {
  display: flex;
  flex-direction: column;
  height: 74px;
  margin-bottom: 8px;
}

.device-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: 34px;
  margin-bottom: 6px;
  padding: 0 12px;
  border: 2px solid var(--color-primary-40, rgba(64, 255, 94, 0.4));
  border-radius: 12px;
  background-color: #000000;
}

.device-name,
.device-state {
  color: var(--color-primary, #40ff5e);
  font-size: 22px;
  line-height: 28px;
  font-weight: bold;
}

.muted {
  color: var(--color-primary-60, rgba(64, 255, 94, 0.6));
}

.wait-dots {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.dot {
  width: 8px;
  height: 8px;
  margin-left: 5px;
  border-radius: 4px;
  background-color: var(--color-primary-40, rgba(64, 255, 94, 0.4));
}

.dot-on {
  background-color: var(--color-primary, #40ff5e);
}

.actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 38px;
}

.action-slot {
  display: flex;
  width: 50%;
  box-sizing: border-box;
  padding-right: 5px;
}

.action-slot-last {
  padding-right: 0;
  padding-left: 5px;
}

.action {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;
  width: 100%;
  height: 38px;
  border: 2px solid var(--color-primary-60, rgba(64, 255, 94, 0.6));
  border-radius: 12px;
  background-color: #000000;
}

.action-primary {
  border-width: 3px;
  border-color: var(--color-primary, #40ff5e);
  background-color: var(--color-primary-08, rgba(64, 255, 94, 0.08));
}

.action-text {
  color: var(--color-primary, #40ff5e);
  font-size: 24px;
  line-height: 30px;
  font-weight: bold;
}
</style>
