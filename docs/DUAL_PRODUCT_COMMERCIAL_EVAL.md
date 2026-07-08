# AISmartRun 双产品线商业化评估报告

日期：2026-07-08  
评估对象：  
A) **AIUI 眼镜端**（本仓库）— Rokid Glasses 原生 AIUI Agent，单眼镜跑步 HUD + AI 语音教练，匿名 device_id，本地工程交付 96/100  
B) **APK 生态**（`/Users/apple/Desktop/Project/AISmartRun`，FunpizzaSmartRun）— Garmin 表 + 手机原生 App + Rokid CXR-L HUD + FastAPI 后端 + iOS  
评估方法：5 个子系统并行盘点（后端 / 手机端 / 边缘端 / 上架就绪 / 双端关系）+ 综合，全部结论附文件证据；另有跑者需求矩阵（14 项 JTBD）与 AIUI 上架差距清单（17 项）两份专项输入。

---

## 1. 双项目关系定性

**一句话：共享同一后端（coach-svc）与同一 HUD 设计语言，但账号、数据管线、分发流水线完全独立——事实上是两条产品线，不是一个产品的两个形态。**

| 维度 | AIUI 眼镜端 | APK 生态 | 关系 |
|---|---|---|---|
| 眼镜 HUD | 原生 Agent（眼镜内运行，可独立于手机） | CXR-L SDK 从手机推送（`RokidManager.buildRunningLayout()`，AIUI 端 HUD 设计即源于此） | **同一块屏幕的两条互斥路线** |
| 商店分发 | AIUI Agent Store（待提审） | Google Play 已把 CXR-L 能力主动关闭（`play` flavor `ROKID_AUTH_ENABLED=false`）；`rokid` flavor 仅 side-load | **AIUI Agent 是唯一可走商店分发的眼镜 HUD** |
| 账号 | 匿名 `device_id`（anon-login） | 手机号 SMS → JWT | 同一 users 表，但**无绑定/合并端点** |
| 跑步数据 | 不落库（跑完即消失，仅跑中 wx storage 快照） | runs 全管线（记录/导入/洞察/周报/对比/缩略图） | **最大互补点：后端零改动可承接 AIUI 数据** |
| AI 教练 | 眼镜内 LanguageModel（DeepSeek）+ 后端记忆 | 后端 `/coach/chat` 生成 + 双写 EverMind | 共用记忆体系（sqlite-vec 主力，EverMind 双写灰度） |

### 推荐产品组合策略

- **旗舰/商业化载体 = APK 生态**：唯一拥有账号、订阅表、邀请裂变、runs 全管线、iOS 已提审、Play 技术就绪的一端。
- **入口/获客钩子 = AIUI 眼镜 Agent**：商店版 APK 已阉割 CXR-L，AIUI Agent 是眼镜场景唯一的合规分发通道；其"眼镜独立可跑"是 Rokid 生态标杆卖点。
- **眼镜 HUD 路线取舍**：商店分发押 AIUI；CXR-L 退守 side-load 硬件验证与未来 Pro+AR 高级能力（AIUI 做不到的跟跑导航等）。CXR-L 公开化依赖 Rokid 包名白名单 BD，不可控，不作主线。

---

## 2. 各子系统成熟度（盘点结论）

| 子系统 | 成熟度 | 关键事实 |
|---|---:|---|
| 后端 coach-svc | 7/10 | 26 个路由域、254 个测试、已在线可探活；订阅表/额度墙/邀请送 PRO 已实装；**微信支付被代码闸门禁用**（`_WECHAT_V3_SIGNATURE_IMPLEMENTED=False`）、无 Apple IAP；生产环境仍 `ENVIRONMENT=dev`（**线上万能验证码 123456 可用**）；单机 SQLite + nip.io 域名 |
| 手机 relay-apk | 7.5/10 | 原生「记录→暂停→保存→上传→AI 点评」闭环，防御性强（进程被杀恢复/无 GMS 回退/离线补传）；BLE HRP + FTMS；Garmin 双向；Play 包主动关闭 Rokid 能力 |
| 边缘端 | — | Garmin watch-app/datafield 可用未提审（SimHei 字体授权是 CIQ 提审前置）；iOS 2026-07-07 已 submitted（免费无 IAP）；prototype 资产可用 |
| AIUI 眼镜端 | 96/100（本地） | 本仓库；待真机 Alpha + Studio 提审；**跑步数据不落库** |
| 上架/合规 | 4/10 | 技术 7 分、商业 0 分：无一条已在走的收入通道；Play 外部链（账号+12 人×14 天封测）未启动；隐私链路（ConsentGate/导出/注销）已完成是亮点 |

---

## 3. 本轮发现并已修复：AIUI↔后端契约断裂（M0 级）

**问题**：后端 `anon-login` 强制要求 `app_key`（缺失 422 / 不匹配 401），而 AIUI 端按旧契约只发 `app_id` → 眼镜端匿名登录必然失败 → 记忆检索/问答记录**静默全灭**，"教练认识你"的差异化卖点在真机 Alpha 将系统性失真。根因：仓库转公开时删除了 `const APP_KEY`，契约文档随后写成了"后端应按 app_id 路由"——**该行为后端从未实现**。

**已修复（本仓库侧）**：
- `lib/coach_api.js`：新增 `coach_app_key` storage 注入口径，`resolveCoachBackendConfig` 读出 `appKey`；
- 教练页 `ensureToken`：无 key 时**跳过登录**（不打必失败请求、不付超时成本），记忆显式关闭、教练回答不受影响；有 key 时正常换 JWT；
- `BACKEND_EVERMIND_CONTRACT.md` 改写为部署现实（app_key 必填 + 注入口径 + 历史备注）；
- `ALPHA_TEST_MATRIX.md` A-12 增加前置（先注入 `coach_app_key`）；
- 新增/修订 3 个测试；`npm run verify:release` 全绿（151/151）。

---

## 4. 商业化统一差距清单

| 分组 | 事项 | 状态 | 排期 |
|---|---|---|---|
| **支付收入** | 微信 v3 验签/商户号/订单表 | 骨架+硬闸门禁用 | M2 |
| | Apple IAP | 缺失 | M2/M3 |
| | 订阅表 / require_pro / 402 额度墙 / 邀请送 PRO | ✅ 已完成 | — |
| | 定价（Free / Pro / Pro+AR 三档草案） | 仅文档 | M2 拍板 |
| **账号打通** | AIUI anon-login 契约断裂 | ✅ **本轮已修（AIUI 侧）** | M0 |
| | 匿名 device_id ↔ 手机号绑定/合并端点 | 缺失（零规划） | M1 |
| | **AIUI 跑步数据落 runs 表**（后端零改动，眼镜端跑完 POST `/api/runs` source="aiui"，立即复用跑后 AI 点评/洞察/周报全管线） | ✅ **眼镜侧已实现（2026-07-08）**：`lib/run_upload.js` + 退出入队（cap 5）+ 首页静默补传 + 14 条测试；PRD FR-11、契约文档、Alpha A-14 已同步。待真机验证 | ~~M1~~ 已提前完成 |
| | 短信生产接线（腾讯签名/模板） | 代码就绪、provider 未接 | M0-M1 |
| **留存** | 远程推送（FCM/APNs/微信模板） | 纯 stub | M1 |
| | D1/D3/D7 拉活 job | 已写、无通道静默跳过 | M1（随推送解锁） |
| | 周报/连续天数/成就/本地提醒 | ✅ 已完成 | — |
| | 眼镜端跑后总结卡（单屏摘要，跑者需求矩阵判定为上架前必做） | 缺失 | **M0-M1** |
| | 眼镜端自定义 maxHr（Z5 播报准确性） | 缺失（P1 已入 PRD） | M1 |
| **合规** | 生产环境切 prod（关万能码/mock-pay） | 未切（代码闸门齐备） | **M0** |
| | 密钥轮换（root 密码、voice 明文 API key 均已入 git 历史） | 未处理 | **M0 · 唯一"正在流血"项** |
| | 隐私链路（ConsentGate/导出/PIPL 注销） | ✅ 已完成 | — |
| | 国内 ICP/软著/生成式 AI 登记 | 未启动（服务器在境外） | M2+ |
| | SimHei 字体授权（CIQ 前置） | 缺失 | M1 |
| **分发** | iOS App Store | 已提审等审核 | M0 被动 |
| | Google Play（账号/12 人×14 天封测/截图） | 未启动，**3-5 周硬时钟** | **M0 启动** |
| | Garmin CIQ | 0 进度（免费、零外部依赖） | M1 |
| | AIUI Agent Store | 待真机 Alpha（17 项/9 硬阻塞/3-5 工作日+审核） | M0-M1 |
| | 品牌域名+TLS（nip.io 证书不匹配） | 缺失 | **M0** |
| | 品牌名拍板（AISmartRun vs FunpizzaSmartRun） | ✅ **已由事实拍板为 AISmartRun**（2026-07-08 核实：APK 显示名 `strings.xml`、iOS 提审名 App Store Connect `name:"AISmartRun"`、AIUI Agent 名三端一致；FunpizzaSmartRun 仅存于仓库名/包名/旧法务文本）。遗留执行项：注册 aismartrun 域名 + 统一支持邮箱 + 法务文本替换 funpizza 字样 | **M0 执行项** |
| **基础设施** | SQLite→Postgres+pgvector | 过渡态（DAU>100 触发） | M2 |
| | 云端对象存储备份 / 告警 TSDB | 过渡态/缺失 | M1/M2 |
| **内容运营** | 路线库 ~23 条 + 7 预置计划 | ✅ 底子已完成 | — |
| | 批量 50 路线 + 10 模板 | 仅规划 | M2 |

---

## 5. 三个最高风险

1. **安全债正在流血**：生产 root 密码与多组 API 密钥明文入 git 历史、至今未轮换；线上环境仍 dev（万能验证码 + mock-pay 生产可用）。任何仓库外流 = 费用盗刷 + PRO 白嫖 + 数据事故。**与融资尽调/商店审核直接冲突，先于一切功能。**
2. ~~AIUI 唯一后端集成点断裂~~ → **本轮已修**（AIUI 侧）。遗留动作：真机 Alpha 前注入 `coach_app_key`（A-12 前置已写入矩阵）。
3. **变现路径全押在未启动/不可控的外部依赖**：真实收款能力为 0；Play 封测 14 天硬时钟未启动；Pro+AR 卖点依赖 Rokid 白名单 BD 或 AIUI Store 过审。**当前无一条在走的收入通道。**

---

## 6. 90 天行动顺序（利用双项目互补）

**M0（1-4 周）· 止血 + 启动不可压缩的外部时钟**
1. 密钥/密码全量轮换；hermes 切 `ENVIRONMENT=prod`
2. 拍板品牌名 → 买域名 + 正确 TLS（解锁法务 URL/CORS/分享漏斗）
3. **立即**注册 Play 开发者账号、启动 12 人×14 天封测（硬时钟）
4. 接腾讯国际短信；~~修 AIUI anon-login~~ ✅ 已修
5. AIUI 真机 Alpha（先注入 coach_app_key）→ Studio 提审；iOS 等审核

**M1（5-8 周）· 两项目汇流 + 免费增长闭环**
1. **AIUI 跑步数据落 runs 表**（成本最低、互补最高：眼镜用户立即获得 APK 全套跑后点评/洞察/周报）
2. 眼镜端跑后总结卡 + 自定义 maxHr + RSC 接线（解析库已备）
3. 匿名↔手机号账号绑定端点（跨端记忆连续性、"一个用户两形态"叙事的前提）
4. 接 FCM 推送 → 解锁已写好的 D1/D3/D7 拉活
5. Garmin CIQ 提审（先换思源黑体）

**M2（9-13 周）· 打开收款 + 内容供给**
1. Play 封测期满 → 海外正式发布；iOS 过审发布
2. 支付顺序：**Apple IAP 先于微信支付**（海外首发不依赖国内主体/商户号）；落定三档定价
3. 微信 v3 验签 + 订单表（解除硬闸门）作为国内线预备；内容批量生成 + admin 审核流
4. DAU>100 触发 Postgres 迁移

**待人工核实**：hermes 远端 .env 与 systemd timer 实态（未 SSH）；Apple 审核实态（需登 ASC）；CXR-L 与 AIUI Agent 同一副眼镜共存性（已立为 Alpha 观察项 **B-07**，结论回写本节）；EverMind solo 摄取生产开关。

**Pro+AR 归属决策规则（预先定死，避免临时争论）**：若 Rokid 包名白名单 BD 在 M2 结束前未落地，Pro+AR 的眼镜侧高级能力全部反哺 AIUI Agent 路线（跟跑提示、区间训练播报等 AIUI 可承载的部分），CXR-L 仅保留 side-load 硬件验证用途；BD 落地则 CXR-L 恢复为 Pro+AR 载体，AIUI Agent 保持免费入口定位。

---

## 7. 结论

两条产品线的正确叙事是：**"一个跑步 AI 服务，两个入口"——手机 App 是商业化主体（账号/支付/留存/数据资产都在这），AIUI 眼镜 Agent 是 Rokid 生态的獲客钩子与差异化门面**。当前最短的价值汇流路径只有两步：修契约（✅ 已完成）→ 眼镜跑步数据落 runs 表（M1 首项）。商业化真正的瓶颈不在功能，而在三件"非功能"的事：**密钥止血、Play 硬时钟、收款通道从 0 到 1**。
