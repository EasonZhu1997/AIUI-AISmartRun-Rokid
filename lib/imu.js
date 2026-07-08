// IMU 计步：用眼镜自带加速度计(W3C Accelerometer)算步数/步频/估算距离,
//   让「没有任何蓝牙设备」的用户也能拿到真实运动数据。
// 纯逻辑、无 AIUI/DOM 依赖,可单测。算法:合加速度幅值 → 慢速基线(吸收重力/姿态)
//   → 动态量峰值检测 + 迟滞(上/下双阈)+ 不应期(两步最短间隔),避免抖动重复计数。
// 与 BLE 心率/RSC 并行:有 RSC 步频/速度就用真源,没有就用本模块兜底。

const G = 9.80665;

export class StepDetector {
  constructor(opts = {}) {
    this.minStepMs = opts.minStepMs ?? 260;        // 不应期:两步最短间隔(≈230 spm 上限)
    this.maxStepMs = opts.maxStepMs ?? 2000;       // 超过此间隔认为已停止,步频归 0
    this.threshold = opts.threshold ?? 1.3;        // 动态量上阈(m/s²):峰值须超过基线+此值
    this.baselineAlpha = opts.baselineAlpha ?? 0.02; // 基线低通系数(慢,只吸收重力/姿态漂移)
    this.strideM = opts.strideM ?? 0.75;           // 默认步长(m),估距用(可按身高/步频调)
    this.cadenceWindow = opts.cadenceWindow ?? 6;  // 步频取最近 N 步间隔的中位数

    this.baseline = G;       // 幅值基线,初值=重力
    this.steps = 0;
    this.lastStepMs = null;
    this.armed = false;      // 迟滞状态:是否已越过上阈、等待回落成一步
    this.stepTimes = [];     // 最近若干步的时间戳(算步频)
    this.lastPushMs = null;
  }

  /**
   * 喂一帧原始加速度 (x,y,z 单位 m/s², tMs 毫秒时间戳)。
   * 返回 { stepped, steps, cadenceSpm }。
   */
  push(x, y, z, tMs) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(tMs)) {
      return this._state(false, this.lastPushMs);
    }
    this.lastPushMs = tMs;
    const mag = Math.sqrt(x * x + y * y + z * z);
    // 慢速低通更新基线;|重力|≈9.8 在任何头部姿态下都成立,故基线稳定。
    this.baseline += this.baselineAlpha * (mag - this.baseline);
    const dyn = mag - this.baseline;

    const upTh = this.threshold;
    const downTh = this.threshold * 0.5;  // 迟滞下阈,防止阈值附近抖动多次触发
    let stepped = false;

    if (!this.armed) {
      if (dyn > upTh) this.armed = true;             // 越过上阈 → 武装
    } else if (dyn < downTh) {
      this.armed = false;                            // 回落穿过下阈 → 计一步
      if (this.lastStepMs == null || (tMs - this.lastStepMs) >= this.minStepMs) {
        this.steps += 1;
        this.lastStepMs = tMs;
        this.stepTimes.push(tMs);
        if (this.stepTimes.length > this.cadenceWindow + 1) this.stepTimes.shift();
        stepped = true;
      }
    }
    return this._state(stepped, tMs);
  }

  /** 当前步频 spm:最近 N 步间隔的中位数;停止超过 maxStepMs 则归 0。 */
  cadenceSpm(nowMs = this.lastPushMs) {
    const t = this.stepTimes;
    if (t.length < 2) return 0;
    const last = t[t.length - 1];
    if (nowMs != null && nowMs - last > this.maxStepMs) return 0;  // 已停下
    const intervals = [];
    for (let i = 1; i < t.length; i++) intervals.push(t[i] - t[i - 1]);
    intervals.sort((a, b) => a - b);
    const mid = intervals[Math.floor(intervals.length / 2)];
    if (!(mid > 0)) return 0;
    return Math.round(60000 / mid);
  }

  /** 估算距离(m) = 步数 × 步长。 */
  distanceM() {
    return this.steps * this.strideM;
  }

  /** 走/跑判定:步频 ≥ 140 spm 视为跑步。 */
  isRunning(nowMs = this.lastPushMs) {
    return this.cadenceSpm(nowMs) >= 140;
  }

  reset() {
    this.steps = 0;
    this.lastStepMs = null;
    this.armed = false;
    this.stepTimes = [];
    this.baseline = G;
    this.lastPushMs = null;
  }

  _state(stepped, tMs) {
    return { stepped, steps: this.steps, cadenceSpm: this.cadenceSpm(tMs) };
  }
}
