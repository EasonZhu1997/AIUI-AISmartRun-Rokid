// AI 教练页面级行为测试:mock LanguageModel/宿主,驱动真实 answer() 编排。
// 覆盖评审确认的教练链路底线:Z5 确定性安全直答、LLM 挂起超时兜底、
// 输出后置消毒、创建失败规则兜底、Backspace 取消、登录失败负缓存。
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadPageModule, instantiatePage, fakeWx } from './helpers/load_page.mjs';
import { writeLiveSnapshot } from '../lib/live.js';

const pageDef = await loadPageModule('coach');

let wx;

function mockLlm({ chunks = null, hang = false, createThrows = false } = {}) {
  const state = { createCalls: 0, prompts: [] };
  globalThis.LanguageModel = {
    availability: async () => 'available',
    create: async (opts) => {
      state.createCalls += 1;
      state.systemPrompt = opts && opts.initialPrompts && opts.initialPrompts[0]
        ? opts.initialPrompts[0].content : '';
      if (createThrows) throw new Error('no model');
      return {
        promptStreaming(q) {
          state.prompts.push(q);
          if (hang) return { read: async () => ({ done: false, value: '' }) };
          const queue = (chunks || []).slice();
          return {
            read: async () => (queue.length
              ? { done: false, value: queue.shift() }
              : { done: true, value: undefined }),
          };
        },
        destroy() {},
      };
    },
  };
  return state;
}

async function bootCoach(llmOpts) {
  wx = fakeWx();
  globalThis.__pageWx = wx;
  delete globalThis.SpeechRecognition;
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
  const llm = mockLlm(llmOpts);
  const page = instantiatePage(pageDef);
  await page.onLoad();
  return { page, llm };
}

function writeSnap(snap) {
  writeLiveSnapshot(wx, snap, Date.now());
}

test('Z5 高心率:确定性规则直答(不调 LLM),安全提示不交给概率模型', async () => {
  const { page, llm } = await bootCoach({ chunks: ['随便跑'] });
  writeSnap({ bpm: 182, zone: 5, paceSecPerKm: 300, distanceM: 2000, elapsedMs: 600000 });
  page.turnId = 't1';
  await page.answer('t1', '我能再快一点吗');
  assert.equal(page.data.replySource, 'rule-safety');
  assert.match(page.data.reply, /Z5|降/);
  assert.equal(llm.createCalls, 0, 'Z5 不许走 LLM');
});

test('LLM 成功:输出消毒——markdown/换行不上屏;快照每轮注入而非冻结在 system prompt', async () => {
  const { page, llm } = await bootCoach({ chunks: ['**保持**节奏，\n', '- 呼吸放稳。'] });
  writeSnap({ bpm: 150, zone: 3, paceSecPerKm: 330, distanceM: 1500, elapsedMs: 480000 });
  page.turnId = 't1';
  await page.answer('t1', '现在怎么样');
  assert.equal(page.data.replySource, 'aiui');
  assert.doesNotMatch(page.data.reply, /[*\n#-]/, `消毒后不得有 markdown/换行: ${page.data.reply}`);
  assert.match(page.data.reply, /保持/);
  // system prompt 只含人设;实时数据在每轮问题里
  assert.doesNotMatch(llm.systemPrompt, /当前实时数据/);
  assert.match(llm.prompts[0], /\[实时: .*心率 150/);
  assert.match(llm.prompts[0], /现在怎么样$/);
});

test('LLM 创建失败:落到规则兜底,绝不给用户"出错了"', async () => {
  const { page } = await bootCoach({ createThrows: true });
  writeSnap({ paceSecPerKm: 342, cadenceSpm: 172, distanceM: 3200, elapsedMs: 1140000 });
  page.turnId = 't1';
  await page.answer('t1', '配速怎么样');
  assert.equal(page.data.usedFallback, true);
  assert.equal(page.data.replySource, 'rule');
  assert.match(page.data.reply, /5:42/);
});

test('LLM 流挂起:10s 总超时 → 规则兜底,不许永久"思考"', async () => {
  const { page } = await bootCoach({ hang: true });
  writeSnap({ cadenceSpm: 170, distanceM: 900, elapsedMs: 300000 });
  page.turnId = 't1';
  const realNow = Date.now;
  let offset = 0;
  Date.now = () => realNow.call(Date) + offset;
  try {
    const pending = page.answer('t1', '我该怎么跑');
    await new Promise((r) => setTimeout(r, 40));  // 让 readAll 进入轮询
    offset = 11000;                               // 越过 10s 截止线
    await pending;
  } finally {
    Date.now = realNow;
  }
  assert.equal(page.data.usedFallback, true, '挂起流必须超时落兜底');
  assert.ok(page.data.reply.length > 0);
  assert.equal(page.data.status, 'idle', '不许停留在 thinking');
});

test('思考中 Backspace = 取消本轮,不退出页面', async () => {
  const { page } = await bootCoach({});
  page.turnId = 't-busy';
  page.setData({ status: 'thinking' });
  page.onKeyUp({ code: 'Backspace', preventDefault() {} });
  assert.equal(page.turnId, '');
  assert.equal(page.data.status, 'idle');
  assert.match(page.data.reply, /已取消/);
  assert.equal(wx.navigateBackCalls, 0, '进行中取消,不返回上一页');
});

test('无 app_key:跳过匿名直登(零请求),记忆显式关闭但不报错', async () => {
  const { page } = await bootCoach({});
  let requests = 0;
  wx.requestImpl = (opts) => { requests += 1; opts.fail(new Error('offline')); };
  assert.equal(await page.ensureToken(), '');
  assert.equal(requests, 0, '后端 anon-login 必填 app_key,无 key 不许打必失败的请求');
});

test('匿名直登失败进 60s 负缓存:断网时不为每轮重复付登录超时', async () => {
  const { page } = await bootCoach({});
  wx.store.set('coach_app_key', 'test-shared-key');   // 预置共享 key(A-12 前置)
  page.backendConfig = null;                          // 让下轮重读含 appKey 的配置
  let requests = 0;
  wx.requestImpl = (opts) => { requests += 1; opts.fail(new Error('offline')); };
  assert.equal(await page.ensureToken(), '');
  const afterFirst = requests;
  assert.ok(afterFirst >= 1, '有 key 时应真实尝试登录');
  assert.equal(await page.ensureToken(), '', '负缓存期内直接返回空');
  assert.equal(requests, afterFirst, '60s 内不得重发登录请求');
});

test('无实时快照(过期/没在跑):教练不编数,回答引导语', async () => {
  const { page } = await bootCoach({ createThrows: true });
  // 不写快照 → liveSnapshot() 为空对象
  page.turnId = 't1';
  await page.answer('t1', '心率多少');
  assert.match(page.data.reply, /无心率数据/);
  assert.doesNotMatch(page.data.reply, /\d{2,3}/, '没有数据不许出现编造的心率数字');
});
