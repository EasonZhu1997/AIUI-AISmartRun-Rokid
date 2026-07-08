import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIndoorBikeData } from '../lib/ftms.js';

test('Thinkrider 常见帧：速度 + 踏频 + 功率', () => {
  // flags = 0x0044: Inst Cadence(bit2) + Inst Power(bit6)
  const r = parseIndoorBikeData([
    0x44, 0x00,
    0xc4, 0x09,  // 25.0 km/h
    0xb4, 0x00,  // cadence 180×0.5 = 90 rpm
    0xfa, 0x00,  // 250 W
  ]);
  assert.equal(r.speedKmh, 25);
  assert.equal(r.cadenceRpm, 90);
  assert.equal(r.powerW, 250);
});

test('带累计距离与心率', () => {
  // flags = 0x0210: Total Distance(bit4) + HR(bit9)
  const r = parseIndoorBikeData([
    0x10, 0x02,
    0xd0, 0x07,        // 20.0 km/h
    0x10, 0x27, 0x00,  // 10000 m
    155,               // HR
  ]);
  assert.equal(r.speedKmh, 20);
  assert.equal(r.totalDistanceM, 10000);
  assert.equal(r.heartRateBpm, 155);
});

test('More Data=1 无速度，跳过阻力位读功率', () => {
  // flags = 0x0061: MoreData(bit0) + Resistance(bit5) + Power(bit6)
  const r = parseIndoorBikeData([0x61, 0x00, 0x05, 0x00, 0x96, 0x00]);
  assert.equal(r.speedKmh, null);
  assert.equal(r.powerW, 150);
});

test('残包 → null', () => {
  assert.equal(parseIndoorBikeData([0x44]), null);
  assert.equal(parseIndoorBikeData([0x44, 0x00, 0xc4, 0x09, 0xb4]), null);
});
