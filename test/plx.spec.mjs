import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlxContinuous } from '../lib/plx.js';

test('正常读数：SpO2 98.0% + 脉率 72', () => {
  // SpO2 98.0 → SFLOAT 0xF3D4；PR 72 → 0x0048
  const r = parsePlxContinuous([0x00, 0xd4, 0xf3, 0x48, 0x00]);
  assert.equal(r.spo2Pct, 98);
  assert.equal(r.pulseBpm, 72);
});

test('SFLOAT NaN（探头未就绪）→ 字段为 null 而非 NaN 上屏', () => {
  const r = parsePlxContinuous([0x00, 0xff, 0x07, 0x48, 0x00]);
  assert.equal(r.spo2Pct, null);
  assert.equal(r.pulseBpm, 72);
});

test('残包 → null', () => {
  assert.equal(parsePlxContinuous([0x00, 0xd4, 0xf3]), null);
  assert.equal(parsePlxContinuous([]), null);
});
