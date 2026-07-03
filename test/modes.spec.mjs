import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCES, SCENES, defaultMode, normalizeMode, modeTag, startCue, isStationary,
  MODE_STORAGE_KEY,
} from '../lib/modes.js';

test('模式常量：两个数据源 × 两个场景，label 全部 ≤4 字', () => {
  assert.deepEqual(SOURCES.map((s) => s.key), ['ble', 'imu']);
  assert.deepEqual(SCENES.map((s) => s.key), ['out', 'in']);
  for (const o of [...SOURCES, ...SCENES]) {
    assert.ok([...o.label].length <= 4, `label 超长: ${o.label}`);
  }
  assert.equal(MODE_STORAGE_KEY, 'run_mode');
});

test('defaultMode：无蓝牙+户外(零依赖人人可用)', () => {
  assert.deepEqual(defaultMode(), { src: 'imu', scene: 'out' });
});

test('normalizeMode：null/坏值/旧 storage 一律兜回默认', () => {
  assert.deepEqual(normalizeMode(null), defaultMode());
  assert.deepEqual(normalizeMode('garbage'), defaultMode());
  assert.deepEqual(normalizeMode({ src: 'gps', scene: 'moon' }), defaultMode());
  assert.deepEqual(normalizeMode({ src: 'ble' }), { src: 'ble', scene: 'out' });
  assert.deepEqual(normalizeMode({ src: 'ble', scene: 'in' }), { src: 'ble', scene: 'in' });
});

test('modeTag：短角标，跑步时一眼可读', () => {
  assert.equal(modeTag({ src: 'ble', scene: 'out' }), '蓝牙·户外');
  assert.equal(modeTag({ src: 'imu', scene: 'in' }), '无蓝牙·室内');
  assert.ok([...modeTag({ src: 'imu', scene: 'in' })].length <= 7);
});

test('startCue：开跑第一句 ≤15 字；室内提步频不提配速', () => {
  const outCue = startCue({ src: 'imu', scene: 'out' });
  const inCue = startCue({ src: 'imu', scene: 'in' });
  assert.ok([...outCue].length <= 15, outCue);
  assert.ok([...inCue].length <= 15, inCue);
  assert.match(inCue, /180/);
  assert.equal(inCue.includes('配速'), false);
});

test('isStationary：只有室内原地为 true', () => {
  assert.equal(isStationary({ src: 'ble', scene: 'in' }), true);
  assert.equal(isStationary({ src: 'ble', scene: 'out' }), false);
  assert.equal(isStationary(null), false);
});
