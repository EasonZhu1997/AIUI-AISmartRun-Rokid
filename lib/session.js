// 跑步会话聚合器：由 BLE/传感器事件喂数据，1s 定时器取快照给 setData。
// 距离累加钳速 0..25 km/h（沿用 FunpizzaSmartRun 审计修复 a567775 的口径，
// 防异常速度值冲爆距离）。纯逻辑、无 I/O，眼镜端与测试共用。

const MAX_SPEED_KMH = 25;

export class RunSession {
  constructor(nowMs = 0) {
    this.startMs = nowMs;
    this.lastSpeedMs = null;     // 上一次速度样本时间
    this.distanceM = 0;
    this.lastBpm = null;
    this.lastCadence = null;
    this.paused = false;
    this.pausedAccumMs = 0;
    this.pauseStartMs = null;
  }

  /** 速度样本（km/h）驱动距离累加；无效/超钳速样本丢弃不推进时间。 */
  onSpeed(kmh, nowMs) {
    if (this.paused) return;
    if (!Number.isFinite(kmh) || kmh < 0 || kmh > MAX_SPEED_KMH) return;
    if (this.lastSpeedMs != null && nowMs > this.lastSpeedMs) {
      const dtH = (nowMs - this.lastSpeedMs) / 3600000;
      this.distanceM += kmh * 1000 * dtH;
    }
    this.lastSpeedMs = nowMs;
  }

  onHeartRate(bpm) {
    if (Number.isFinite(bpm) && bpm > 0 && bpm < 255) this.lastBpm = bpm;
  }

  onCadence(spm) {
    if (Number.isFinite(spm) && spm >= 0 && spm < 512) this.lastCadence = spm;
  }

  pause(nowMs) {
    if (this.paused) return;
    this.paused = true;
    this.pauseStartMs = nowMs;
    this.lastSpeedMs = null;   // 恢复后第一帧不跨暂停段累距离
  }

  resume(nowMs) {
    if (!this.paused) return;
    this.paused = false;
    this.pausedAccumMs += nowMs - this.pauseStartMs;
    this.pauseStartMs = null;
  }

  /** 运动净时长（去除暂停段），ms。 */
  elapsedMs(nowMs) {
    const pausedNow = this.paused ? nowMs - this.pauseStartMs : 0;
    return Math.max(0, nowMs - this.startMs - this.pausedAccumMs - pausedNow);
  }

  /** 全程平均配速 sec/km；距离太短（<10m）返回 null。 */
  avgPaceSecPerKm(nowMs) {
    if (this.distanceM < 10) return null;
    return this.elapsedMs(nowMs) / 1000 / (this.distanceM / 1000);
  }

  /** 每秒 setData 用的快照。 */
  snapshot(nowMs) {
    return {
      elapsedMs: this.elapsedMs(nowMs),
      distanceM: this.distanceM,
      bpm: this.lastBpm,
      cadenceSpm: this.lastCadence,
      avgPaceSecPerKm: this.avgPaceSecPerKm(nowMs),
      paused: this.paused,
    };
  }
}
