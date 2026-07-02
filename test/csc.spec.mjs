import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCscMeasurement, crankCadenceRpm } from '../lib/cycling.js';

test('CSC：仅曲柄（迈金 S3+ 踏频模式）', () => {
  const r = parseCscMeasurement([0x02, 0x10, 0x00, 0x00, 0x04]);
  assert.equal(r.wheel, null);
  assert.equal(r.crank.revolutions, 16);
  assert.equal(r.crank.lastEventTime1024, 1024);
});

test('CSC：车轮 + 曲柄全字段', () => {
  const r = parseCscMeasurement([
    0x03,
    0xe8, 0x03, 0x00, 0x00, 0x00, 0x08,  // wheel: 1000 revs, t=2048
    0x64, 0x00, 0x00, 0x04,              // crank: 100 revs, t=1024
  ]);
  assert.equal(r.wheel.revolutions, 1000);
  assert.equal(r.wheel.lastEventTime1024, 2048);
  assert.equal(r.crank.revolutions, 100);
});

test('两帧算踏频：2 圈 / 1.28s = 93.75 rpm', () => {
  const prev = { revolutions: 100, lastEventTime1024: 0 };
  const curr = { revolutions: 102, lastEventTime1024: 1311 }; // 1311/1024 ≈ 1.28s
  const rpm = crankCadenceRpm(prev, curr);
  assert.ok(Math.abs(rpm - 93.75) < 0.15);
});

test('踏频回绕：uint16 圈数与时间戳都回绕仍算对', () => {
  const prev = { revolutions: 0xffff, lastEventTime1024: 0xfc00 };
  const curr = { revolutions: 0x0001, lastEventTime1024: 0x0000 }; // +2圈 / 1s
  const rpm = crankCadenceRpm(prev, curr);
  assert.ok(Math.abs(rpm - 120) < 1e-9);
});

test('时间未推进（重发帧）→ null；残包 → null', () => {
  const same = { revolutions: 5, lastEventTime1024: 100 };
  assert.equal(crankCadenceRpm(same, { ...same }), null);
  assert.equal(parseCscMeasurement([0x01, 0x00, 0x00]), null);
  assert.equal(parseCscMeasurement([]), null);
});
