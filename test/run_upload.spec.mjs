import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRunUploadPayload, buildRunUploadRequest, parseRunUploadResponse,
  readPendingRunUploads, writePendingRunUploads, enqueueRunUpload,
  RUN_UPLOAD_PATH, PENDING_RUNS_KEY, PENDING_RUNS_MAX,
} from '../lib/run_upload.js';
import { DEFAULT_BASE_URL } from '../lib/coach_api.js';

function fakeStorage() {
  const store = new Map();
  return {
    store,
    getStorageSync(k) { return store.has(k) ? store.get(k) : ''; },
    setStorageSync(k, v) { store.set(k, v); },
    removeStorageSync(k) { store.delete(k); },
  };
}

const START = 1751900000000;

test('buildRunUploadPayload：门槛以下(时长<60s 且距离<100m)返回 null,不制造垃圾记录', () => {
  assert.equal(buildRunUploadPayload({ startMs: START, elapsedMs: 30000, distanceM: 50 }), null);
  assert.equal(buildRunUploadPayload({ startMs: 0, elapsedMs: 999999, distanceM: 5000 }), null);
  assert.equal(buildRunUploadPayload(null), null);
});

test('buildRunUploadPayload：正常跑步 → RunIn 形状,source=aiui,数值取整', () => {
  const p = buildRunUploadPayload({
    startMs: START, endMs: START + 1805000, elapsedMs: 1800000, distanceM: 5023.7,
    avgPaceSecPerKm: 358.4, avgBpm: 152.6, maxBpm: 171, avgCadenceSpm: 168.2,
  });
  assert.equal(p.started_at, new Date(START).toISOString());
  assert.equal(p.ended_at, new Date(START + 1805000).toISOString());
  assert.equal(p.duration_s, 1800);
  assert.equal(p.distance_m, 5024);
  assert.equal(p.avg_pace_s, 358);
  assert.equal(p.avg_hr, 153);
  assert.equal(p.max_hr, 171);
  assert.equal(p.cadence_avg, 168);
  assert.equal(p.source, 'aiui');
  assert.equal(p.workout_type, 'free');
});

test('buildRunUploadPayload：单眼镜无心率 → 心率字段整体缺席,不发 0/null', () => {
  const p = buildRunUploadPayload({ startMs: START, elapsedMs: 600000, distanceM: 1500 });
  assert.ok(!('avg_hr' in p) && !('max_hr' in p) && !('cadence_avg' in p) && !('avg_pace_s' in p));
  assert.equal(p.duration_s, 600);
});

test('buildRunUploadRequest：公网路径 /api/coach-svc/runs + Bearer', () => {
  const req = buildRunUploadRequest({ token: 't9', payload: { source: 'aiui' } });
  assert.equal(req.url, `${DEFAULT_BASE_URL}${RUN_UPLOAD_PATH}`);
  assert.equal(req.url, 'https://119.28.104.126.nip.io/api/coach-svc/runs');
  assert.equal(req.method, 'POST');
  assert.equal(req.header.Authorization, 'Bearer t9');
});

test('parseRunUploadResponse：200+id → id;401/无 id/空 → null', () => {
  assert.equal(parseRunUploadResponse({ statusCode: 200, data: { id: 42, source: 'aiui' } }), 42);
  assert.equal(parseRunUploadResponse({ statusCode: 401, data: { id: 42 } }), null);
  assert.equal(parseRunUploadResponse({ statusCode: 200, data: {} }), null);
  assert.equal(parseRunUploadResponse(null), null);
});

test('待传队列：入队 cap 5 丢最老;损坏 storage 返回 [];清空移除 key', () => {
  const s = fakeStorage();
  for (let i = 1; i <= 7; i += 1) enqueueRunUpload(s, { n: i });
  const q = readPendingRunUploads(s);
  assert.equal(q.length, PENDING_RUNS_MAX);
  assert.equal(q[0].n, 3, '超限丢最老');
  assert.equal(q[4].n, 7);
  writePendingRunUploads(s, []);
  assert.equal(s.store.has(PENDING_RUNS_KEY), false);
  // 损坏数据
  s.setStorageSync(PENDING_RUNS_KEY, 'garbage');
  assert.deepEqual(readPendingRunUploads(s), []);
  assert.deepEqual(readPendingRunUploads(null), []);
  // null payload 不入队
  const before = enqueueRunUpload(s, null);
  assert.deepEqual(before, []);
});
