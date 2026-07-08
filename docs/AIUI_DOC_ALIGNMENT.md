# AISmartRun AIUI 文档对齐清单

日期：2026-07-08  
目标：把产品和工程决策显式对齐 Rokid AIUI / Ink 文档约束，减少真机阶段踩坑。

## 参考文档

| 文档 | 关键约束 | 项目落点 |
|---|---|---|
| `.agents/skills/aiui-dev/SKILL.md` | AIUI 项目结构、`.ink` 单文件组件、卡片式眼镜 UI、黑底绿色 token、480px 宽、120-380px 高度建议 | 所有页面使用 `.ink`；首页、HUD、设备、设置、教练均使用原生 `card`；跑步 HUD 不放按钮；预览尺寸已统一到 480px。 |
| `.agents/skills/aiui-dev/apis.md` | 只使用已确认 API，不假设浏览器完整语义 | 新增 `test/metadata.spec.mjs` 的 AIUI runtime usage 守卫。 |
| `.agents/skills/aiui-dev/apis-device.md` | `scanDevices` 是 Ink 私有 API；`scanDevices`、`connect`、`startNotifications` 需要交互态；`getDevices` 可在非交互态使用 | 首页、HUD、设备页优先用 `getDevices()` 尝试已记住设备，再回退 `scanDevices()`。 |
| `.agents/skills/aiui-dev/apis-ai.md` | `LanguageModel.create()` 支持 `initialPrompts`；`promptStreaming()` 是 polling stream；`SpeechRecognition.start()` 需要交互态 | 教练页不指定模型名，交给宿主 defaultModel；流式读取用 `stream.read()`；语音由按键/点击触发。 |
| `.agents/skills/aiui-dev/apis-wx.md` | `wx.speech.playTTS(text)` 接收字符串；`wx.request` 回调形态固定 | 教练页和 HUD 都按字符串调用 `playTTS(text)`；后端请求统一 Promise 包装并超时降级。 |
| `.agents/skills/aiui-dev/wxss.md` | 禁用未确认 CSS，如 `white-space`、`word-break`、`visibility`、`animation`、`position: sticky` | 页面源码新增测试守卫，确保运行时页面不使用未确认 WXSS。 |
| `.agents/skills/aiui-dev/components.md` | `view/text/image/card` 等组件以 WXSS 控制布局；`bindtap` 为框架通用事件 | 跑步 HUD 使用纯展示卡片；可交互页面用 `view + bindtap` 和页面级 `onKeyUp`。 |

## 本轮已落地

1. 页面 schema 补齐 `required`，让 AIX tools 和页面契约更明确。
2. 首页、HUD、设备页优先尝试 `navigator.bluetooth.getDevices()` 中已授权/已记住设备。
3. 教练页 `wx.speech.playTTS` 改为文档确认的 `playTTS(text)` 字符串调用。
4. 新增自动化测试，覆盖 AIUI runtime 用法、TTS 签名、页面 schema required、WXSS 禁用项、预览尺寸和发布脚本。
5. 明确 Rokid 物理按键：Backspace 在首页退出、配置/设备返回、教练取消或返回、HUD 释放资源后返回。
6. EverMind 默认保留为后端能力：AIUI 端只传 `app_id=AISmartRun` 和匿名设备 ID；密钥、空间和双写策略由后端配置。
7. 新增 `npm run doctor:aiui`、`npm run preview:check`、`npm run verify:release`、`npm run dev`、`npm run build:local`，区分本地源码 `.aix` 与 AIUI Studio 正式包。

## 仍需真机确认

1. `gatt.connect()` 与 `startNotifications()` 在首页/HUD 已授权设备自动路径中是否仍受交互态影响。
2. `SpeechRecognition.start()` 在 `GlobalHook`、Enter、页面点击三种入口下是否都被宿主识别为交互态。
3. `wx.speech.playTTS(text)` 在眼镜端是否立即返回 token 或空串，以及状态是否需要人为延迟恢复。
4. `Accelerometer` 50Hz 采样在 1Hz HUD 聚合下的功耗和稳定性。
5. AIUI Studio 正式打包/签名后的包是否与本地 `.aix` reader 检查结果一致。
