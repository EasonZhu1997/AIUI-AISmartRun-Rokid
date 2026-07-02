# PROGRESS · AIUI_AISmartRun

> 每轮开工前必读。规格 → 验收 → 进度 → 阻塞 → 下一步。

## 当前规格（2026-07-02 立项）

**交付物**：SmartRun 的 AIUI 轻量眼镜端 —— 运行在 Rokid Glasses（乐奇）眼镜端 Ink 容器里的
AIUI Agent，眼镜**直连标准 BLE 运动外设**（心率 0x180D 起步），实时 HUD 显示 +
AI 语音教练（内建 LanguageModel/ASR/TTS），无需自建 relay APK。
UI 信息架构迁移自 FunpizzaSmartRun 的 CXR-L HUD（大字排：心率/配速/步频/时长；
小字排：距离/时钟/电量；教练提示条；心率区间点阵）。

**验收预言机**：
- 开发期：Web 版 Craft（js.rokid.com/craft）或 AIUI Studio 预览可运行、无报错
- 真机门槛（写大量代码前必须先过的 3 个硬问题）：
  1. 息屏/口袋场景 Agent 是否持续运行、BLE notify 是否继续
  2. 1Hz 心率+配速刷新真机功耗/流畅度
  3. BLE connect/startNotifications 的 interactive 门槛对断线重连的影响
- 上架：AIUI Studio (Global) 提交通过 → 海外 Agent Store 可搜到

**架构事实（已由二次交叉核实确认，来源 js.rokid.com bundle 原文 + GitHub 官方样例）**：
- AIUI 逻辑层+视图层跑在**眼镜端** QuickJS+Skia 容器（Ink），非手机推流（≠CXR-L）
- 眼镜不直接联网：HTTPS/SSE/WS 经蓝牙由手机 Rokid AI APP 代理，对代码透明
- BLE：`navigator.bluetooth`（Ink 私有扩展 scanDevices）眼镜直连外设；
  官方样例 `_reference/samples/bluetooth/pages/heart_rate/index.ink` 就是 0x180D 完整链路
- **无 GPS API**（文档白名单没有；bundle 博客提到"地理位置"疑似规划中）→
  配速来源：BLE 外设（手表广播/足垫）或 IMU 步频估算，不要按"有 GPS"设计
- UI 硬规格：宽 480px、高 120-380px、黑底、绿色主题 token、无 emoji、
  WXSS 白名单（无 CSS animation/position:sticky；transition 可用）
- 数据刷新：唯一机制 setData；官方模式 = 事件回调 + 定时器聚合（chart 样例 2s，
  心率样例事件驱动 ~1Hz）；合并字段、onUnload/onHide 清理
- LLM：`LanguageModel.create()` 宿主注入；比赛官方推荐内置 DeepSeek V4 Pro
- 打包：.aix（aiui-aix pack，Windows 可用）；上架走 AIUI Studio；
  真机热更：Rokid AI APP → 设置 → 开发者 → AIUI 调试

**工具链缺口（阻塞项，需向 Rokid 确认）**：
- jsui / ink-open CLI 不在公开 npm；Windows 本地预览只能走 Web 版 Craft
- .aix 打包器公开渠道只有 reader；正式打包/签名流程无公开文档
- 国行眼镜能否绑 Hi Rokid + 海外账号（决定能否参加 7-06 前的海外征集）

## 决策记录

- 2026-07-02 · 用户选 **B（按部就班）**：跳过 7-06 海外征集冲刺，从 Step 1 起做完整版。
- 2026-07-02 · 真机四台已就位（见 `DEVICES.md`）：ESP32 模拟器 / Chronos 手表(待重刷) /
  Fenix 8(开广播即用) / Apple Watch(反面)。原采购清单大部分不再需要。
- 中心端已闭环：**AIUI 眼镜端可直接做 BLE central**（`.claude/skills/aiui-dev/apis-device.md`
  列出 navigator.bluetooth 全套 GATT API；官方 heart_rate 样例即完整实现）。
  注意 interactive 门槛：requestDevice/scanDevices/gatt.connect/startNotifications
  要求 InkView 处于交互态（apis-device.md 原文），息屏行为仍需真机验证。

## 分步计划

- [x] Step 0 · 调研 + 立项（官方模板骨架 + aiui-dev skill + 参考样例落盘）
- [x] Step 0.5 · 测试地基：lib/ 9 个纯逻辑模块（HRS/RSC/CSC/CPS/FTMS/PLX 解析 +
      会话聚合 + HUD 格式化 + 设备识别）+ 13 个 spec 文件 **56 测试全绿**
      （`python scripts/run_tests_on_hermes.py` = node --test 适配入口）
- [x] Step 1 · HUD 页初版：`pages/run_hud/index.ink`（CXR-L 定版信息架构：
      区间点阵 + 心率/配速/步频/时长大字排 + 距离/时钟/数据源小字排 + 教练条 +
      开始/暂停/结束；演示数据驱动，1s 聚合 setData）。
      ⏳ 待 Craft（js.rokid.com/craft 或 AIUI Studio）可视化验收后打勾定稿
- [ ] Step 2 · BLE 心率：改造官方 heart_rate 样例接入 HUD（扫描→连接→1Hz 刷新→断连重连引导）；
      交付 `tools/esp32_hr_sim/esp32_hr_sim.ino` 模拟器固件
- [ ] Step 3 · 跑步会话逻辑：计时/配速聚合/心率区间/setData 合并节流
- [ ] Step 4 · AI 教练：onVoiceWakeup + SpeechRecognition + LanguageModel 流式 + TTS
      （底版：_reference/samples/capabilities/pages/chat/index.ink）
- [ ] Step 5 · 真机三问验证（见验收预言机）→ 决定是否需要手机侧兜底
- [ ] Step 6 · 多设备兼容矩阵（对照采购清单逐台真机测）+ FTMS/RSC 扩展
- [ ] Step 7 · 打包 .aix → AIUI Studio 提审上架

## 卡点 / 阻塞

- （无代码级阻塞；工具链缺口见上）

## 复用资产（FunpizzaSmartRun）

- BLE 协议知识：`relay-apk/.../ble/BleHeartRateClient.kt`（HRP 解析+重连策略）、
  `FtmsTreadmillClient.kt`（FTMS flags 解析，未真机验证）—— 逻辑翻译成 JS
- HUD 设计定版：`relay-apk/.../rokid/RokidManager.kt` buildRunningLayout()
- 后端（可选）：FastAPI coach 服务已有 SSE 能力，AIUI 侧 wx.createEventSource 可直连
