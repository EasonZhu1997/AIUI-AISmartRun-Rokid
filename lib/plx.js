// Pulse Oximeter Service 0x1822 —— PLX Continuous Measurement (0x2A5F)。
// ESP32 模拟器扩展 profile；Chronos 手表有血氧硬件，重刷固件后可走此服务。

import { toBytes, sfloat16le } from './bytes.js';

/**
 * flags(uint8) 后：SpO2 (SFLOAT, %) + Pulse Rate (SFLOAT, bpm)。
 * SFLOAT 特殊值（NaN/NRes/±INF）→ 对应字段返回 null（无效读数）。
 */
export function parsePlxContinuous(value) {
  const bytes = toBytes(value);
  if (!bytes || bytes.length < 5) return null;

  const spo2 = sfloat16le(bytes, 1);
  const pulse = sfloat16le(bytes, 3);
  return {
    spo2Pct: Number.isFinite(spo2) ? spo2 : null,
    pulseBpm: Number.isFinite(pulse) ? pulse : null,
  };
}
