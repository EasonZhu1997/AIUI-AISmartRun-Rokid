# AISmartRun AIUI

AISmartRun is a Rokid Glasses running assistant built as an AIUI application. It keeps the first screen simple: glasses-only running is ready by default, the home page only shows readiness states, and the run HUD connects the remembered Bluetooth heart-rate device after the run starts while showing time, cadence, estimated distance and pace. The AI coach uses Rokid AIUI `LanguageModel` as the primary answer path; EverMind is reserved for backend-managed memory retrieval and record storage.

## Quick Commands

```bash
npm run dev
npm run test
npm run preview:check
npm run build
npm run verify:release
```

`npm run dev` is an alias for the AIUI doctor self-check; it does not start a preview server.

`npm run verify:release` is the local release-readiness gate. It runs AIUI doctor, preview validation, tests and local `.aix` packaging. Official signing, upload and submission still happen in AIUI Studio.

## Local Project Docs

| File | Purpose |
|---|---|
| [AGENTS.md](./AGENTS.md) | Agent manifest, store description, permissions, pages and design constraints. |
| [docs/PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md) | Current project directory and module map. |
| [docs/AISmartRun_PRD.md](./docs/AISmartRun_PRD.md) | Chinese PRD. |
| [docs/AISmartRun_PRD_EN.md](./docs/AISmartRun_PRD_EN.md) | English PRD. |
| [docs/AIUI_DOC_ALIGNMENT.md](./docs/AIUI_DOC_ALIGNMENT.md) | AIUI / Ink reference alignment and current implementation decisions. |
| [docs/AIUI_RELEASE_WORKFLOW.md](./docs/AIUI_RELEASE_WORKFLOW.md) | Local `.aix` workflow and AIUI Studio boundary. |
| [docs/BACKEND_EVERMIND_CONTRACT.md](./docs/BACKEND_EVERMIND_CONTRACT.md) | AIUI, backend, EverMind and APK-compatible API contract. |
| [docs/ALPHA_TEST_MATRIX.md](./docs/ALPHA_TEST_MATRIX.md) | Real-device Alpha validation matrix. |
| [docs/LOCAL_RELEASE_SCORECARD.md](./docs/LOCAL_RELEASE_SCORECARD.md) | Local engineering delivery scorecard. |
| [docs/PRODUCT_PM_REVIEW.md](./docs/PRODUCT_PM_REVIEW.md) | Chinese PM review and next-stage recommendation. |
| [docs/DUAL_PRODUCT_COMMERCIAL_EVAL.md](./docs/DUAL_PRODUCT_COMMERCIAL_EVAL.md) | Dual product-line (AIUI glasses × APK ecosystem) commercialization evaluation. |
| [docs/PRODUCT_PM_REVIEW_EN.md](./docs/PRODUCT_PM_REVIEW_EN.md) | English PM review summary. |
| [DEVICES.md](./DEVICES.md) | Bluetooth device compatibility notes. |
| [PROGRESS.md](./PROGRESS.md) | Running project history and latest status. |

## Official Reference Docs

| Source | Link | Used For |
|---|---|---|
| AIUI Studio China | https://aiui.rokid.com/ | Official packaging, signing, upload and release workflow. |
| AIUI technical site | https://js.rokid.com/AIUI | AIUI overview, runtime model and developer entry. |
| AIUI technical docs | https://rokid.yuque.com/ub8h5n/hsmrp5/cl87q6uy59ifbh8w | AIUI API and platform behavior reference. |
| AIUI changelog | https://rokid.yuque.com/ub8h5n/bkz4ul/nlykgbonerhy68tc?singleDoc# | Runtime and platform changes to re-check before release. |
| Rokid Glasses design spec | https://custom.rokid.com/prod/rokid_web/57e35cd3ae294d16b1b8fc8dcbb1b7c7/pc/cn/5a71b66dbc1e4689886c7aa437299f2b.html | Wearable UI sizing, readability and interaction guidance. |
| Leqi Academy course | https://t.rokid.com/n2w8u2o | AIUI learning material and course reference. |
| AIUI GitHub project | https://github.com/jsar-project/AIUI | Source references, samples and skills. |
| AIUI Gitee project | https://gitee.com/jsar-project/AIUI | China-accessible mirror. |
| AIUI dev skill | https://github.com/jsar-project/AIUI/tree/main/skills/aiui-dev | `.ink`, WXSS, component, API, key event and wearable design guidance. |
| AIUI samples | https://github.com/jsar-project/AIUI/tree/main/samples | Implementation examples. |

## Key Product Boundaries

| Area | Decision |
|---|---|
| Home | Formal landing page; shows readiness and the remembered device only and does not establish connections. Connection happens in the run HUD after the run starts. |
| Bluetooth | First-time scan and authorization live on the Bluetooth page; it is the only place the preferred device is written. The run HUD prefers already authorized devices. |
| Run HUD | Passive display card only; no in-card buttons. Heart rate is optional and appears on the same panel when connected. Recording auto-pauses on hide and auto-resumes on show; exiting mid-run requires a double Backspace press within 3 seconds. |
| Hardware keys | Backspace is handled explicitly on every page; Enter, Space and Rokid `GlobalHook` trigger the current primary action where applicable. |
| AI coach | Rokid AIUI `LanguageModel` is the primary answer path and should use the host default model, expected to be official DeepSeek configuration. |
| EverMind | Backend-managed by default. AIUI sends `app_id=AISmartRun` plus anonymous `device_id`; EverMind secrets, workspace routing and double-write policy stay server-side. |
| APK sibling project | `/api/coach-svc/coach/chat` remains compatible for the sibling APK flow where the backend can generate with DeepSeek and write EverMind records. |

## Preview Entry

Open [preview/index.html](./preview/index.html) to review the arranged UI flow. Individual previews and PNG captures live under `preview/`.

## Current Readiness

Local engineering delivery is scored at 96 / 100 in [docs/LOCAL_RELEASE_SCORECARD.md](./docs/LOCAL_RELEASE_SCORECARD.md), after an adversarial multi-lens PM review round in which all 45 confirmed findings (5 critical) were fixed with automated guards — `npm test` now runs 150 checks including 18 page-lifecycle tests (heart-rate drop fallback, auto-pause on hide, double-press exit, LLM timeout fallback). Real-device and store maturity remain gated by [docs/ALPHA_TEST_MATRIX.md](./docs/ALPHA_TEST_MATRIX.md), especially Bluetooth authorization, IMU accuracy, ASR / LLM / TTS behavior, background recovery and AIUI Studio signing.
