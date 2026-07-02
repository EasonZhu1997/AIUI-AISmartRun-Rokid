import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatElapsed, formatPace, paceSecPerKmFromKmh, formatDistanceKm, formatBpm,
} from '../lib/format.js';

test('时长：mm:ss 与跨小时 h:mm:ss', () => {
  assert.equal(formatElapsed(0), '00:00');
  assert.equal(formatElapsed(65000), '01:05');
  assert.equal(formatElapsed(3661000), '1:01:01');
  assert.equal(formatElapsed(-1), '00:00');
  assert.equal(formatElapsed(NaN), '00:00');
});

test('配速：sec/km → M:SS，四舍五入进位不出现 5:60', () => {
  assert.equal(formatPace(330), '5:30');
  assert.equal(formatPace(359.6), '6:00');
  assert.equal(formatPace(0), '--:--');
  assert.equal(formatPace(1300), '--:--');   // 慢于 20:00/km
  assert.equal(formatPace(null), '--:--');
});

test('km/h → sec/km；接近 0 视为无配速', () => {
  assert.equal(paceSecPerKmFromKmh(12), 300);
  assert.equal(paceSecPerKmFromKmh(0.3), null);
  assert.equal(paceSecPerKmFromKmh(NaN), null);
});

test('距离与心率占位', () => {
  assert.equal(formatDistanceKm(5230), '5.23');
  assert.equal(formatDistanceKm(0), '0.00');
  assert.equal(formatDistanceKm(NaN), '--');
  assert.equal(formatBpm(155.4), '155');
  assert.equal(formatBpm(0), '--');
  assert.equal(formatBpm(null), '--');
});
