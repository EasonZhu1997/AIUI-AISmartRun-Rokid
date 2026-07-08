// .ink 页面脚本加载器:把 <script setup> 提取成可 import 的 ESM 模块,
// 用注入的 wx/宿主 mock 驱动页面生命周期(onLoad/onHide/onShow/onKeyUp/tick),
// 让"onShow 恢复传感器""心率断连回退""双击退出"这类页面级行为有可执行测试,
// 而不是只靠正则断言源码里出现过某个字符串。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD_DIR = path.join(ROOT, 'test', '.pages-build');

/**
 * 提取 pages/<name>/index.ink 的 <script setup> 并转成 ESM 模块。
 * - `import wx from 'wx'` 重写为读取 globalThis.__pageWx(测试注入 mock);
 * - 相对 lib 导入落在 test/.pages-build/ 下仍解析到仓库 lib/(../../lib)。
 * 返回模块的 default 导出(页面定义对象)。
 */
export async function loadPageModule(pageName) {
  const inkPath = path.join(ROOT, 'pages', pageName, 'index.ink');
  const text = fs.readFileSync(inkPath, 'utf8');
  const match = text.match(/<script setup>\s*([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`${pageName}: no <script setup> block`);
  let src = match[1];
  // wx 用 Proxy 转发到 globalThis.__pageWx:模块只 import 一次,
  // 但每个测试可换新的 fakeWx;方法绑定回真实 mock,保证 this 正确。
  src = src.replace(
    /import\s+wx\s+from\s+'wx';/,
    `const wx = new Proxy({}, {
  get(_t, p) {
    const target = globalThis.__pageWx;
    if (!target) return undefined;
    const v = target[p];
    return typeof v === 'function' ? v.bind(target) : v;
  },
  has(_t, p) { return globalThis.__pageWx ? p in globalThis.__pageWx : false; },
});`,
  );
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const outPath = path.join(BUILD_DIR, `${pageName}.page.mjs`);
  fs.writeFileSync(outPath, src);
  const mod = await import(`${pathToFileURL(outPath).href}?v=${Date.now()}`);
  return mod.default;
}

/** 从页面定义生成一个独立实例:方法共享,data 深拷一层,setData 合并进 data。 */
export function instantiatePage(pageDef) {
  const page = { ...pageDef, data: { ...pageDef.data } };
  page.setData = function setData(patch) { Object.assign(this.data, patch); };
  return page;
}

/** 假 wx:同步 storage + navigateBack/redirectTo 计数 + speech/request 桩。 */
export function fakeWx() {
  const store = new Map();
  return {
    store,
    navigateBackCalls: 0,
    navigateToCalls: [],
    ttsSpoken: [],
    requestImpl: null,   // 测试可注入;默认所有请求立刻 fail(离线)
    getStorageSync(k) { return store.has(k) ? store.get(k) : ''; },
    setStorageSync(k, v) { store.set(k, v); },
    removeStorageSync(k) { store.delete(k); },
    navigateBack() { this.navigateBackCalls += 1; },
    navigateTo(opts) { this.navigateToCalls.push(opts && opts.url); },
    redirectTo(opts) { this.navigateToCalls.push(opts && opts.url); },
    exitMiniProgram() { this.exited = true; },
    speech: {
      playTTS: (text) => { /* bound below */ },
    },
    request(opts) {
      if (this.requestImpl) { this.requestImpl(opts); return; }
      if (opts && typeof opts.fail === 'function') opts.fail(new Error('offline'));
    },
  };
}

/** 假加速度计:记录实例,可手动喂 reading。 */
export class FakeAccelerometer {
  static instances = [];
  constructor() {
    FakeAccelerometer.instances.push(this);
    this.listeners = {};
    this.started = false;
    this.stopped = false;
    this.x = 0; this.y = 0; this.z = 9.8;
  }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  emitReading(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    for (const cb of this.listeners.reading || []) cb();
  }
  static reset() { FakeAccelerometer.instances = []; }
}

/** 假 BLE 心率设备:标准 HRS notify + 可触发 gattserverdisconnected。 */
export function fakeHrDevice(name = 'FakeHR') {
  const char = {
    listeners: {},
    value: null,
    addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); },
    removeEventListener() {},
    async startNotifications() {},
    async stopNotifications() {},
    notify(bpm) {
      this.value = new Uint8Array([0x00, bpm]);   // flags=0x00, uint8 bpm
      for (const cb of this.listeners.characteristicvaluechanged || []) cb();
    },
  };
  const service = { getCharacteristic: async () => char };
  const server = { getPrimaryService: async () => service };
  const device = {
    id: 'fake-hr-1',
    name,
    listeners: {},
    addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); },
    removeEventListener() {},
    gatt: {
      connect: async () => server,
      disconnect() {
        for (const cb of device.listeners.gattserverdisconnected || []) cb();
      },
    },
  };
  return { device, char };
}
