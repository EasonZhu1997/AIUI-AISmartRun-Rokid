import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StepDetector } from '../lib/imu.js';

const G = 9.80665;

// 合成一段跑步加速度:合幅值 = G + A·sin(2π f t),每个正弦周期 = 一步。
// 以 sampleHz 采样喂进检测器,返回检测器。
function feedRunning(det, { cadenceSpm, seconds, amplitude = 4, sampleHz = 50, t0 = 0 }) {
  const f = cadenceSpm / 60;                 // 步/秒
  const dt = 1000 / sampleHz;
  const n = Math.round(seconds * sampleHz);
  for (let i = 0; i < n; i++) {
    const tMs = t0 + i * dt;
    const mag = G + amplitude * Math.sin(2 * Math.PI * f * (tMs / 1000));
    // 把幅值放到单轴(z),x/y=0 → sqrt(0+0+z²)=|z|=mag(mag>0 恒成立)
    det.push(0, 0, mag, tMs);
  }
  return t0 + n * dt;
}

test('静止(无振动)→ 0 步、步频 0', () => {
  const det = new StepDetector();
  for (let i = 0; i < 250; i++) det.push(0, 0, G, i * 20); // 5s 恒定重力
  assert.equal(det.steps, 0);
  assert.equal(det.cadenceSpm(), 0);
});

test('172 spm 跑 20s → 步数≈57、步频≈172', () => {
  const det = new StepDetector();
  const end = feedRunning(det, { cadenceSpm: 172, seconds: 20 });
  // 20s @172spm ≈ 57.3 步,允许起步/收尾各差 2
  assert.ok(det.steps >= 54 && det.steps <= 59, `steps=${det.steps}`);
  const cad = det.cadenceSpm(end);
  assert.ok(cad >= 164 && cad <= 180, `cadence=${cad}`);
  assert.ok(det.isRunning(end), 'isRunning 应为 true');
});

test('走路 110 spm → 识别为「走」(isRunning=false)', () => {
  const det = new StepDetector();
  const end = feedRunning(det, { cadenceSpm: 110, seconds: 15, amplitude: 2.5 });
  const cad = det.cadenceSpm(end);
  assert.ok(cad >= 100 && cad <= 122, `cadence=${cad}`);
  assert.equal(det.isRunning(end), false);
});

test('不应期:两个峰间隔 100ms 只算一步', () => {
  const det = new StepDetector({ minStepMs: 260 });
  // 峰1
  det.push(0, 0, G + 5, 0);      // 越上阈,武装
  det.push(0, 0, G, 20);         // 回落穿下阈 → 第1步
  // 峰2(距第1步仅 100ms,应被不应期滤掉)
  det.push(0, 0, G + 5, 100);
  det.push(0, 0, G, 120);
  assert.equal(det.steps, 1, `steps=${det.steps}`);
  // 峰3(距第1步 400ms,超过不应期 → 计第2步)
  det.push(0, 0, G + 5, 400);
  det.push(0, 0, G, 420);
  assert.equal(det.steps, 2, `steps=${det.steps}`);
});

test('停止后步频归 0(超过 maxStepMs 无新步)', () => {
  const det = new StepDetector({ maxStepMs: 2000 });
  const end = feedRunning(det, { cadenceSpm: 172, seconds: 10 });
  assert.ok(det.cadenceSpm(end) > 0, '刚跑完应有步频');
  // 停 3s 后查询 → 归 0
  assert.equal(det.cadenceSpm(end + 3000), 0);
});

test('估算距离 = 步数 × 步长', () => {
  const det = new StepDetector({ strideM: 0.8 });
  feedRunning(det, { cadenceSpm: 172, seconds: 20 });
  assert.equal(det.distanceM(), det.steps * 0.8);
  assert.ok(det.distanceM() > 0);
});

test('非法输入(NaN/undefined)不崩、不计步', () => {
  const det = new StepDetector();
  const r1 = det.push(NaN, 0, 0, 0);
  const r2 = det.push(0, 0, G, undefined);
  assert.equal(r1.steps, 0);
  assert.equal(r2.steps, 0);
  assert.equal(det.steps, 0);
});

test('reset 清零', () => {
  const det = new StepDetector();
  feedRunning(det, { cadenceSpm: 172, seconds: 5 });
  assert.ok(det.steps > 0);
  det.reset();
  assert.equal(det.steps, 0);
  assert.equal(det.cadenceSpm(), 0);
  assert.equal(det.distanceM(), 0);
});
