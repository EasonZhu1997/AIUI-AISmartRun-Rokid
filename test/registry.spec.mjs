import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUuid, classifyDevice } from '../lib/registry.js';

test('UUID 归一化：数字 / 4 位十六进制 / 命名别名 / 128-bit 等价', () => {
  const hr = '0000180d-0000-1000-8000-00805f9b34fb';
  assert.equal(canonicalUuid(0x180d), hr);
  assert.equal(canonicalUuid('180D'), hr);
  assert.equal(canonicalUuid('0x180d'), hr);
  assert.equal(canonicalUuid('heart_rate'), hr);
  assert.equal(canonicalUuid(hr.toUpperCase()), hr);
  assert.equal(canonicalUuid('not-a-uuid'), null);
});

test('标准心率设备（ESP32 模拟器 / Fenix 8 广播）→ 识别为心率能力', () => {
  const r = classifyDevice(['heart_rate', 'battery_service'], 'ESP32 HR Sim');
  assert.equal(r.supported, true);
  assert.deepEqual(r.capabilities, ['heartRate']);
});

test('多能力设备：FTMS 骑行台同时广播功率', () => {
  const r = classifyDevice([0x1826, 0x1818]);
  assert.equal(r.supported, true);
  assert.ok(r.capabilities.includes('fitnessMachine'));
  assert.ok(r.capabilities.includes('cyclingPower'));
});

test('Apple Watch 反面用例：无标准服务 → 优雅失败提示，不崩溃', () => {
  const r = classifyDevice([], 'Apple Watch');
  assert.equal(r.supported, false);
  assert.deepEqual(r.capabilities, []);
  assert.ok(r.message.includes('未开放标准蓝牙运动服务'));
  assert.ok(r.message.includes('Apple Watch'));
});

test('只广播私有 UUID（COROS POD 2 风格）→ 同样优雅失败', () => {
  const r = classifyDevice(['6e400001-b5a3-f393-e0a9-e50e24dcca9e'], 'COROS POD 2');
  assert.equal(r.supported, false);
});
