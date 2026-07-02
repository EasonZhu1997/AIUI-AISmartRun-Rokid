import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTreadmillData } from '../lib/ftms.js';

test('最简跑步机帧：flags=0 → 仅瞬时速度（8.5 km/h）', () => {
  const r = parseTreadmillData([0x00, 0x00, 0x52, 0x03]); // 850 × 0.01
  assert.equal(r.speedKmh, 8.5);
  assert.equal(r.totalDistanceM, null);
});

test('速度 + 累计距离 + 坡度', () => {
  // flags = 0x000C: Total Distance(bit2) + Inclination(bit3)
  const r = parseTreadmillData([
    0x0c, 0x00,
    0xb0, 0x04,             // 12.0 km/h
    0xe8, 0x03, 0x00,       // 1000 m (uint24)
    0x14, 0x00, 0x00, 0x00, // incline 2.0% + ramp
  ]);
  assert.equal(r.speedKmh, 12);
  assert.equal(r.totalDistanceM, 1000);
  assert.equal(r.inclinationPct, 2);
});

test('负坡度 sint16', () => {
  const r = parseTreadmillData([0x08, 0x00, 0x20, 0x03, 0xec, 0xff, 0x00, 0x00]);
  assert.equal(r.inclinationPct, -2);
});

test('跳过 Pace/Energy 组后正确取心率与时长', () => {
  // flags = 0x05E0: InstPace(5)+AvgPace(6)+Energy(7)+HR(8) +Elapsed(10)
  const r = parseTreadmillData([
    0xe0, 0x05,
    0x84, 0x03,                   // 9.0 km/h
    55,                           // inst pace
    56,                           // avg pace
    0x64, 0x00, 0x32, 0x00, 0x05, // energy 组 5 字节
    148,                          // HR
    0x58, 0x02,                   // elapsed 600s
  ]);
  assert.equal(r.speedKmh, 9);
  assert.equal(r.heartRateBpm, 148);
  assert.equal(r.elapsedSec, 600);
});

test('More Data 位=1 时无瞬时速度', () => {
  const r = parseTreadmillData([0x05, 0x00, 0xe8, 0x03, 0x00]); // bit0 + 距离
  assert.equal(r.speedKmh, null);
  assert.equal(r.totalDistanceM, 1000);
});

test('残包 → null', () => {
  assert.equal(parseTreadmillData([0x00]), null);
  assert.equal(parseTreadmillData([0x0c, 0x00, 0xb8, 0x04, 0xe8]), null);
});
