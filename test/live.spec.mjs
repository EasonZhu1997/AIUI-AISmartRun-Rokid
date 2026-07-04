import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSnapshot, writeLiveSnapshot, readLiveSnapshot, clearLiveSnapshot,
  LIVE_SNAPSHOT_KEY,
} from '../lib/live.js';

// 假 wx storage:同步 get/set/remove,可注入。
function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    store: m,
    setStorageSync(k, v) { m.set(k, v); },
    getStorageSync(k) { return m.has(k) ? m.get(k) : ''; },
    removeStorageSync(k) { m.delete(k); },
  };
}

test('normalizeSnapshot：只留有限数值 + paused/stationary；无数值 → null', () => {
  assert.equal(normalizeSnapshot(null), null);
  assert.equal(normalizeSnapshot({}), null);
  assert.equal(normalizeSnapshot({ paused: true }), null);          // 只有标志无数值 → null
  assert.equal(normalizeSnapshot({ bpm: NaN, distanceM: undefined }), null);
  const n = normalizeSnapshot({
    bpm: 156, zone: 4, paceSecPerKm: 342, cadenceSpm: 178,
    distanceM: 3200, elapsedMs: 1140000, paused: false, stationary: true, junk: 'x',
  });
  assert.deepEqual(n, {
    bpm: 156, zone: 4, paceSecPerKm: 342, cadenceSpm: 178,
    distanceM: 3200, elapsedMs: 1140000, paused: false, stationary: true,
  });
  assert.equal('junk' in n, false);
});

test('normalizeSnapshot：室内原地无配速(null)也算有效(有步数/时长)', () => {
  const n = normalizeSnapshot({ cadenceSpm: 180, elapsedMs: 60000, paceSecPerKm: null, stationary: true });
  assert.deepEqual(n, { cadenceSpm: 180, elapsedMs: 60000, paused: false, stationary: true });
});

test('write→read 往返；write 无效数据会清掉旧值', () => {
  const st = fakeStorage();
  writeLiveSnapshot(st, { bpm: 150, elapsedMs: 1000 });
  assert.deepEqual(readLiveSnapshot(st), { bpm: 150, elapsedMs: 1000, paused: false });
  // 写一份无效快照 → 清掉(不残留过期数据)
  writeLiveSnapshot(st, {});
  assert.equal(readLiveSnapshot(st), null);
  assert.equal(st.store.has(LIVE_SNAPSHOT_KEY), false);
});

test('clearLiveSnapshot 清除;读空 storage → null', () => {
  const st = fakeStorage();
  writeLiveSnapshot(st, { distanceM: 500 });
  clearLiveSnapshot(st);
  assert.equal(readLiveSnapshot(st), null);
});

test('storage 抛异常 / 缺失 → 静默 null,不崩', () => {
  const boom = {
    setStorageSync() { throw new Error('quota'); },
    getStorageSync() { throw new Error('io'); },
    removeStorageSync() { throw new Error('io'); },
  };
  assert.doesNotThrow(() => writeLiveSnapshot(boom, { bpm: 100 }));
  assert.equal(readLiveSnapshot(boom), null);
  assert.doesNotThrow(() => clearLiveSnapshot(boom));
  assert.equal(readLiveSnapshot(null), null);
  assert.doesNotThrow(() => writeLiveSnapshot(null, { bpm: 1 }));
});
