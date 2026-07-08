// HUD 显示格式化：口径与 FunpizzaSmartRun CXR-L HUD（RokidManager）一致，
// 占位一律 "--" / "--:--"，绝不显示 NaN/undefined。

export function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 配速 sec/km → "M:SS"；无效或慢于 20:00/km（走路以下）显示占位。 */
export function formatPace(secPerKm) {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 1200) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** km/h → 配速 sec/km（速度≈0 视为无配速）。 */
export function paceSecPerKmFromKmh(kmh) {
  if (!Number.isFinite(kmh) || kmh < 0.5) return null;
  return 3600 / kmh;
}

export function formatDistanceKm(meters) {
  if (!Number.isFinite(meters) || meters < 0) return '--';
  return (meters / 1000).toFixed(2);
}

export function formatBpm(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) return '--';
  return String(Math.round(bpm));
}
