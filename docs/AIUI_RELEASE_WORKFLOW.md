# AISmartRun AIUI Release Workflow

Date: 2026-07-08

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Runs AIUI project/toolchain checks. This project does not start a browser dev server because AIUI Studio is the target runtime. |
| `npm run start` | Alias of `npm run dev`. |
| `npm run test` | Runs all local Node test specs through `scripts/run_tests_on_hermes.py`. |
| `npm run build:local` | Creates `release/AISmartRun-current.aix` with the local source packer and inspects it with `@yodaos-pkg/aix`. |
| `npm run build` | Alias of `npm run build:local`. |
| `npm run doctor:aiui` | Checks scaffold CLI, AIX reader, zip command and current release package. |
| `npm run preview:check` | Verifies each browser preview has a matching PNG capture and still uses the current 480px AIUI card width. |
| `npm run verify:release` | Runs doctor, preview validation, tests and local `.aix` build as one release-readiness gate. |
| `npm run scaffold:aiui -- <new-agent-name>` | Runs the installed `create-aiui-agent` scaffold wrapper for reference projects. |

## Local Package Boundary

`release/AISmartRun-current.aix` is a local source package used for repeatable inspection. It verifies that the manifest, pages and tools can be read by `@yodaos-pkg/aix`.

It is not a final signed store package.

## Official Package Boundary

Final signing, upload and release validation should happen in AIUI Studio:

- AIUI Studio China: https://aiui.rokid.com/
- Technical site: https://js.rokid.com/AIUI
- AIUI repository: https://github.com/jsar-project/AIUI

## CLI Note

The AIUI README currently documents:

```bash
npm create @yodaos-pkg/aiui-agent my-agent
```

The public npm package available in this environment is:

```bash
npx @yodaos-pkg/create-aiui-agent my-agent
```

This project installs `@yodaos-pkg/create-aiui-agent@2.1.2` and wraps it with `npm run scaffold:aiui -- <new-agent-name>`.

## Release Gate

Before sharing a package:

1. `npm run verify:release`
2. Open `release/AISmartRun-current.aix` in AIUI Studio or use the official upload flow.
3. Run the Alpha device matrix before store submission.

`npm run verify:release` is the local 95+ engineering gate. It does not replace AIUI Studio signing,
upload, or real-device validation.
