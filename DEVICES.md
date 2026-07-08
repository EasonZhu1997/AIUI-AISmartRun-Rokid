# 真机设备清单（BLE 兼容矩阵）

> 目标：所有真实心率设备统一对齐标准 Heart Rate Service (0x180D)。
> 中心端结论（已核实）：**AIUI 眼镜端可直接做 BLE central**，见 PROGRESS.md「架构事实」。

## 目标协议

| 服务 | UUID | 解析器 | 测试 |
|---|---|---|---|
| Heart Rate (HRS) | 0x180D / 0x2A37 / 0x2A38 | `lib/hr.js` | `test/hr_parse.spec.mjs` 等 |
| Battery | 0x180F / 0x2A19 | `lib/hr.js` | `test/battery_location.spec.mjs` |
| RSC 跑步速度步频 | 0x1814 / 0x2A53 | `lib/rsc.js` | `test/rsc.spec.mjs` |
| CSC 骑行速度踏频 | 0x1816 / 0x2A5B | `lib/cycling.js` | `test/csc.spec.mjs` |
| Cycling Power | 0x1818 / 0x2A63 | `lib/cycling.js` | `test/cycling_power.spec.mjs` |
| FTMS 器械 | 0x1826 / 0x2ACD·0x2AD2 | `lib/ftms.js` | `test/ftms_*.spec.mjs` |
| PLX 血氧 | 0x1822 / 0x2A5F | `lib/plx.js` | `test/plx.spec.mjs` |

## 四台真机

| # | 设备 | 角色 | 状态 / 待办 |
|---|---|---|---|
| 1 | 微雪 ESP32-S3-Touch-AMOLED-1.75（S3R8，BLE5，QMI8658 IMU，无心率传感器） | **可控模拟器**：广播标准 HRS + 扩展 profile，60-170 bpm，断开自动重广播（测重连） | 待烧 `tools/esp32_hr_sim/esp32_hr_sim.ino`（Step 2 交付） |
| 2 | ESP32-S3 1.69″ 开源手表（jlego/espwatch-s3a-chronos，PPG 心率+血氧+IMU） | **真实心率 #1** | ⚠️ 出厂固件是 Chronos 私有 BLE 协议，需重刷：MAX3010x 读 PPG → 广播标准 HRS。到手确认：心率芯片型号 / I2C 引脚 / 框架 / Flash |
| 3 | Garmin Fenix 8 | **真实心率 #2** | 表上开：设置 → 传感器与配件 → 手腕式心率 → **广播心率**（或 Virtual Run）。只用标准 HR 广播，ANT+ 不用 |
| 4 | Apple Watch Series 7 | **封闭反面测试** | 无需连接。验证 `lib/registry.js` 的优雅失败提示（已有 `test/registry.spec.mjs` 用例） |

## 边界用例（免费）

- 第二台 Android 手机跑 nRF Connect GATT server：HR=0、字段缺失、notify 停止不断连、断连风暴
- ESP32 模拟器扩展：RSC/CSC/CPS/FTMS/PLX 逐个 profile 开播，验证多服务共存解析
