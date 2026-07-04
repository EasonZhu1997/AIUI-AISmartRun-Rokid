// 实时快照桥:run_hud 每拍把真实运动快照写进 wx storage,coach 页读同一份。
// 目的:教练不再用假 demoSnapshot(心率156/3.2km),而是看用户"此刻真实数据"
//   —— 没在跑时读到 null → summarizeSnapshot 给「暂无运动数据」,兜底也不编数。
// 纯逻辑 normalizeSnapshot 可单测;storage 包装接受注入的 storage 对象便于测试。

export const LIVE_SNAPSHOT_KEY = 'run_snapshot';

const NUM_FIELDS = ['bpm', 'zone', 'paceSecPerKm', 'cadenceSpm', 'distanceM', 'elapsedMs'];

/** 只保留有限数值字段 + paused/stationary 标志;无任何有效数值 → null。 */
export function normalizeSnapshot(s) {
  if (!s || typeof s !== 'object') return null;
  const out = {};
  let hasNum = false;
  for (const k of NUM_FIELDS) {
    if (Number.isFinite(s[k])) { out[k] = s[k]; hasNum = true; }
  }
  if (!hasNum) return null;
  out.paused = !!s.paused;
  if (s.stationary) out.stationary = true;
  return out;
}

/** 写实时快照;无有效数据则清掉(避免留下过期数据)。storage=wx。失败静默。 */
export function writeLiveSnapshot(storage, snap) {
  if (!storage) return;
  const n = normalizeSnapshot(snap);
  try {
    if (n) storage.setStorageSync(LIVE_SNAPSHOT_KEY, n);
    else storage.removeStorageSync(LIVE_SNAPSHOT_KEY);
  } catch (_e) { /* storage 不可用不影响主流程 */ }
}

/** 读实时快照 → 归一化对象或 null。storage=wx。失败/无数据 → null。 */
export function readLiveSnapshot(storage) {
  if (!storage) return null;
  try {
    return normalizeSnapshot(storage.getStorageSync(LIVE_SNAPSHOT_KEY));
  } catch (_e) { return null; }
}

/** 结束跑步时清掉,避免教练拿上一段的旧数据当"此刻"。 */
export function clearLiveSnapshot(storage) {
  if (!storage) return;
  try { storage.removeStorageSync(LIVE_SNAPSHOT_KEY); } catch (_e) {}
}
