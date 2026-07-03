// 跑步模式(纯逻辑,可单测):数据源(蓝牙/无蓝牙) × 场景(户外/室内原地)。
// 参考 -L APK WorkoutTypes:室内/室外是横切维度(picker 顶部独立 toggle),
// 超慢跑天然原地——只看步频(≈180)和时长,不看配速距离。
// 模式经 wx storage 在 index → run_hud 间传递(顺带记住上次选择)。

export const MODE_STORAGE_KEY = 'run_mode';

export const SOURCES = [
  { key: 'ble', label: '蓝牙心率' },
  { key: 'imu', label: '无蓝牙' },
];

export const SCENES = [
  { key: 'out', label: '户外跑' },
  { key: 'in', label: '室内原地' },
];

const SRC_KEYS = SOURCES.map((s) => s.key);
const SCENE_KEYS = SCENES.map((s) => s.key);

/** 默认:无蓝牙+户外(人人可用,零依赖)。 */
export function defaultMode() {
  return { src: 'imu', scene: 'out' };
}

/** 校验/兜底一份 mode 对象(storage 里可能是旧值或损坏)。 */
export function normalizeMode(m) {
  const d = defaultMode();
  if (!m || typeof m !== 'object') return d;
  return {
    src: SRC_KEYS.includes(m.src) ? m.src : d.src,
    scene: SCENE_KEYS.includes(m.scene) ? m.scene : d.scene,
  };
}

/** HUD 数据源角标,如「蓝牙·户外」——短,跑步时一眼可读。 */
export function modeTag(m) {
  const { src, scene } = normalizeMode(m);
  return `${src === 'ble' ? '蓝牙' : '无蓝牙'}·${scene === 'in' ? '室内' : '户外'}`;
}

/** 开跑第一句语音(≤15 汉字)。室内原地按超慢跑口径:提步频不提配速。 */
export function startCue(m) {
  const { scene } = normalizeMode(m);
  return scene === 'in' ? '原地开跑，步频朝 180。' : '开跑，呼吸放稳。';
}

/** 室内原地=超慢跑口径:不看配速/距离(IMU 步长换算在原地无意义)。 */
export function isStationary(m) {
  return normalizeMode(m).scene === 'in';
}
