import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRscMeasurement } from '../lib/rsc.js';

test('最简 RSC：速度 + 步频（3 m/s = 768/256, 180 spm, 跑步）', () => {
  const r = parseRscMeasurement([0x04, 0x00, 0x03, 180]);
  assert.equal(r.speedMps, 3);
  assert.ok(Math.abs(r.speedKmh - 10.8) < 1e-9);
  assert.equal(r.cadenceSpm, 180);
  assert.equal(r.running, true);
  assert.equal(r.strideLengthM, null);
  assert.equal(r.totalDistanceM, null);
});

test('带步幅 + 累计距离（Stryd 风格全字段）', () => {
  // flags=0x07: 步幅(120cm=0x78) + 距离(12345×0.1m) + 跑步
  const r = parseRscMeasurement([0x07, 0x00, 0x03, 178, 0x78, 0x00, 0x39, 0x30, 0x00, 0x00]);
  assert.equal(r.strideLengthM, 1.2);
  assert.equal(r.totalDistanceM, 1234.5);
  assert.equal(r.cadenceSpm, 178);
});

test('步行位为 0', () => {
  const r = parseRscMeasurement([0x00, 0x80, 0x01, 110]); // 1.5 m/s
  assert.equal(r.running, false);
  assert.equal(r.speedMps, 1.5);
});

test('残包返回 null', () => {
  assert.equal(parseRscMeasurement([0x01, 0x00, 0x03, 180]), null);      // 声称有步幅但缺字节
  assert.equal(parseRscMeasurement([0x02, 0x00, 0x03, 180, 0x01]), null); // 声称有距离但缺字节
  assert.equal(parseRscMeasurement([0x00, 0x00]), null);
});
