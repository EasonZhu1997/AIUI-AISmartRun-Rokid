// 首页页面级行为测试:就绪陈述(不连接)+ 跑步记录静默补传。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPageModule, instantiatePage, fakeWx } from './helpers/load_page.mjs';
import { PENDING_RUNS_KEY } from '../lib/run_upload.js';

const pageDef = await loadPageModule('index');

let wx;
function freshPage() {
  wx = fakeWx();
  globalThis.__pageWx = wx;
  delete globalThis.navigator;   // 默认无 BLE 宿主
  return instantiatePage(pageDef);
}
after(() => { delete globalThis.__pageWx; });

const PAYLOAD = { started_at: '2026-07-08T00:00:00.000Z', duration_s: 300, distance_m: 900, source: 'aiui' };

test('首页只做就绪陈述:无 BLE 宿主 → 心率"不可用",不发起任何连接', () => {
  const page = freshPage();
  page.onLoad();
  assert.equal(page.data.heartLabel, '不可用');
  assert.equal(page.data.statusText, '已就绪');
});

test('补传:无 coach_app_key → 零请求,队列原样保留(等 key 注入后自然补传)', async () => {
  const page = freshPage();
  wx.store.set(PENDING_RUNS_KEY, [PAYLOAD]);
  let requests = 0;
  wx.requestImpl = (opts) => { requests += 1; opts.fail(new Error('unexpected')); };
  await page.flushRunUploads();
  assert.equal(requests, 0, '后端 anon-login 必填 key,无 key 不打必失败请求');
  assert.equal(wx.store.get(PENDING_RUNS_KEY).length, 1, '队列保留');
});

test('补传:有 key → 匿名直登换 token → 上传成功 → 队列清空', async () => {
  const page = freshPage();
  wx.store.set('coach_app_key', 'shared-key');
  wx.store.set(PENDING_RUNS_KEY, [PAYLOAD]);
  const seen = [];
  wx.requestImpl = (opts) => {
    seen.push(opts.url);
    if (opts.url.endsWith('/coach/anon-login')) {
      assert.equal(opts.data.app_key, 'shared-key');
      opts.success({ statusCode: 200, data: { token: 'jwt-1', user_id: 7 } });
      return;
    }
    if (opts.url.endsWith('/runs')) {
      assert.equal(opts.header.Authorization, 'Bearer jwt-1');
      assert.equal(opts.data.source, 'aiui');
      opts.success({ statusCode: 200, data: { id: 88 } });
      return;
    }
    opts.fail(new Error(`unexpected url ${opts.url}`));
  };
  await page.flushRunUploads();
  assert.equal(seen.length, 2, '登录 + 上传各一次');
  assert.equal(wx.store.has(PENDING_RUNS_KEY), false, '成功后清队');
});

test('补传:上传 401 → 清 token、保留本条及其后,下次重登再传', async () => {
  const page = freshPage();
  wx.store.set('coach_token', 'stale-jwt');
  wx.store.set(PENDING_RUNS_KEY, [PAYLOAD, { ...PAYLOAD, duration_s: 600 }]);
  wx.requestImpl = (opts) => {
    if (opts.url.endsWith('/runs')) { opts.success({ statusCode: 401, data: {} }); return; }
    opts.fail(new Error('unexpected'));
  };
  await page.flushRunUploads();
  assert.equal(wx.store.has('coach_token'), false, '过期 token 清掉');
  assert.equal(wx.store.get(PENDING_RUNS_KEY).length, 2, '两条都保留');
});

test('补传:网络失败 → 队列保留,首页不报错', async () => {
  const page = freshPage();
  wx.store.set('coach_token', 'jwt-ok');
  wx.store.set(PENDING_RUNS_KEY, [PAYLOAD]);
  // fakeWx 默认所有请求 fail(离线)
  await page.flushRunUploads();
  assert.equal(wx.store.get(PENDING_RUNS_KEY).length, 1);
});

test('navigateBack 回首页只触发 onShow:onShow 也必须触发补传', () => {
  const page = freshPage();
  let flushed = 0;
  page.flushRunUploads = async () => { flushed += 1; };
  page.onShow();
  assert.equal(flushed, 1, '跑完回首页(onShow)就要补传,不等下次冷启动');
});

test('补传防重入:进行中再次触发直接返回,不重复上传', async () => {
  const page = freshPage();
  wx.store.set('coach_app_key', 'shared-key');
  wx.store.set(PENDING_RUNS_KEY, [PAYLOAD]);
  let runPosts = 0;
  let releaseLogin;
  wx.requestImpl = (opts) => {
    if (opts.url.endsWith('/coach/anon-login')) {
      // 挂起登录,模拟慢网:期间再触发一次 flush
      releaseLogin = () => opts.success({ statusCode: 200, data: { token: 'jwt-2', user_id: 7 } });
      return;
    }
    if (opts.url.endsWith('/runs')) {
      runPosts += 1;
      opts.success({ statusCode: 200, data: { id: 99 } });
    }
  };
  const first = page.flushRunUploads();
  await page.flushRunUploads();   // 重入:应直接返回
  releaseLogin();
  await first;
  assert.equal(runPosts, 1, '同一条记录只上传一次');
  assert.equal(wx.store.has(PENDING_RUNS_KEY), false);
});
