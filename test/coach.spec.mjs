import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeSnapshot, buildCoachSystemPrompt, classifyIntent, fallbackCoachReply,
  nextProactiveCue,
} from '../lib/coach.js';

const FULL = {
  bpm: 158, zone: 4, paceSecPerKm: 330, cadenceSpm: 178,
  distanceM: 5230, elapsedMs: 1800000, paused: false,
};

test('summarizeSnapshot：全字段拼成一行，配速用 M:SS/km', () => {
  const s = summarizeSnapshot(FULL);
  assert.match(s, /心率 158\(Z4\)/);
  assert.match(s, /配速 5:30\/km/);
  assert.match(s, /步频 178/);
  assert.match(s, /距离 5\.23km/);
  assert.match(s, /时长 30:00/);
});

test('summarizeSnapshot：空/非法输入返回占位而非 NaN', () => {
  assert.equal(summarizeSnapshot(null), '暂无运动数据');
  assert.equal(summarizeSnapshot({}), '暂无运动数据');
  assert.equal(summarizeSnapshot({ bpm: 0, paceSecPerKm: 0 }), '暂无运动数据');
  // 慢于 20:00/km 的配速被 formatPace 拒绝 → 不进串
  assert.equal(summarizeSnapshot({ paceSecPerKm: 5000 }), '暂无运动数据');
});

test('summarizeSnapshot：暂停态附加标记', () => {
  assert.match(summarizeSnapshot({ distanceM: 1000, paused: true }), /已暂停/);
});

test('buildCoachSystemPrompt：含人设 + 实时数据 + 医疗免责', () => {
  const p = buildCoachSystemPrompt(FULL);
  assert.match(p, /AI 跑步教练/);
  assert.match(p, /不给医疗建议/);
  assert.match(p, /当前实时数据：/);
  assert.match(p, /配速 5:30\/km/);
});

test('classifyIntent：配速/心率/距离/时间/通用', () => {
  assert.equal(classifyIntent('我配速怎么样'), 'pace');
  assert.equal(classifyIntent('能再快点吗'), 'pace');
  assert.equal(classifyIntent('心率高不高'), 'hr');
  assert.equal(classifyIntent('还有多远'), 'distance');
  assert.equal(classifyIntent('跑了多久了'), 'time');
  assert.equal(classifyIntent('今天天气真好'), 'general');
});

test('fallbackCoachReply：Z5 安全优先，覆盖任何问题意图', () => {
  const r = fallbackCoachReply({ zone: 5, paceSecPerKm: 300 }, '我能再快点吗');
  assert.match(r, /Z5/);
  assert.match(r, /降|慢|呼吸/);
});

test('fallbackCoachReply：配速问题引用真实配速', () => {
  assert.match(fallbackCoachReply(FULL, '配速如何'), /5:30/);
  assert.equal(
    fallbackCoachReply({ zone: 2 }, '我快吗').includes('两分钟'),
    true, '无配速数据时给引导而非编造',
  );
});

test('fallbackCoachReply：心率问题——有数据报读，无数据引导连接', () => {
  assert.match(fallbackCoachReply(FULL, '心率多少'), /158/);
  assert.match(fallbackCoachReply({ zone: 0 }, '心率呢'), /胸带|广播/);
});

test('fallbackCoachReply：距离/时间问题', () => {
  assert.match(fallbackCoachReply(FULL, '跑多远了'), /5\.23 公里/);
  assert.match(fallbackCoachReply(FULL, '跑了多久'), /30:00/);
});

test('fallbackCoachReply：通用问题按心率区间给鼓励，绝不返回空串', () => {
  assert.ok(fallbackCoachReply({ zone: 4 }, '加油').length > 0);
  assert.match(fallbackCoachReply({ zone: 1 }, '嗯'), /轻松|提速|稳/);
  assert.ok(fallbackCoachReply({}, '').length > 0);
});

test('nextProactiveCue：进 Z5 安全降速优先，且盖过整公里里程碑', () => {
  const cue = nextProactiveCue({ zone: 3, distanceM: 990 }, { zone: 5, distanceM: 1010, paceSecPerKm: 300 });
  assert.match(cue, /Z5/);
  assert.match(cue, /降|呼吸/);
});

test('nextProactiveCue：跨整公里 → 里程碑播报(带配速)', () => {
  const cue = nextProactiveCue({ zone: 3, distanceM: 990 }, { zone: 3, distanceM: 1010, paceSecPerKm: 330 });
  assert.match(cue, /第 1 公里/);
  assert.match(cue, /5:30/);
});

test('nextProactiveCue：跨 5 分钟 → 时长播报(带步频)', () => {
  const cue = nextProactiveCue({ elapsedMs: 299000, distanceM: 800 }, { elapsedMs: 301000, distanceM: 850, cadenceSpm: 176 });
  assert.match(cue, /5 分钟/);
  assert.match(cue, /步频 176/);
});

test('nextProactiveCue：刚进 Z4 → 提醒；无事件 → null', () => {
  assert.match(nextProactiveCue({ zone: 2 }, { zone: 4 }), /Z4/);
  assert.equal(nextProactiveCue({ zone: 3, distanceM: 1500, elapsedMs: 120000 },
                                { zone: 3, distanceM: 1550, elapsedMs: 122000 }), null);
  assert.equal(nextProactiveCue(null, null), null);
});
