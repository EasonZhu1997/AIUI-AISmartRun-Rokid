# AISmartRun 工程目录

更新日期：2026-07-08

## 目录总览

```text
AIUI_AISmartRun/
├── AGENTS.md
├── DEVICES.md
├── PROGRESS.md
├── README.md
├── VERSION
├── app.js
├── app.json
├── package.json
├── package-lock.json
├── pages/
│   ├── index/
│   │   └── index.ink
│   ├── run_hud/
│   │   └── index.ink
│   ├── bluetooth/
│   │   └── index.ink
│   ├── settings/
│   │   └── index.ink
│   └── coach/
│       ├── index.ink
│       └── coach-avatar.png
├── lib/
│   ├── session.js
│   ├── imu.js
│   ├── hr.js
│   ├── hud.js
│   ├── live.js
│   ├── run_upload.js
│   ├── settings.js
│   ├── devices.js
│   ├── coach.js
│   ├── coach_api.js
│   ├── format.js
│   ├── bytes.js
│   ├── registry.js
│   ├── rsc.js
│   ├── ftms.js
│   ├── cycling.js
│   └── plx.js
├── assets/
│   └── smartrun-runner-48.png
├── preview/
│   ├── index.html
│   ├── aismartrun-all-ui-preview.html
│   ├── aismartrun-home-waiting-preview.html
│   ├── aismartrun-settings-preview.html
│   ├── aismartrun-bluetooth-preview.html
│   ├── aismartrun-ai-voice-config-preview.html
│   ├── aismartrun-ui-preview.html
│   ├── aismartrun-ui-preview-en.html
│   └── *.png
├── docs/
│   ├── AISmartRun_PRD.md
│   ├── AISmartRun_PRD_EN.md
│   ├── AIUI_DOC_ALIGNMENT.md
│   ├── AIUI_RELEASE_WORKFLOW.md
│   ├── ALPHA_TEST_MATRIX.md
│   ├── BACKEND_EVERMIND_CONTRACT.md
│   ├── LOCAL_RELEASE_SCORECARD.md
│   ├── PRODUCT_PM_REVIEW.md
│   ├── PRODUCT_PM_REVIEW_EN.md
│   └── PROJECT_STRUCTURE.md
├── test/
│   ├── helpers/
│   │   └── load_page.mjs
│   ├── battery_location.spec.mjs
│   ├── bytes.spec.mjs
│   ├── coach.spec.mjs
│   ├── coach_api.spec.mjs
│   ├── csc.spec.mjs
│   ├── cycling_power.spec.mjs
│   ├── devices.spec.mjs
│   ├── format.spec.mjs
│   ├── ftms_bike.spec.mjs
│   ├── ftms_treadmill.spec.mjs
│   ├── hr_parse.spec.mjs
│   ├── hr_zone.spec.mjs
│   ├── hud.spec.mjs
│   ├── imu.spec.mjs
│   ├── live.spec.mjs
│   ├── metadata.spec.mjs
│   ├── pages_coach.spec.mjs
│   ├── pages_run_hud.spec.mjs
│   ├── pages_index.spec.mjs
│   ├── run_upload.spec.mjs
│   ├── plx.spec.mjs
│   ├── registry.spec.mjs
│   ├── rsc.spec.mjs
│   ├── running_ble_compat.spec.mjs
│   ├── session.spec.mjs
│   ├── settings.spec.mjs
│   └── short_text.spec.mjs
├── scripts/
│   └── run_tests_on_hermes.py
├── tools/
│   ├── aiui_doctor.mjs
│   ├── inspect_aix.mjs
│   ├── pack_aix.mjs
│   ├── scaffold_aiui.mjs
│   ├── validate_previews.mjs
│   ├── verify_release.mjs
│   └── esp32_hr_sim/
│       └── esp32_hr_sim.ino
└── release/
    └── AISmartRun-current.aix
```

## 页面层

| 路径 | 作用 |
|---|---|
| `pages/index/index.ink` | 默认入口。正式首页，读取设置与已记住设备显示单眼镜已就绪和心率就绪状态（不建立蓝牙连接），提供开跑/设备。 |
| `pages/run_hud/index.ink` | 跑步 HUD。开跑后自动记录并扫描连接心率设备（已记住设备优先）；息屏自动暂停、回来自动继续；Backspace 双击确认退出；心率断连或 8 秒无新数据回退单眼镜模式。 |
| `pages/bluetooth/index.ink` | 蓝牙设备页。搜索、记住和清除首选心率设备，控制自动心率开关；首选设备唯一写入入口。 |
| `pages/settings/index.ink` | 跑前配置页。调整步长、自动心率、语音提示、记忆增强。 |
| `pages/coach/index.ink` | AI 语音教练。读取实时跑步快照（10 秒过期），Z5 走确定性安全直答，其余走 LanguageModel（10 秒超时规则兜底）。 |

页面注册顺序在 `app.json` 中维护，当前默认首屏是 `pages/index/index`。

## 核心逻辑层

| 文件 | 作用 |
|---|---|
| `lib/session.js` | 跑步会话聚合：时长、距离、心率、步频、配速；支持暂停/恢复。 |
| `lib/imu.js` | 眼镜加速度计计步，估算步频和距离。 |
| `lib/hr.js` | 标准蓝牙心率包解析和心率区间（maxHr 固定 190；低于 50% maxHr 不点亮区间）。 |
| `lib/hud.js` | HUD 数值自适应字号纯逻辑。 |
| `lib/run_upload.js` | 跑步记录上传纯逻辑：payload 构建/门槛/待传队列（cap 5），首页静默补传到后端 runs 表（source="aiui"）。 |
| `lib/live.js` | HUD 到教练页的实时快照桥，使用本地 storage；快照带时间戳，超过 10 秒视为过期返回空。 |
| `lib/settings.js` | 跑前设置读写、归一化和显示格式化。 |
| `lib/devices.js` | 首选心率设备读写、显示名压缩和自动连接匹配。 |
| `lib/coach.js` | 教练 prompt、实时数据摘要、主动提示（Z5 期间每分钟重复降速提醒）和规则兜底。 |
| `lib/coach_api.js` | AIUI 问答记录写回、APK 兼容教练后端请求、匿名登录（2.5 秒超时、失败 60 秒不重试）、EverMind 记忆上下文、增强问题拼接。 |
| `lib/format.js` | 时长、配速、距离、心率显示格式化。 |
| `lib/registry.js` | BLE 设备能力识别和失败提示。 |
| `lib/rsc.js` | Running Speed and Cadence 解析。 |
| `lib/ftms.js` | FTMS 跑步机/骑行台数据解析。 |
| `lib/cycling.js` | CSC 和 Cycling Power 解析。 |
| `lib/plx.js` | 血氧 PLX 数据解析。 |
| `lib/bytes.js` | 通用字节读取和 SFLOAT 解析。 |

## 预览产物

| 文件 | 作用 |
|---|---|
| `preview/index.html` | 预览入口页，展示正式首页和页面触发流程。 |
| `preview/aismartrun-all-ui-preview.html` | 全部主要 UI 状态排版总览。 |
| `preview/aismartrun-home-waiting-preview.html` | 正式首页单独预览。 |
| `preview/aismartrun-bluetooth-preview.html` | 蓝牙设备页单独预览。 |
| `preview/aismartrun-ai-voice-config-preview.html` | AI 语音后台配置和气泡预览。 |
| `preview/aismartrun-settings-preview.html` | 设置页单独预览。 |
| `preview/aismartrun-ui-preview.html` | 中文 HUD / 教练组合预览。 |
| `preview/aismartrun-ui-preview-en.html` | 英文 HUD / 教练组合预览。 |
| `preview/*.png` | 上述各 HTML 的截图，由 `preview:check` 校验齐套。 |

这些文件只用于视觉确认，不参与 AIUI 运行时。

## 测试层

| 路径 | 作用 |
|---|---|
| `test/helpers/load_page.mjs` | `.ink` 页面脚本提取加载器，供页面生命周期级测试复用。 |
| `test/pages_run_hud.spec.mjs` | run_hud 页面生命周期测试（息屏暂停/恢复、Backspace 双击、心率回退等口径）。 |
| `test/pages_index.spec.mjs` | 首页页面级测试（就绪陈述、补传：无 key 零请求/成功清队/401 保留）。 |
| `test/run_upload.spec.mjs` | 上传 payload/请求/响应/队列纯逻辑测试。 |
| `test/pages_coach.spec.mjs` | coach 页面生命周期测试（Z5 直答、LLM 超时兜底、快照过期等口径）。 |
| `test/hud.spec.mjs` | HUD 数值自适应字号逻辑测试。 |
| `test/session.spec.mjs`、`test/imu.spec.mjs`、`test/live.spec.mjs`、`test/settings.spec.mjs`、`test/devices.spec.mjs` | 会话、计步、实时快照、设置、设备纯逻辑测试。 |
| `test/coach.spec.mjs`、`test/coach_api.spec.mjs` | 教练规则、主动提示、后端请求与兜底测试。 |
| `test/hr_parse.spec.mjs`、`test/hr_zone.spec.mjs`、`test/rsc.spec.mjs`、`test/csc.spec.mjs`、`test/cycling_power.spec.mjs`、`test/ftms_bike.spec.mjs`、`test/ftms_treadmill.spec.mjs`、`test/plx.spec.mjs`、`test/battery_location.spec.mjs`、`test/bytes.spec.mjs`、`test/registry.spec.mjs`、`test/running_ble_compat.spec.mjs` | BLE 协议解析与兼容测试。 |
| `test/format.spec.mjs`、`test/short_text.spec.mjs`、`test/metadata.spec.mjs` | 显示格式化、短文案长度守卫、页面/清单元数据守卫。 |
| `scripts/run_tests_on_hermes.py` | 当前测试入口（`npm test`），调用 Node test。 |

## 工具层

| 路径 | 作用 |
|---|---|
| `tools/pack_aix.mjs` | 本地 `.aix` 源码包打包命令，输出 `release/AISmartRun-current.aix`；不打包 PROGRESS.md、DEVICES.md 等进度文档。 |
| `tools/inspect_aix.mjs` | 使用 `@yodaos-pkg/aix` reader 校验 `.aix` 包标题、页面和工具定义。 |
| `tools/aiui_doctor.mjs` | 检查 AIUI 本地工具链、脚手架、AIX reader、zip 和当前 release 包（`npm run dev` 即此自检）。 |
| `tools/validate_previews.mjs` | 校验所有 HTML 预览都有 PNG 截图、尺寸仍是 480px 卡片规格，且没有退回旧 448/352 规格。 |
| `tools/verify_release.mjs` | 发布前总闸门，串行执行 doctor、预览检查、单测和本地 AIX 打包。 |
| `tools/scaffold_aiui.mjs` | AIUI 脚手架命令包装，统一项目内使用方式。 |
| `tools/esp32_hr_sim/esp32_hr_sim.ino` | ESP32 标准心率模拟器固件，用于真机 BLE 验证。 |

当前建议测试命令：

```bash
npm test
npm run doctor:aiui
npm run preview:check
npm run build:local
npm run verify:release
```

AIUI / AIX 开发工具：

```bash
npm run pack:aix
npm run inspect:aix
npm run doctor:aiui
npm run verify:release
npm run scaffold:aiui -- <new-agent-name>
```

## 文档与发布

| 路径 | 作用 |
|---|---|
| `README.md` | 项目入口文档，集中索引官方参考文档、本地文档、关键产品边界和验证命令。 |
| `AGENTS.md` | Agent manifest、Store 描述、权限、运行时能力、页面和设计约束。 |
| `docs/AIUI_DOC_ALIGNMENT.md` | Rokid AIUI / Ink 文档约束与当前工程落点。 |
| `docs/AIUI_RELEASE_WORKFLOW.md` | 本地命令、源码 `.aix` 与 AIUI Studio 正式包边界。 |
| `docs/ALPHA_TEST_MATRIX.md` | Alpha 真机测试矩阵和退出 Alpha 的最低门槛。 |
| `docs/AISmartRun_PRD.md` | 产品需求文档。 |
| `docs/AISmartRun_PRD_EN.md` | 英文版产品需求文档。 |
| `docs/BACKEND_EVERMIND_CONTRACT.md` | AIUI / 后端 / EverMind 默认接入契约。 |
| `docs/LOCAL_RELEASE_SCORECARD.md` | 本地工程交付评分，记录 95+ 的证据链和仍需真机确认的边界。 |
| `docs/PRODUCT_PM_REVIEW.md` | 产品经理多维评估、评分、风险和 Alpha 阶段建议。 |
| `docs/PRODUCT_PM_REVIEW_EN.md` | 英文版产品经理评估摘要。 |
| `PROGRESS.md` | 项目进度：顶部为当前状态，其余为历史轮次归档。 |
| `DEVICES.md` | BLE 设备兼容矩阵和真机测试清单。 |
| `VERSION` | 当前版本号（0.1.0）。 |
| `release/AISmartRun-current.aix` | 当前本地 `.aix` 源码包（不含 PROGRESS.md、DEVICES.md）；正式签名和提审仍走 AIUI Studio / 官方打包器。 |
