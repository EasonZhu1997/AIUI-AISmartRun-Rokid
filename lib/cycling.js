// 骑行两件套：CSC 0x1816 (0x2A5B) 与 Cycling Power 0x1818 (0x2A63)。
// 对应迈金 S3+ / 骑行台功率；ESP32 模拟器扩展 profile。

import { toBytes, u16le, u32le, s16le } from './bytes.js';

/**
 * CSC Measurement (0x2A5B)。
 * flags(uint8): bit0 = 车轮圈数存在(uint32 累计 + uint16 事件时间 1/1024s)；
 *               bit1 = 曲柄圈数存在(uint16 累计 + uint16 事件时间 1/1024s)。
 */
export function parseCscMeasurement(value) {
  const bytes = toBytes(value);
  if (!bytes || bytes.length < 1) return null;

  const flags = bytes[0];
  let off = 1;
  const out = { wheel: null, crank: null };

  if ((flags & 0x01) !== 0) {
    if (bytes.length < off + 6) return null;
    out.wheel = { revolutions: u32le(bytes, off), lastEventTime1024: u16le(bytes, off + 4) };
    off += 6;
  }
  if ((flags & 0x02) !== 0) {
    if (bytes.length < off + 4) return null;
    out.crank = { revolutions: u16le(bytes, off), lastEventTime1024: u16le(bytes, off + 2) };
    off += 4;
  }
  return out;
}

/**
 * 由两次曲柄读数算踏频 rpm（处理 uint16 圈数与 1/1024s 时间戳的回绕）。
 * 时间未推进（同一包重发）返回 null。
 */
export function crankCadenceRpm(prev, curr) {
  if (!prev || !curr) return null;
  const revs = (curr.revolutions - prev.revolutions + 0x10000) % 0x10000;
  const dt1024 = (curr.lastEventTime1024 - prev.lastEventTime1024 + 0x10000) % 0x10000;
  if (dt1024 === 0) return null;
  return (revs * 60 * 1024) / dt1024;
}

/**
 * Cycling Power Measurement (0x2A63)。
 * flags(uint16) 后紧跟必有的 Instantaneous Power (sint16, W)；
 * 可选字段按 flags 顺序：bit0 踏板平衡(uint8)、bit2 累计扭矩(uint16)、
 * bit4 车轮圈数(uint32+uint16 1/2048s)、bit5 曲柄圈数(uint16+uint16 1/1024s)。
 */
export function parseCyclingPower(value) {
  const bytes = toBytes(value);
  if (!bytes || bytes.length < 4) return null;

  const flags = u16le(bytes, 0);
  let off = 2;
  const powerW = s16le(bytes, off);
  off += 2;

  if ((flags & 0x0001) !== 0) off += 1;      // Pedal Power Balance
  if ((flags & 0x0004) !== 0) off += 2;      // Accumulated Torque

  let wheel = null;
  if ((flags & 0x0010) !== 0) {
    if (bytes.length < off + 6) return null;
    wheel = { revolutions: u32le(bytes, off), lastEventTime2048: u16le(bytes, off + 4) };
    off += 6;
  }
  let crank = null;
  if ((flags & 0x0020) !== 0) {
    if (bytes.length < off + 4) return null;
    crank = { revolutions: u16le(bytes, off), lastEventTime1024: u16le(bytes, off + 2) };
    off += 4;
  }

  return { powerW, wheel, crank };
}
