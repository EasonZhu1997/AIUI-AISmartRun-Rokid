// FTMS 0x1826：Treadmill Data (0x2ACD) 与 Indoor Bike Data (0x2AD2)。
// 字段顺序按 Bluetooth SIG FTMS v1.0 flags 位序逐个跳过/提取。
// ⚠️ 与 FunpizzaSmartRun/FtmsTreadmillClient.kt 注释的位序有一位偏差
//   （Kotlin 注释把 Inst/Avg Pace 合成一位）——以本文件（Inst Pace bit5、
//   Avg Pace bit6 独立）为准，真机（Thinkrider/健身房跑步机）验证后定稿。

import { toBytes, u8, u16le, u24le, s16le } from './bytes.js';

/**
 * Treadmill Data (0x2ACD)。flags 为 uint16：
 * bit0 More Data（为 0 时才有 Instantaneous Speed uint16 0.01km/h）
 * bit1 Avg Speed(uint16) · bit2 Total Distance(uint24 m) · bit3 Inclination+Ramp(2×sint16 0.1)
 * bit4 Elevation Gain(2×uint16) · bit5 Inst Pace(uint8) · bit6 Avg Pace(uint8)
 * bit7 Energy(uint16+uint16+uint8) · bit8 Heart Rate(uint8) · bit9 MET(uint8)
 * bit10 Elapsed(uint16 s) · bit11 Remaining(uint16 s) · bit12 Force+Power(2×sint16)
 */
export function parseTreadmillData(value) {
  const bytes = toBytes(value);
  if (!bytes || bytes.length < 2) return null;

  const flags = u16le(bytes, 0);
  let off = 2;
  const need = (n) => bytes.length >= off + n;
  const out = {
    speedKmh: null, totalDistanceM: null, inclinationPct: null,
    heartRateBpm: null, elapsedSec: null,
  };

  if ((flags & 0x0001) === 0) {
    if (!need(2)) return null;
    out.speedKmh = u16le(bytes, off) / 100;
    off += 2;
  }
  if ((flags & 0x0002) !== 0) { if (!need(2)) return null; off += 2; }          // Avg Speed
  if ((flags & 0x0004) !== 0) {
    if (!need(3)) return null;
    out.totalDistanceM = u24le(bytes, off);
    off += 3;
  }
  if ((flags & 0x0008) !== 0) {
    if (!need(4)) return null;
    out.inclinationPct = s16le(bytes, off) / 10;
    off += 4;                                                                    // 含 Ramp Angle
  }
  if ((flags & 0x0010) !== 0) { if (!need(4)) return null; off += 4; }          // Elevation ±
  if ((flags & 0x0020) !== 0) { if (!need(1)) return null; off += 1; }          // Inst Pace
  if ((flags & 0x0040) !== 0) { if (!need(1)) return null; off += 1; }          // Avg Pace
  if ((flags & 0x0080) !== 0) { if (!need(5)) return null; off += 5; }          // Energy 组
  if ((flags & 0x0100) !== 0) {
    if (!need(1)) return null;
    out.heartRateBpm = u8(bytes, off);
    off += 1;
  }
  if ((flags & 0x0200) !== 0) { if (!need(1)) return null; off += 1; }          // MET
  if ((flags & 0x0400) !== 0) {
    if (!need(2)) return null;
    out.elapsedSec = u16le(bytes, off);
    off += 2;
  }

  return out;
}

/**
 * Indoor Bike Data (0x2AD2)。flags 为 uint16：
 * bit0 More Data（为 0 时有 Inst Speed uint16 0.01km/h）· bit1 Avg Speed
 * bit2 Inst Cadence(uint16, 0.5rpm) · bit3 Avg Cadence · bit4 Total Distance(uint24)
 * bit5 Resistance(sint16) · bit6 Inst Power(sint16 W) · bit7 Avg Power
 * bit8 Energy 组 · bit9 HR(uint8) · bit10 MET · bit11 Elapsed(uint16) · bit12 Remaining
 */
export function parseIndoorBikeData(value) {
  const bytes = toBytes(value);
  if (!bytes || bytes.length < 2) return null;

  const flags = u16le(bytes, 0);
  let off = 2;
  const need = (n) => bytes.length >= off + n;
  const out = { speedKmh: null, cadenceRpm: null, totalDistanceM: null, powerW: null, heartRateBpm: null };

  if ((flags & 0x0001) === 0) {
    if (!need(2)) return null;
    out.speedKmh = u16le(bytes, off) / 100;
    off += 2;
  }
  if ((flags & 0x0002) !== 0) { if (!need(2)) return null; off += 2; }
  if ((flags & 0x0004) !== 0) {
    if (!need(2)) return null;
    out.cadenceRpm = u16le(bytes, off) / 2;
    off += 2;
  }
  if ((flags & 0x0008) !== 0) { if (!need(2)) return null; off += 2; }
  if ((flags & 0x0010) !== 0) {
    if (!need(3)) return null;
    out.totalDistanceM = u24le(bytes, off);
    off += 3;
  }
  if ((flags & 0x0020) !== 0) { if (!need(2)) return null; off += 2; }
  if ((flags & 0x0040) !== 0) {
    if (!need(2)) return null;
    out.powerW = s16le(bytes, off);
    off += 2;
  }
  if ((flags & 0x0080) !== 0) { if (!need(2)) return null; off += 2; }
  if ((flags & 0x0100) !== 0) { if (!need(5)) return null; off += 5; }
  if ((flags & 0x0200) !== 0) {
    if (!need(1)) return null;
    out.heartRateBpm = u8(bytes, off);
    off += 1;
  }

  return out;
}
