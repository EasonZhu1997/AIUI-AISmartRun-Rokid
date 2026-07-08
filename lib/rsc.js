// Running Speed & Cadence 0x1814 —— RSC Measurement (0x2A53)。
// 覆盖足垫（Stryd 等）与手表 RSC 广播；ESP32 模拟器扩展 profile 之一。

import { toBytes, u16le, u32le } from './bytes.js';

/**
 * flags(uint8): bit0 = 步幅存在(uint16, 0.01m)；bit1 = 累计距离存在(uint32, 0.1m)；
 *               bit2 = 1 跑步 / 0 步行。
 * 必有字段：Instantaneous Speed uint16 (1/256 m/s) + Instantaneous Cadence uint8 (步/分)。
 * @returns {null | {speedMps:number, speedKmh:number, cadenceSpm:number,
 *                   strideLengthM:number|null, totalDistanceM:number|null, running:boolean}}
 */
export function parseRscMeasurement(value) {
  const bytes = toBytes(value);
  if (!bytes || bytes.length < 4) return null;

  const flags = bytes[0];
  let off = 1;

  const speedMps = u16le(bytes, off) / 256;
  off += 2;
  const cadenceSpm = bytes[off];
  off += 1;

  let strideLengthM = null;
  if ((flags & 0x01) !== 0) {
    if (bytes.length < off + 2) return null;
    strideLengthM = u16le(bytes, off) / 100;
    off += 2;
  }

  let totalDistanceM = null;
  if ((flags & 0x02) !== 0) {
    if (bytes.length < off + 4) return null;
    totalDistanceM = u32le(bytes, off) / 10;
    off += 4;
  }

  return {
    speedMps,
    speedKmh: speedMps * 3.6,
    cadenceSpm,
    strideLengthM,
    totalDistanceM,
    running: (flags & 0x04) !== 0,
  };
}
