// 跑步记录上传:眼镜跑完把汇总指标写进后端 runs 表(source="aiui"),
// 让眼镜用户复用 APK 生态既有的跑后 AI 点评/洞察/周报管线(后端零改动)。
// 契约:POST /api/runs(server/coach/app/api/runs.py RunIn),JWT 鉴权(匿名直登同样有效)。
// 口径:只传汇总指标(时长/距离/均配/心率/步频),不传轨迹、不传 GPS —— 眼镜端本来就没有。
// best-effort:退出跑步只入待传队列(cap 5,FIFO),首页 onLoad 静默重试;
// 无 coach_app_key(记忆链路未开通)时队列保留,等 key 注入后自然补传。

import { normalizeBaseUrl, DEFAULT_BASE_URL } from './coach_api.js';

export const RUN_UPLOAD_PATH = '/api/coach-svc/runs';
export const PENDING_RUNS_KEY = 'pending_run_uploads';
export const PENDING_RUNS_MAX = 5;

// 上传门槛:太短的误进误出不值得成为一条"跑步记录"(也别去污染后端聚合)。
const MIN_ELAPSED_MS = 60000;
const MIN_DISTANCE_M = 100;

function toIso(ms) {
  return new Date(ms).toISOString();
}

/**
 * 由会话终值构建上传 payload;不够门槛(时长<60s 且距离<100m)返回 null。
 * 形状对齐后端 RunIn:started_at 必填 ISO,其余可空。
 */
export function buildRunUploadPayload(summary) {
  const s = summary && typeof summary === 'object' ? summary : {};
  if (!Number.isFinite(s.startMs) || s.startMs <= 0) return null;
  const elapsedMs = Number.isFinite(s.elapsedMs) && s.elapsedMs > 0 ? s.elapsedMs : 0;
  const distanceM = Number.isFinite(s.distanceM) && s.distanceM > 0 ? s.distanceM : 0;
  if (elapsedMs < MIN_ELAPSED_MS && distanceM < MIN_DISTANCE_M) return null;

  const payload = {
    started_at: toIso(s.startMs),
    duration_s: Math.round(elapsedMs / 1000),
    distance_m: Math.round(distanceM),
    source: 'aiui',
    workout_type: 'free',
  };
  if (Number.isFinite(s.endMs) && s.endMs >= s.startMs) payload.ended_at = toIso(s.endMs);
  if (Number.isFinite(s.avgPaceSecPerKm) && s.avgPaceSecPerKm > 0) {
    payload.avg_pace_s = Math.round(s.avgPaceSecPerKm);
  }
  if (Number.isFinite(s.avgBpm) && s.avgBpm > 0) payload.avg_hr = Math.round(s.avgBpm);
  if (Number.isFinite(s.maxBpm) && s.maxBpm > 0) payload.max_hr = Math.round(s.maxBpm);
  if (Number.isFinite(s.avgCadenceSpm) && s.avgCadenceSpm > 0) {
    payload.cadence_avg = Math.round(s.avgCadenceSpm);
  }
  return payload;
}

/** 构造上传请求(不发送)。 */
export function buildRunUploadRequest(opts = {}) {
  const { baseUrl = DEFAULT_BASE_URL, token, payload } = opts;
  const header = { 'Content-Type': 'application/json' };
  if (token) header.Authorization = `Bearer ${token}`;
  return {
    url: normalizeBaseUrl(baseUrl) + RUN_UPLOAD_PATH,
    method: 'POST',
    header,
    data: payload,
  };
}

/** 解析上传响应 → 后端 run id;失败返回 null。 */
export function parseRunUploadResponse(resp) {
  if (!resp || resp.statusCode !== 200 || !resp.data) return null;
  const id = resp.data.id;
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** 读待传队列;损坏/缺失返回 []。storage=wx。 */
export function readPendingRunUploads(storage) {
  if (!storage || typeof storage.getStorageSync !== 'function') return [];
  try {
    const raw = storage.getStorageSync(PENDING_RUNS_KEY);
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p === 'object') : [];
  } catch (_e) {
    return [];
  }
}

/** 写待传队列;空数组直接清 key。失败静默。 */
export function writePendingRunUploads(storage, list) {
  if (!storage) return;
  try {
    const clean = Array.isArray(list) ? list.slice(-PENDING_RUNS_MAX) : [];
    if (clean.length) storage.setStorageSync(PENDING_RUNS_KEY, clean);
    else storage.removeStorageSync(PENDING_RUNS_KEY);
  } catch (_e) {}
}

/** 入队一条待传记录(cap 5,超限丢最老)。payload 为 null 时不入队,返回当前队列。 */
export function enqueueRunUpload(storage, payload) {
  const list = readPendingRunUploads(storage);
  if (!payload) return list;
  const next = [...list, payload].slice(-PENDING_RUNS_MAX);
  writePendingRunUploads(storage, next);
  return next;
}
