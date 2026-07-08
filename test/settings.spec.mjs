import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RUN_SETTINGS,
  RUN_SETTINGS_KEY,
  formatStrideM,
  formatSwitch,
  nextStrideM,
  normalizeRunSettings,
  readRunSettings,
  writeRunSettings,
} from '../lib/settings.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getStorageSync(key) { return map.get(key); },
    setStorageSync(key, value) { map.set(key, value); },
    removeStorageSync(key) { map.delete(key); },
  };
}

test('normalizeRunSettings keeps valid values and restores invalid fields', () => {
  assert.deepEqual(normalizeRunSettings({
    strideM: 0.9,
    autoHeartRate: false,
    voiceCue: false,
    memoryContext: false,
  }), {
    strideM: 0.9,
    autoHeartRate: false,
    voiceCue: false,
    memoryContext: false,
  });

  assert.deepEqual(normalizeRunSettings({
    strideM: 9,
    autoHeartRate: 'yes',
    voiceCue: 1,
    memoryContext: null,
  }), DEFAULT_RUN_SETTINGS);
});

test('readRunSettings and writeRunSettings roundtrip through storage', () => {
  const storage = fakeStorage();
  const saved = writeRunSettings(storage, {
    strideM: 0.75,
    autoHeartRate: false,
    voiceCue: true,
    memoryContext: false,
  });
  assert.deepEqual(saved, {
    strideM: 0.75,
    autoHeartRate: false,
    voiceCue: true,
    memoryContext: false,
  });
  assert.deepEqual(readRunSettings(storage), saved);
});

test('readRunSettings falls back to defaults when storage is missing or invalid', () => {
  assert.deepEqual(readRunSettings(null), DEFAULT_RUN_SETTINGS);
  const storage = fakeStorage({ [RUN_SETTINGS_KEY]: { strideM: 'bad' } });
  assert.deepEqual(readRunSettings(storage), DEFAULT_RUN_SETTINGS);
});

test('settings labels stay compact for glasses UI', () => {
  assert.equal(formatStrideM(0.8), '0.80m');
  assert.equal(formatSwitch(true), '开');
  assert.equal(formatSwitch(false), '关');
  assert.equal(nextStrideM(0.85), 0.9);
  assert.equal(nextStrideM(1.0), 0.7);
});
