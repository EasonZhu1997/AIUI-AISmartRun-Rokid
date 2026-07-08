# PROGRESS · AIUI_AISmartRun

> 每轮开工前必读。规格 → 验收 → 进度 → 阻塞 → 下一步。

## 当前状态（2026-07-08）

当前形态：正式首页只读取设置与已记住设备并显示就绪状态（`refreshHeartReadiness`，不建立蓝牙连接），一键开跑后由跑步 HUD 完成扫描与连接（已记住设备优先，兜底连接的设备不写入首选）；HUD 息屏/切页自动暂停记录、回来自动继续（时长与距离口径一致），跑步中 Backspace 需 3 秒内双击确认才结束，心率 GATT 断连或 8 秒无新数据静默回单眼镜模式；AI 教练在 Z5 时走确定性安全直答（不经 LLM），LLM 流式回答 10 秒总超时后规则兜底、输出消毒为一句话，后端记忆/登录 2.5 秒超时且登录失败 60 秒内不重试；实时快照带时间戳，超过 10 秒视为过期返回空。测试口径：`npm test` 全绿（以命令输出为准，不锁定用例数）。

**本轮追加（2026-07-08 · 双产品线汇流第一步）**：眼镜跑步数据落后端 runs 表（`source="aiui"`，后端零改动）——新增 `lib/run_upload.js`（payload 构建/待传队列 cap5）、`RunSession` 补全程均值/峰值心率与均值步频累计、run_hud 确认退出/卸载幂等入队、首页 onLoad 静默补传（复用教练页匿名 JWT，无 `coach_app_key` 不发请求）；PRD FR-11、后端契约、Alpha A-14/B-07 同步；新增 14 条测试（run_upload 6 + session 2 + 页面级 6），npm test 全绿。同轮修复 AIUI↔后端 anon-login 契约断裂（后端必填 `app_key`，客户端曾按旧契约只发 `app_id` → 记忆链路静默全灭）；品牌名按三端既成事实确认为 AISmartRun。

**本轮（2026-07-08 · 对抗评审修复轮）**：8 镜头并行 PM 评审 + 每条发现独立对抗复核，74 条发现确认 45 条（5 critical），全部修复并加守卫：新增 `.ink` 页面脚本加载器（`test/helpers/load_page.mjs`）与 18 条页面生命周期级测试（run_hud 11 条 / coach 7 条）；新增 `lib/hud.js` 长值降档防溢出（≥1h 时长、≥10km 距离、3 位心率）；doctor 增加真实 emoji 码点与单绿色调色板扫描、全 5 页检查并消除引导悖论；`inspect:aix` 断言 pages/version/禁带文件，VERSION 统一 0.1.0，`.aix` 不再打包 PROGRESS/DEVICES；Alpha 出口门槛两文档统一并新增 A-13 防误触用例；Store 文案单源（AGENTS.md == package.json，有测试守卫）并如实声明首次配对。PM Review 复评：本地工程交付 96/100，真机成熟度维持 88/100 待 Alpha。

## 归档（历史轮次，口径以当前状态为准）

## 2026-07-08 · 95+ 本地交付闸门 + EverMind 后端默认配置

- **EverMind 默认预留**:AIUI 匿名登录默认只传 `app_id=AISmartRun` 和匿名 `device_id`;`app_key` 仅作为显式 legacy 参数保留,EverMind 密钥、空间、双写策略都由后台配置。
- **发布总闸门**:新增 `npm run preview:check` 和 `npm run verify:release`;总闸门串行跑 AIUI doctor、预览校验、单测、本地 AIX 打包检查。
- **95+ 评分**:新增 `docs/LOCAL_RELEASE_SCORECARD.md`;PM Review 更新为本地工程交付 96/100,同时保留真机/上架成熟度 88/100 的验证边界。
- **英文同步**:`docs/PRODUCT_PM_REVIEW_EN.md` 已同步 96/100 本地交付评分和 `verify:release` 命令。

## 当前 UI / AI 链路合并版（2026-07-07 · 单眼镜模式 + 心率同屏）

- **跑步页**:普通跑步状态和心率接入状态已合并为同一个 HUD,不再切换两套界面。
- **单眼镜模式**:替代旧的不可用口径;只显示眼镜侧可用/可估算数据:时间、步频、配速、距离,不显示 `--` 心率占位。传感器不可用时只保留时间。
- **心率接入**:标准蓝牙心率设备接入后,同一面板补充心率和心率区间点阵;不增加按钮。
- **交互**:跑步页仍是纯展示卡片,进页自动开始记录并尝试接入心率;失败时静默留在单眼镜模式。
- **AI 教练链路**:优先使用 Rokid 官方 AIUI `LanguageModel`(DeepSeek)生成短答;后端只做匿名登录、EverMind/本地记忆检索和 AIUI 已生成问答的记录写回。姊妹 APK 仍走后端 `/api/coach-svc/coach/chat` 生成并双写 EverMind。

## 极简自由跑（2026-07-04 夜 · 去掉模式选择，一键开跑）

用户定调"让项目更易用、尽量减少操作量":**砍掉一切模式选择**(蓝牙/无蓝牙、户外/室内 chips 全删)。
- **首页**:只剩「开始跑步」+「问教练」两个按钮,零配置。
- **HUD**:进页自动开跑;`autoConnectBle()` 自动扫描并连**第一个**心率设备(6s 没扫到就静默进无蓝牙模式);
  无蓝牙=心率恒 `--`,距离/配速全靠眼镜 IMU 计步估算。连不上/被手势门槛拒→静默留在单眼镜模式。
- 删 `lib/modes.js` + `test/modes.spec.mjs`;`connectDevice()` 抽出供自动/手动共用。node 100 全绿。
- **BLE 手势门槛存疑**:官方样例扫描都挂在按钮上(须用户手势)。onLoad 自动扫描能否成功要真机验;
  不行则维持单眼镜模式。真机测试项。

## 对抗评审修复轮（2026-07-04 夜 · Opus 复核 8 条确认缺陷）

多智能体对抗评审(4 lens × 3 票复核)确认并已修:
1. 🔴 run_hud onShow 只恢复 ticker 不恢复加速度计 → 熄屏/浮层后步数步频距离永久冻结。修:onShow running 时补 startAccel。
2. 🟠 coach 页假 demoSnapshot(156/Z4/3.2km) 与真实模式流矛盾。修:新 lib/live.js 实时快照桥(run_hud 每拍写 wx storage,coach 读),无数据→「暂无运动数据」不编数。
3. 🟠 sourceTag 拼长设备名撑爆 140px 列。修:BLE 连上只显「蓝牙已连」。
4. avatar-src 文案缩短(≤15)。
5-8(后端): goals list[dict] 被 str() 又吐 dict repr(+非 list 会 500)→ _goal_label 按 description/label/kind 取标签;补回 gender/resting_hr/longest_run_km;anon-login phone 唯一约束竞态 catch IntegrityError 回滚重查;测试改用生产真实 goals 形态。

**验收**:眼镜 node 107 全绿(+live.spec 5);后端 hermes 226 全绿(+3)。

## 本轮（2026-07-04 夜 · 起跑模式选择 + 短话术）

**规格**：① 首页改成起跑模式选择页（参考 -L WorkoutTypes：室内/室外横切维度）——
数据源【蓝牙心率/无蓝牙】× 场景【户外跑/室内原地】，选完点「开始跑步」进 HUD **自动开跑**（少一次点击）。
② 室内原地=超慢跑口径：不看配速/距离，小字排显示**步数**，开跑语音提步频 180。
③ 全部话术 ≤15 汉字（PERSONA 硬约束 + fallback + 主动提示 + UI 文案），`test/short_text.spec.mjs` 长度守卫。
④ 可点控件统一 view+text（修 Craft 下 button 文字不渲染）。⑤ 蓝牙按钮仅蓝牙模式显示。
模式经 `wx storage(run_mode)` 传递并记住上次选择，`lib/modes.js` 纯逻辑可单测。

**验收**：node --test 全绿（102）✅；Craft 渲染+交互点按验证（待）；配套后端画像修复 hermes 223 绿 ✅。

## 当前规格（2026-07-02 立项）

**交付物**：AISmartRun 的 AIUI 轻量眼镜端 —— 运行在 Rokid Glasses（乐奇）眼镜端 Ink 容器里的
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
- 本项目已补本地工具：`npm run build` 生成源码 `.aix` 并用 `@yodaos-pkg/aix`
  reader 校验页面/工具定义；正式签名和提审仍以 AIUI Studio / 官方打包器为准

**工具链缺口（阻塞项，需向 Rokid 确认）**：
- jsui / ink-open CLI 不在公开 npm；Windows 本地预览只能走 Web 版 Craft
- .aix 官方打包器公开渠道仍只有 reader；正式打包/签名流程无公开文档
- 国行眼镜能否绑 Hi Rokid + 海外账号（决定能否参加 7-06 前的海外征集）

## 🎉 部署成功 2026-07-03 · AISmartRun 在真实 AIUI 运行时跑起来了

**全链路打通并验证**：本地代码 → GitHub(EasonZhu1997/AIUI-AISmartRun-Rokid) →
Craft「GitHub 子目录」导入 → 在线打包 `.aix`(2.31MB) → 创建灵珠智能体
**「AISmartRun 跑步教练」Agent ID `06b3763d208e4a29a4063ea302438389`** →
本地目录绑定该 agent → **运行智能体**。
- ✅ 首页 index 渲染正确（AISmartRun 标题 + 副标题 + CTA 按钮）
- ✅ **HUD 页 run_hud 渲染正确**（心率区间点阵 + 心率/配速/步频/时长四大字 +
  距离/时间/数据源=演示 + 「● 等待开始运动」待机态；占位 `--` 是浏览器预览无 BLE 的正确表现）
- Craft tab 带 defaultAgentId；「运行智能体」下拉可选运行 index/run_hud/coach 任一页
**遗留**：① 浏览器预览无真实 BLE/语音/LLM，需真眼镜+设备实测心率/教练；
② 眼镜真机镜像需在眼镜上确认；③ GitHub 仓库导入后应改回私有(Craft 已缓存工程)。
**踩坑记录**：创建智能体表单的预览图/.aix 非硬必填(空提交也建成了 agent)；
Craft GitHub 导入只支持公开仓(私有仓报"仓库不存在")；file_upload 只接受会话附件、
无法上传本地/生成文件；GitHub 细粒度 PAT 不能建仓/改可见性(需用户手动)。

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
      （`python3 scripts/run_tests_on_hermes.py` = node --test 适配入口）
- [x] Step 1 · HUD 页初版：`pages/run_hud/index.ink`（CXR-L 定版信息架构：
      区间点阵 + 心率/配速/步频/时长大字排 + 距离/时钟/数据源小字排 + 教练条 +
      开始/暂停/结束；演示数据驱动，1s 聚合 setData）。
      ⏳ 待 Craft（js.rokid.com/craft 或 AIUI Studio）可视化验收后打勾定稿
- [x] Step 2 · BLE 心率：run_hud 接官方 heart_rate 样例链路（扫描→列表选设备→GATT connect→
      notify 喂 RunSession→断连引导手动重连；interactive 门槛按规范由点击触发）。
      交付 `tools/esp32_hr_sim/esp32_hr_sim.ino`（标准 HRS 0x180D 模拟器固件，断连自动重广播）。
      ⏳ 待真机联调（Fenix 8 开广播心率 / ESP32 模拟器）
- [x] Step 4 · AI 语音教练：`pages/coach/index.ink`（onVoiceWakeup/点按 → SpeechRecognition →
      LanguageModel 流式 → speechSynthesis/wx TTS），逻辑抽进 `lib/coach.js`（buildCoachSystemPrompt
      注入实时数据 + fallbackCoachReply 规则兜底：LLM 离线也给有用回答，Z5 安全优先）。
      10 用例覆盖。⏳ 待真机验证 LLM/ASR/TTS 宿主可用性
- [ ] Step 3 · 跑步会话与 coach 共享 RunSession（现 coach 用 demoSnapshot；提到共享模块两页读同一份）
- [ ] Step 5 · 真机三问验证（息屏存活/1Hz 功耗/断连重连门槛）→ 决定是否需要手机侧兜底
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

## 2026-07-04 · no-BLE IMU 计步 + 主动语音 + DeepSeek/EverMind 记忆教练(P1-P4)

无蓝牙设备也能用 + 眼镜教练接自家后端记忆。全部 85 单测绿(原 66 + 新增 19)。
- **P1 IMU 计步**(`lib/imu.js` StepDetector + `test/imu.spec.mjs` 8 测):加速度峰值检测+迟滞+不应期→步数/步频/估距/走跑判定;接进 `pages/run_hud`(替换演示源,`new Accelerometer` 喂步检测,步频×步长→速度喂 RunSession)。AGENTS.md 加 `accelerometer` 权限。
- **P2 主动语音**(`lib/coach.js` `nextProactiveCue` + 4 测):进 Z5 安全降速>整公里>每 5 分>进 Z4;run_hud tick 里 `wx.speech.playTTS` 主动播报。
- **P3 头像**(`pages/coach/coach-avatar.png` 复用 APK launcher 圆标 + coach 页 avatar 行/样式)。
- **P4 AIUI DeepSeek + EverMind 记忆教练**(`lib/coach_api.js` + coach 页 `answer()`):Tier1 Rokid 官方 AIUI `LanguageModel`(DeepSeek,注入实时快照+记忆上下文)→ 后端 `/api/coach-svc/coach/aiui-record` 记录并双写 EverMind → Tier2 规则兜底;姊妹 APK 继续兼容后端 `/api/coach-svc/coach/chat` 生成链路。
- **✅ 后端已验证**:直连 8001 带 token → EverMind 个性化回复(叫"朱老师"、记得连跑 6 天)。
**待办(runtime/ops)**:① nginx `/api/coach-svc/` 转发 POST body bug(直连正常),需当面确认后修生产 nginx;② 眼镜首跑注入 `wx.setStorageSync('coach_token',...)`;③ 重新打包上传 agent(带 accelerometer 权限)才能真机 IMU。

## 2026-07-08 · AIUI 审核项收口 + 英文版交付

- 工具链：新增 `npm run doctor:aiui`、`npm run dev`、`npm run build:local`；本地 `.aix` 明确为源码检查包，正式签名/提审仍走 AIUI Studio。
- 设计口径：AGENTS、PRD、预览 HTML 统一到 AIUI 当前 480px 宽、120-380px 高；英文预览移除 `white-space`。
- 物理按键：所有运行时页面显式处理 Backspace：首页退出，蓝牙/设置返回，HUD 清理 ticker/accelerometer/BLE/live snapshot 后返回，教练页进行中先取消。
- EverMind：默认保留后端接入；AIUI 端不携带密钥，只发送 `app_id=AISmartRun` 与匿名 `device_id`，后端负责 EverMind 空间、密钥和双写策略。
- 英文版：新增 `docs/AISmartRun_PRD_EN.md`、`docs/PRODUCT_PM_REVIEW_EN.md`，并新增 `docs/BACKEND_EVERMIND_CONTRACT.md` 与 `docs/AIUI_RELEASE_WORKFLOW.md`。
- 验证：`npm run doctor:aiui` 通过；`python3 scripts/run_tests_on_hermes.py` 当时 120 通过（后续用例数以 `npm test` 输出为准）；`npm run build` 生成并检查 `release/AISmartRun-current.aix` 通过。
