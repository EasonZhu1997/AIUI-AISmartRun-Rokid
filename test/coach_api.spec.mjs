import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCoachMessage, buildChatRequest, parseChatResponse,
  buildAnonLoginRequest, parseAnonLoginResponse,
  buildMemoryContextRequest, parseMemoryContext, buildAugmentedQuestion,
  DEFAULT_BASE_URL, CHAT_PATH, ANON_LOGIN_PATH, MEMORY_CONTEXT_PATH,
} from '../lib/coach_api.js';

const SNAP2 = { bpm: 156, zone: 4, paceSecPerKm: 342, cadenceSpm: 178, distanceM: 3200, elapsedMs: 1140000 };

const SNAP = { bpm: 158, zone: 4, paceSecPerKm: 330, cadenceSpm: 178, distanceM: 5230, elapsedMs: 1800000 };

test('buildCoachMessage：有实时数据 → 拼前缀', () => {
  const m = buildCoachMessage('我配速怎么样', SNAP);
  assert.match(m, /^\[实时 .*心率 158\(Z4\).*配速 5:30\/km.*\] 我配速怎么样$/);
});

test('buildCoachMessage：无数据 → 只发问题(不带占位串)', () => {
  assert.equal(buildCoachMessage('随便聊聊', null), '随便聊聊');
  assert.equal(buildCoachMessage('随便聊聊', {}), '随便聊聊');
});

test('buildChatRequest：URL=base+path、POST、带 Bearer', () => {
  const req = buildChatRequest({ token: 'tok123', question: '心率高吗', snapshot: SNAP });
  assert.equal(req.url, DEFAULT_BASE_URL + CHAT_PATH);
  assert.equal(req.url, 'https://119.28.104.126.nip.io/api/coach-svc/coach/chat');
  assert.equal(req.method, 'POST');
  assert.equal(req.header.Authorization, 'Bearer tok123');
  assert.equal(req.header['Content-Type'], 'application/json');
  assert.match(req.data.message, /心率 158/);
});

test('buildChatRequest：无 token → 不加 Authorization 头(让后端 401 触发降级)', () => {
  const req = buildChatRequest({ question: '嗨' });
  assert.equal(req.header.Authorization, undefined);
});

test('buildChatRequest：baseUrl 末尾斜杠被规整', () => {
  const req = buildChatRequest({ baseUrl: 'https://x.example.com/', question: '嗨' });
  assert.equal(req.url, 'https://x.example.com/api/coach-svc/coach/chat');
});

test('parseChatResponse：200 + reply → 返回回复', () => {
  assert.equal(parseChatResponse({ statusCode: 200, data: { reply: '  节奏不错，保持住。 ' } }), '节奏不错，保持住。');
});

test('parseChatResponse：非 200 / 无 reply / 空 reply → null(触发降级)', () => {
  assert.equal(parseChatResponse({ statusCode: 401, data: { detail: 'Invalid token' } }), null);
  assert.equal(parseChatResponse({ statusCode: 200, data: {} }), null);
  assert.equal(parseChatResponse({ statusCode: 200, data: { reply: '   ' } }), null);
  assert.equal(parseChatResponse(null), null);
});

test('buildAnonLoginRequest：URL=base+anon path、POST、带 app_key+device_id', () => {
  const req = buildAnonLoginRequest({ appKey: 'k1', deviceId: 'aiui-dev-xyz' });
  assert.equal(req.url, DEFAULT_BASE_URL + ANON_LOGIN_PATH);
  assert.equal(req.url, 'https://119.28.104.126.nip.io/api/coach-svc/coach/anon-login');
  assert.equal(req.method, 'POST');
  assert.deepEqual(req.data, { app_key: 'k1', device_id: 'aiui-dev-xyz' });
  assert.equal(req.header.Authorization, undefined);  // 直登不带 Bearer
});

test('parseAnonLoginResponse：200+token → token；否则 null', () => {
  assert.equal(parseAnonLoginResponse({ statusCode: 200, data: { token: ' jwt.abc ', user_id: 9 } }), 'jwt.abc');
  assert.equal(parseAnonLoginResponse({ statusCode: 401, data: { detail: 'Invalid app key' } }), null);
  assert.equal(parseAnonLoginResponse({ statusCode: 200, data: {} }), null);
  assert.equal(parseAnonLoginResponse(null), null);
});

test('buildMemoryContextRequest：URL=base+memory path、POST、带 Bearer + query', () => {
  const req = buildMemoryContextRequest({ token: 't1', query: '我配速怎么样' });
  assert.equal(req.url, DEFAULT_BASE_URL + MEMORY_CONTEXT_PATH);
  assert.equal(req.url, 'https://119.28.104.126.nip.io/api/coach-svc/coach/memory-context');
  assert.equal(req.method, 'POST');
  assert.equal(req.header.Authorization, 'Bearer t1');
  assert.deepEqual(req.data, { query: '我配速怎么样' });
});

test('parseMemoryContext：200 → {memories,profile}；非 200 → null；字段缺失给默认', () => {
  assert.deepEqual(
    parseMemoryContext({ statusCode: 200, data: { memories: ['爱晨跑', '目标破5'], profile: '连跑6天' } }),
    { memories: ['爱晨跑', '目标破5'], profile: '连跑6天' },
  );
  assert.deepEqual(parseMemoryContext({ statusCode: 200, data: {} }), { memories: [], profile: '' });
  assert.equal(parseMemoryContext({ statusCode: 401, data: {} }), null);
  assert.equal(parseMemoryContext(null), null);
});

test('buildAugmentedQuestion：有记忆 → 拼记忆+画像+实时；无记忆 → 只拼实时；都无 → 原问题', () => {
  const withMem = buildAugmentedQuestion('该加速吗', SNAP2,
    { memories: ['爱晨跑', '膝盖旧伤'], profile: '连跑6天' });
  assert.match(withMem, /关于我: 爱晨跑; 膝盖旧伤/);
  assert.match(withMem, /画像: 连跑6天/);
  assert.match(withMem, /实时: .*心率 156\(Z4\)/);
  assert.match(withMem, /该加速吗$/);

  const noMem = buildAugmentedQuestion('该加速吗', SNAP2, null);
  assert.match(noMem, /^\[实时: .*\] 该加速吗$/);
  assert.equal(noMem.includes('关于我'), false);

  assert.equal(buildAugmentedQuestion('随便聊聊', null, null), '随便聊聊');
});
