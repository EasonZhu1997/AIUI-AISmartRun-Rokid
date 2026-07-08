// 跑步 HUD 页面级行为测试:提取 .ink 脚本 + mock 宿主,驱动真实生命周期。
// 覆盖评审确认的四个产品底线:心率断连/过期回退、息屏自动暂停、双击退出、
// 兜底连接不写首选。这些以前只有"源码里出现过某字符串"的正则守卫。
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadPageModule, instantiatePage, fakeWx, FakeAccelerometer, fakeHrDevice,
} from './helpers/load_page.mjs';
import { LIVE_SNAPSHOT_KEY } from '../lib/live.js';

const pageDef = await loadPageModule('run_hud');

let wx;
function freshPage({ withAccel = true } = {}) {
  wx = fakeWx();
  globalThis.__pageWx = wx;
  FakeAccelerometer.reset();
  if (withAccel) globalThis.Accelerometer = FakeAccelerometer;
  else delete globalThis.Accelerometer;
  delete globalThis.navigator;   // 默认无 BLE 宿主:单眼镜模式
  const page = instantiatePage(pageDef);
  return page;
}

const pagesToClean = [];
function boot(opts) {
  const page = freshPage(opts);
  page.onLoad();
  pagesToClean.push(page);
  return page;
}
after(() => { for (const p of pagesToClean) { try { p.onUnload(); } catch (_e) {} } });

test('进页自动开跑:running=true,tick 出时长,无心率列', () => {
  const page = boot();
  assert.equal(page.data.running, true);
  assert.equal(page.data.showHeartRate, false);
  page.tick();
  assert.match(page.data.elapsed, /^\d{2}:\d{2}$/);
  assert.equal(page.data.modeLabel, '单眼镜模式');
});

test('静止(步频 0)时配速显示占位,不用平均配速冒充"此刻"', () => {
  const page = boot();
  page.tick();
  assert.equal(page.data.pace, '--:--');
});

test('心率接入:notify 有效 bpm 后同屏补心率;8s 无新数据 → 静默回单眼镜', async () => {
  const page = boot();
  const { device, char } = fakeHrDevice();
  const ok = await page.connectDevice(device, { remember: false });
  assert.equal(ok, true);
  assert.equal(page.data.bleState, 'connected');
  // 有效 notify 前不显示心率列(等真实 bpm)
  page.tick();
  assert.equal(page.data.showHeartRate, false);
  char.notify(150);
  page.tick();
  assert.equal(page.data.showHeartRate, true);
  assert.equal(page.data.bpm, '150');
  assert.equal(page.data.sourceMain, '心率+眼镜');
  // 模拟 8s 无新 notify(设备走出范围/停止广播)
  page.lastHrAtMs -= 9000;
  page.tick();
  assert.equal(page.data.showHeartRate, false, '过期心率必须回退,不许冻结显示旧值');
  assert.equal(page.data.bleState, 'idle');
  assert.equal(page.data.running, true, '心率没了跑步不中断');
});

test('GATT 断连事件 → 立即回单眼镜,不等超时', async () => {
  const page = boot();
  const { device, char } = fakeHrDevice();
  await page.connectDevice(device, { remember: false });
  char.notify(140);
  page.tick();
  assert.equal(page.data.showHeartRate, true);
  device.gatt.disconnect();   // 触发 gattserverdisconnected
  assert.equal(page.data.bleState, 'idle');
  page.tick();
  assert.equal(page.data.showHeartRate, false);
});

test('兜底连接 remember:false 不写首选设备;remember:true 才写', async () => {
  const page = boot();
  const { device } = fakeHrDevice('NeighborStrap');
  await page.connectDevice(device, { remember: false });
  assert.equal(wx.store.has('heart_rate_device'), false, '邻近跑者的心率带不许被永久记住');
  await page.onBleDropped();
  const { device: mine } = fakeHrDevice('MyBand');
  await page.connectDevice(mine, { remember: true });
  assert.equal(wx.store.get('heart_rate_device').deviceName, 'MyBand');
});

test('息屏自动暂停:onHide 暂停记录(时长距离口径一致),onShow 恢复并重启资源', () => {
  const page = boot();
  page.tick();
  assert.equal(page.session.paused, false);
  page.onHide();
  assert.equal(page.session.paused, true, '加速度计停了,时长必须同步暂停');
  assert.equal(page.data.paused, true);
  assert.equal(page.timer, null);
  assert.equal(page.accel, null);
  page.onShow();
  assert.equal(page.session.paused, false, '回来自动继续');
  assert.ok(page.timer, 'ticker 恢复');
  assert.ok(page.accel, '加速度计恢复,步数不冻结');
});

test('跑步中 Backspace 双击确认:单击提示不退出,双击才退出并清快照', () => {
  const page = boot();
  page.tick();
  assert.ok(wx.store.has(LIVE_SNAPSHOT_KEY), 'tick 应写实时快照');
  const ev = { code: 'Backspace', preventDefault() {} };
  page.onKeyUp(ev);
  assert.equal(wx.navigateBackCalls, 0, '第一次按不退出');
  assert.equal(page.data.coachLine, '再按一次结束');
  page.onKeyUp(ev);
  assert.equal(wx.navigateBackCalls, 1, '3 秒内第二次按才退出');
  assert.equal(wx.store.has(LIVE_SNAPSHOT_KEY), false, '退出清掉实时快照');
});

test('双击确认超时回收:超过 3 秒视为没按过', () => {
  const page = boot();
  const ev = { code: 'Backspace', preventDefault() {} };
  page.onKeyUp(ev);
  page.exitArmedAt -= 4000;    // 模拟超窗
  page.onKeyUp(ev);
  assert.equal(wx.navigateBackCalls, 0, '超窗后第二次按=重新武装,不退出');
  assert.equal(page.data.coachLine, '再按一次结束');
});

test('IMU 看门狗:传感器构造成功但停止回调 → 降级仅计时而不是永远 --', () => {
  const page = boot();
  assert.equal(page.imuOk, true);
  page.lastAccelAt -= 11000;   // 10s 无 reading
  page.tick();
  assert.equal(page.imuOk, false);
  assert.equal(page.data.sourceMain, '仅计时');
  assert.equal(page.data.coachLine, '单眼镜计时中');
});

test('无 Accelerometer 宿主:降级仅计时,不崩', () => {
  const page = boot({ withAccel: false });
  assert.equal(page.imuOk, false);
  assert.equal(page.data.sourceMain, '仅计时');
  page.tick();
  assert.match(page.data.elapsed, /^\d{2}:\d{2}$/);
});

test('IMU 计步喂真数据:模拟步伐 → 步频/距离/配速出数', () => {
  const page = boot();
  const accel = FakeAccelerometer.instances[0];
  // 模拟 170 spm 的峰谷波形(周期 ≈353ms):峰 12.5 / 谷 8.5 m/s²
  const stepMs = 353;
  let t = Date.now();
  const origNow = Date.now;
  try {
    for (let i = 0; i < 30; i += 1) {
      Date.now = () => t;
      accel.emitReading(0, 0, 12.5);
      t += stepMs / 2;
      Date.now = () => t;
      accel.emitReading(0, 0, 8.5);
      t += stepMs / 2;
    }
    Date.now = () => t;
    page.tick();
  } finally {
    Date.now = origNow;
  }
  const cad = Number(page.data.cadence);
  assert.ok(cad >= 150 && cad <= 190, `步频应接近 170,实际 ${page.data.cadence}`);
  assert.notEqual(page.data.pace, '--:--', '有步频时配速应出数');
});

test('确认退出后跑步摘要入待传队列(幂等一次);不够门槛不入队', () => {
  const page = boot();
  // 门槛以下:直接双击退出 → 不入队
  page.onKeyUp({ code: 'Backspace' });
  page.onKeyUp({ code: 'Backspace' });
  assert.equal(wx.store.has('pending_run_uploads'), false, '误进误出不制造垃圾记录');

  // 门槛以上:把会话起点拨回 5 分钟前再退出 → 入队一条 source=aiui
  const page2 = boot();
  page2.session.startMs = Date.now() - 300000;
  page2.onKeyUp({ code: 'Backspace' });
  page2.onKeyUp({ code: 'Backspace' });
  const q = wx.store.get('pending_run_uploads');
  assert.equal(q.length, 1);
  assert.equal(q[0].source, 'aiui');
  assert.ok(q[0].duration_s >= 299 && q[0].duration_s <= 301);
  // exitRunPage 已入队,随后 onUnload 再触发也不得重复入队
  page2.onUnload();
  assert.equal(wx.store.get('pending_run_uploads').length, 1, '一次会话只入队一次');
});
