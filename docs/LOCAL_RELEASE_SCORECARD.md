# AISmartRun 本地工程交付评分

日期：2026-07-08（对抗评审修复轮后）  
版本：0.1.0  
评分对象：AIUI 眼镜端工程、浏览器预览、自动化测试、本地 `.aix` 打包、PRD / 英文文档 / 后端契约  
评分依据：8 镜头对抗评审确认的 45 条缺陷已全部修复（含 5 条 critical）或显式降级为已知限制；`verify:release` 全绿，150/150 测试含 18 条页面生命周期级测试  
结论：本地工程交付评分 96 / 100；真机上架评分仍以 Alpha 设备矩阵为准

## 评分边界

这个评分只回答“当前工程是否已经整理到可以交给真机 Alpha 验证”的问题，不替代 AIUI Studio 正式签名、真机蓝牙授权、语音链路和运动传感器精度验证。

发布前本地总闸门：

```bash
npm run verify:release
```

该命令串行执行：

1. `npm run doctor:aiui`
2. `npm run preview:check`
3. `npm run test`
4. `npm run build`

## 维度评分

| 维度 | 分数 | 证据 |
|---|---:|---|
| MVP 范围清晰度 | 9.6 | 首页、HUD、蓝牙、设置、教练五页完整；跑步 HUD 仍保持纯展示；首页只做就绪陈述，连接收敛到 HUD。 |
| AIUI 文档对齐 | 9.6 | 页面使用 `.ink`、schema required、页面级 `onKeyUp`、`LanguageModel.create()`、`playTTS(text)`、`getDevices()` 优先策略都有测试或文档守卫。 |
| Rokid 眼镜 UI 适配 | 9.6 | 480px 卡片、黑底单绿色、无 emoji、无跑步页按钮；单绿色与 emoji 约束进入 doctor 自动扫描；长值（≥1h/≥10km/3 位心率）按字符数降字号防溢出并有单测。 |
| 物理按键体验 | 9.6 | 五页均显式处理 Backspace；HUD 跑步中双击确认防误触丢数据（页面级测试）；Enter / Space / GlobalHook 有默认动作。 |
| EverMind 后端边界 | 9.7 | 默认匿名登录只传 `app_id=AISmartRun` 和匿名 `device_id`；EverMind 密钥、空间和双写策略由后台配置；后端超时 2.5s + 登录负缓存不拖垮主链路（页面级测试）。 |
| 姊妹 APK 兼容 | 9.3 | `/coach/chat` 保留为 APK 后端生成链路；AIUI 主链路只用官方 `LanguageModel` 生成，后台做记忆和记录。 |
| 自动化测试覆盖 | 9.7 | 150/150：协议、会话、设置、教练、元数据、发布脚本、预览产物，以及 18 条页面生命周期级测试（心率断连回退、息屏自动暂停、双击退出、LLM 超时兜底、Z5 直答）。 |
| 预览交付 | 9.5 | 中文/英文、首页流程、蓝牙、设置、AI 气泡和全 UI 预览均有 HTML + PNG，已同步新口径文案；`preview:check` 用真实 emoji 码点扫描。 |
| 本地打包可重复性 | 9.6 | `verify:release` 一键闸门；`inspect:aix` 断言 pages 与 app.json 一致、version 与 VERSION（0.1.0）一致、内部文档不入包。 |
| 风险透明度 | 9.7 | 真机 BLE、IMU、ASR/LLM/TTS、息屏恢复和 AIUI Studio 签名仍明确列为 Alpha 门槛；maxHr 190、走跑步长不分档、中文 UI 显式写入 PRD 风险表与路线图。 |

## 仍不能宣称的事项

1. 不能宣称已通过 Rokid 真机完整验证。
2. 不能宣称 BLE 首次扫描一定可后台自动触发；产品口径应保持“已授权设备优先自动连接，首次在设备页授权”。
3. 不能宣称 IMU 距离和配速达到专业跑表精度。
4. 不能宣称已经完成 AIUI Studio 签名、上传和商店提审。

## 下一阶段出口

与 `ALPHA_TEST_MATRIX.md` 使用同一套门槛：必过项为 A-02、A-03、A-08、A-10、A-11，且 P0 用例（A-01 至 A-12）至少 10/12 通过。满足后才建议把“真机上架成熟度”从 88 分重新评估到 95 分以上。
