import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lenModifier, unifiedPaceMod, unifiedDistMod, unifiedElapsedMod,
  glassesDistMod, glassesElapsedMod,
} from '../lib/hud.js';

// 长值防溢出:WXSS 无 overflow/ellipsis,唯一手段是按字符数降字号。
// 断言口径来自 run_hud 网格列宽(px)与等宽字宽 ≈0.6em 的预算计算。

test('lenModifier:长度阈值 → ""/mid/sm', () => {
  assert.equal(lenModifier('5:38', 'v', 4, 6), '');
  assert.equal(lenModifier('19:59', 'v', 4, 6), 'v-mid');
  assert.equal(lenModifier('1234567', 'v', 4, 6), 'v-sm');
  assert.equal(lenModifier('', 'v', 4, 6), '');
  assert.equal(lenModifier(null, 'v', 4, 6), '');
});

test('unified 网格(心率接入):配速/距离/时长长值降档', () => {
  assert.equal(unifiedPaceMod('5:38'), '');        // 常规配速原字号
  assert.equal(unifiedPaceMod('19:59'), 'v-mid');  // 慢配速 5 字符降档
  assert.equal(unifiedDistMod('9.99'), '');        // <10km 原字号
  assert.equal(unifiedDistMod('10.00'), 'v-mid');  // ≥10km 降档
  assert.equal(unifiedDistMod('100.00'), 'v-sm');  // 超长再降
  assert.equal(unifiedElapsedMod('59:59'), '');    // <1h 原字号
  assert.equal(unifiedElapsedMod('1:01:01'), 'v-sm'); // ≥1h 7字符直接最小档
});

test('glasses 网格(单眼镜):距离/时长长值降档', () => {
  assert.equal(glassesDistMod('9.99'), '');
  assert.equal(glassesDistMod('10.00'), 'g-mid');
  assert.equal(glassesElapsedMod('59:59'), '');
  assert.equal(glassesElapsedMod('1:01:01'), 'g-sm'); // ≥1h 必须最小档才不压邻列
});
