import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readJson(rel) {
  return JSON.parse(readText(rel));
}

function readInkDef(rel) {
  const text = readText(rel);
  const match = text.match(/<script[^>]*\bdef\b[^>]*>\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(match, `${rel} should contain a def script`);
  return JSON.parse(match[1]);
}

test('public project metadata uses AISmartRun', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.name, 'AISmartRun');
  assert.equal(pkg.version, '0.1.0');
  assert.equal(pkg.scripts.dev, 'node tools/aiui_doctor.mjs');
  assert.equal(pkg.scripts.start, 'npm run dev');
  assert.equal(pkg.scripts.test, 'python3 scripts/run_tests_on_hermes.py');
  assert.equal(pkg.scripts['doctor:aiui'], 'node tools/aiui_doctor.mjs');
  assert.equal(pkg.scripts['pack:aix:en'], 'node tools/pack_aix_en.mjs');
  assert.equal(pkg.scripts['inspect:aix:en'], 'node tools/inspect_aix.mjs release/AISmartRun-en.aix');
  assert.equal(pkg.scripts['build:en'], 'npm run pack:aix:en && npm run inspect:aix:en');
  assert.equal(pkg.scripts['build:local'], 'npm run pack:aix && npm run inspect:aix');
  assert.equal(pkg.scripts['preview:check'], 'node tools/validate_previews.mjs');
  assert.equal(pkg.scripts['verify:release'], 'node tools/verify_release.mjs');
  assert.equal(readJson('app.json').window.navigationBarTitleText, 'AISmartRun');
  assert.deepEqual(readJson('app.json').window.viewport, { width: 'device-width' });
  assert.match(readText('AGENTS.md'), /\*\*Name\*\*: AISmartRun/);
  assert.match(readText('AGENTS.md'), /\*\*Version\*\*: 0\.1\.0/);
  assert.match(readText('docs/AISmartRun_PRD.md'), /版本：0\.1\.0/);
  assert.match(readText('tools/validate_previews.mjs'), /Preview validation/);
  assert.match(readText('tools/verify_release.mjs'), /release verification/);
});

test('AIUI page titles use AISmartRun branding', () => {
  assert.equal(readInkDef('pages/index/index.ink').navigationBarTitleText, 'AISmartRun');
  assert.equal(readInkDef('pages/run_hud/index.ink').navigationBarTitleText, 'AISmartRun 跑步');
  assert.equal(readInkDef('pages/bluetooth/index.ink').navigationBarTitleText, 'AISmartRun 设备');
  assert.equal(readInkDef('pages/settings/index.ink').navigationBarTitleText, 'AISmartRun 设置');
  assert.match(readText('pages/index/index.ink'), /<text class="ready-main">自由跑<\/text>/);
  assert.match(readText('pages/coach/index.ink'), /AISmartRun 教练/);
});

test('formal home is the default page and run HUD remains registered', () => {
  const app = readJson('app.json');
  assert.equal(app.pages[0], 'pages/index/index');
  assert.ok(app.pages.includes('pages/run_hud/index'));
  assert.ok(app.pages.includes('pages/bluetooth/index'));
  assert.ok(app.pages.includes('pages/settings/index'));
  assert.ok(app.pages.includes('pages/coach/index'));
});

test('primary AIUI surfaces use native card containers', () => {
  assert.match(readText('pages/index/index.ink'), /<card class="home-card" role="group">/);
  const runHud = readText('pages/run_hud/index.ink');
  assert.match(runHud, /<card class="hud" role="group">/);
  assert.match(readText('pages/bluetooth/index.ink'), /<card class="device-card" role="group">/);
  assert.match(readText('pages/settings/index.ink'), /<card class="settings-card" role="group">/);
  assert.match(readText('pages/coach/index.ink'), /<card class="coach" role="group">/);
  assert.doesNotMatch(runHud, /ink:for="\{\{ dots \}\}"/);
  assert.doesNotMatch(runHud, /ink:for="\{\{ devices \}\}"/);
  assert.doesNotMatch(runHud, /\{\{\s*item\./);
});

test('page key handlers support preview and glasses activation where needed', () => {
  const home = readText('pages/index/index.ink');
  assert.match(home, /onLoad\(\)/);
  assert.match(home, /openRun\(\)/);
  assert.match(home, /openBluetooth\(\)/);
  assert.match(home, /bindtap="openBluetooth"/);
  assert.match(home, /<view class="actions" role="navigation">/);
  assert.match(home, /<button class="\{\{ deviceClass \}\}" bindtap="openBluetooth" tabindex="0">/);
  assert.match(home, /<button class="\{\{ primaryClass \}\}" bindtap="openRun" tabindex="1">/);
  assert.doesNotMatch(home, /openSettings\(\)/);
  assert.match(home, /statusText:\s*'已就绪'/);
  // 首页只做就绪陈述,不建立蓝牙连接(连接由跑步 HUD 完成,避免"连了又断"的假承诺)
  assert.match(home, /this\.refreshHeartReadiness\(\);/);
  assert.doesNotMatch(home, /autoConnectBle|gatt\.connect|scanDevices/);
  assert.match(home, /this\.activateFocused\(\)/);
  assert.match(home, /onVoiceWakeup\(\)/);
  assert.match(home, /code === 'Backspace'/);
  assert.match(home, /wx\.exitMiniProgram\(\)/);

  const bluetooth = readText('pages/bluetooth/index.ink');
  assert.match(bluetooth, /onKeyUp\(event\)/);
  assert.match(bluetooth, /code === 'Backspace'/);
  assert.match(bluetooth, /wx\.navigateBack\(\{ delta: 1 \}\)/);
  assert.match(bluetooth, /toggleScan\(\)/);
  assert.match(bluetooth, /toggleAutoHeart\(\)/);
  assert.match(bluetooth, /forgetDevice\(\)/);
  assert.match(bluetooth, /<view class="device-list" role="navigation">/);
  assert.match(bluetooth, /bindtap="selectPreferredDevice" tabindex="0"/);
  assert.match(bluetooth, /bindtap="toggleScan" tabindex="1"/);
  assert.match(bluetooth, /bindtap="toggleAutoHeart" tabindex="2"/);
  assert.match(bluetooth, /bindtap="forgetDevice" tabindex="3"/);
  assert.match(bluetooth, /bindtap="openSettings" tabindex="4"/);
  assert.match(bluetooth, /bindtap="openRun" tabindex="5"/);

  const settings = readText('pages/settings/index.ink');
  assert.match(settings, /onKeyUp\(event\)/);
  assert.match(settings, /code === 'Backspace'/);
  assert.match(settings, /wx\.navigateBack\(\{ delta: 1 \}\)/);
  assert.match(settings, /<view class="settings-list" role="navigation">/);
  assert.match(settings, /bindtap="cycleStride" tabindex="0"/);
  assert.match(settings, /bindtap="toggleHeart" tabindex="1"/);
  assert.match(settings, /bindtap="toggleVoice" tabindex="2"/);
  assert.match(settings, /bindtap="toggleMemory" tabindex="3"/);
  assert.match(settings, /bindtap="openRun" tabindex="4"/);

  const coach = readText('pages/coach/index.ink');
  assert.match(coach, /onKeyUp\(event\)/);
  assert.match(coach, /code === 'Backspace'/);
  assert.match(coach, /cancelTurn\(\)/);
  assert.match(coach, /this\.toggleAsr\(\);/);
  assert.match(coach, /btn-mic btn-selected/);
  assert.match(coach, /<view class="coach-bottom" role="navigation">/);
  assert.match(coach, /bindtap="toggleAsr" tabindex="0"/);
  assert.match(coach, /recordCoachTurn\(question, reply, snapshot, source\)/);
  assert.match(coach, /buildAiuiRecordRequest\(\{/);
  assert.match(coach, /parseAiuiRecordResponse\(resp\)/);
  assert.match(coach, /LanguageModel\.create\(/);
  assert.match(coach, /resolveCoachBackendConfig\(wx\)/);
  assert.doesNotMatch(coach, /\bmodel\s*:/);
  assert.doesNotMatch(coach, /__SET_AFTER_REPO_PRIVATE__/);
  assert.doesNotMatch(coach, /const APP_KEY/);
  // LLM 流式必须有总超时:挂起也要落到规则兜底,不许永久"思考"
  assert.match(coach, /LLM_TIMEOUT_MS = 10000/);
  assert.match(coach, /llm timeout/);
  // Z5 安全提示走确定性规则,不交给概率性 LLM
  assert.match(coach, /zone >= 5/);
  assert.match(coach, /rule-safety/);
  // LLM 输出后置消毒 + 会话 prompt 只含人设(实时数据每轮注入)
  assert.match(coach, /sanitizeCoachReply\(/);
  assert.match(coach, /buildCoachPersonaPrompt\(\)/);
  assert.doesNotMatch(coach, /buildCoachSystemPrompt\(liveSnapshot\(\)\)/);
});

test('run HUD is a passive display surface without in-card buttons', () => {
  const runHud = readText('pages/run_hud/index.ink');
  assert.match(runHud, /modeLabel:\s*'单眼镜模式'/);
  assert.match(runHud, /modeLabel:\s*'心率接入'/);
  assert.match(runHud, /showHeartRate:\s*false/);
  assert.match(runHud, /showHeartRate:\s*true/);
  assert.match(runHud, /const hasHeartRate = hrLive && Number\.isFinite\(snap\.bpm\);/);
  assert.match(runHud, /hudModeFields\(\{ connected: hasHeartRate \}\)/);
  assert.match(runHud, /class="unified-grid" ink:if="\{\{ showHeartRate \}\}"/);
  assert.match(runHud, /class="glasses-grid" ink:else/);
  assert.match(runHud, />心率<\/text>/);
  assert.match(runHud, />配速<\/text>/);
  assert.match(runHud, />步频<\/text>/);
  assert.match(runHud, />距离<\/text>/);
  assert.match(runHud, />时长<\/text>/);
  assert.match(runHud, /class="passive-footer"/);
  assert.match(runHud, /this\.autoConnectBle\(\);/);
  assert.match(runHud, /onKeyUp\(event\)/);
  assert.match(runHud, /code === 'Backspace'/);
  assert.match(runHud, /exitRunPage\(\)/);
  // 页脚数据源用短标签,避免与 15 字教练句在 456px 内互相挤压
  assert.match(runHud, /sourceMain:\s*'眼镜估算'/);
  assert.match(runHud, /sourceMain:\s*'心率\+眼镜'/);
  assert.match(runHud, /sourceMain:\s*'仅计时'/);
  // 心率断连双保险:GATT 断连事件 + 8s 无 notify 超时,静默回单眼镜
  assert.match(runHud, /gattserverdisconnected/);
  assert.match(runHud, /HR_STALE_MS = 8000/);
  assert.match(runHud, /onBleDropped\(\)/);
  // 息屏自动暂停:时长与距离口径一致,不出现"时长照走距离冻结"
  assert.match(runHud, /this\.session\.pause\(now\)/);
  assert.match(runHud, /autoPausedByHide/);
  // 跑步中 Backspace 双击确认,防误触丢掉整段数据
  assert.match(runHud, /EXIT_CONFIRM_MS = 3000/);
  assert.match(runHud, /再按一次结束/);
  // 自动兜底连接不写首选设备(防邻近跑者心率带被永久记住)
  assert.match(runHud, /this\.connectDevice\(this\.autoFallbackDevice, \{ remember: false \}\)/);
  assert.match(runHud, /if \(opts\.remember === true\) writeHeartRateDevice\(wx, device\);/);
  assert.doesNotMatch(runHud, /计步不可用/);
  assert.doesNotMatch(runHud, /class="standalone-grid"|class="hr-layout"/);
  assert.doesNotMatch(runHud, /ink:if="\{\{ bleState === 'connected' \}\}"/);
  assert.doesNotMatch(runHud, /<button\b/);
  assert.doesNotMatch(runHud, /bindtap=/);
  assert.doesNotMatch(runHud, /availableActions\(\)|activateHudAction\(\)|pauseClass|bleClass|endClass/);
});

test('browser preview downgrades unavailable step sensor without error noise', () => {
  const runHud = readText('pages/run_hud/index.ink');
  assert.match(runHud, /markImuUnavailable\(\)/);
  assert.match(runHud, /typeof Accelerometer === 'undefined'/);
  assert.match(runHud, /sensor\.addEventListener\('error', \(\) => this\.markImuUnavailable\(\)\)/);
  assert.doesNotMatch(runHud, /console\.error\('IMU/);
});

test('AIUI page schema follows object/properties shape where present', () => {
  const runHudDef = readInkDef('pages/run_hud/index.ink');
  const bluetoothDef = readInkDef('pages/bluetooth/index.ink');
  const coachDef = readInkDef('pages/coach/index.ink');
  const settingsDef = readInkDef('pages/settings/index.ink');
  const homeDef = readInkDef('pages/index/index.ink');
  assert.deepEqual(homeDef.schema.data.required, ['statusText', 'heartLabel', 'primaryClass', 'deviceClass']);
  assert.equal(runHudDef.schema.data.type, 'object');
  assert.ok(runHudDef.schema.data.properties.bpm);
  assert.ok(runHudDef.schema.data.required.includes('showHeartRate'));
  assert.equal(bluetoothDef.schema.data.type, 'object');
  assert.ok(bluetoothDef.schema.data.properties.savedLabel);
  assert.ok(bluetoothDef.schema.data.required.includes('deviceNote'));
  assert.equal(coachDef.schema.data.type, 'object');
  assert.ok(coachDef.schema.data.properties.status);
  assert.deepEqual(coachDef.schema.data.required, ['status', 'reply']);
  assert.equal(settingsDef.schema.data.type, 'object');
  assert.ok(settingsDef.schema.data.properties.strideLabel);
  assert.ok(settingsDef.schema.data.required.includes('memoryLabel'));
});

test('AIUI runtime usage follows verified Rokid API docs', () => {
  const runHud = readText('pages/run_hud/index.ink');
  const bluetooth = readText('pages/bluetooth/index.ink');
  const coach = readText('pages/coach/index.ink');

  assert.match(runHud, /navigator\.bluetooth\.getDevices\(\)/);
  assert.match(bluetooth, /navigator\.bluetooth\.getDevices\(\)/);
  assert.match(coach, /wx\.speech\.playTTS\(text\)/);
  assert.doesNotMatch(coach, /wx\.speech\.playTTS\(\{\s*text/);

  const unsupportedCss = /\bwhite-space\b|\bword-break\b|\bvisibility\b|\bfont-variant\b|position\s*:\s*sticky|\banimation(?:-[a-z]+)?\s*:/;
  for (const rel of [
    'pages/index/index.ink',
    'pages/run_hud/index.ink',
    'pages/bluetooth/index.ink',
    'pages/settings/index.ink',
    'pages/coach/index.ink',
  ]) {
    assert.doesNotMatch(readText(rel), unsupportedCss, `${rel} should stay inside documented AIUI WXSS support`);
  }
});

test('browser preview artifacts follow current AIUI card dimensions', () => {
  const previews = [
    'preview/index.html',
    'preview/aismartrun-all-ui-preview.html',
    'preview/aismartrun-home-waiting-preview.html',
    'preview/aismartrun-settings-preview.html',
    'preview/aismartrun-bluetooth-preview.html',
    'preview/aismartrun-ai-voice-config-preview.html',
    'preview/aismartrun-ui-preview.html',
    'preview/aismartrun-ui-preview-en.html',
  ];

  for (const rel of previews) {
    const text = readText(rel);
    assert.match(text, /\b480px\b/, `${rel} should use the current 480px card width`);
    assert.doesNotMatch(text, /\b448px\b|\b352px\b/, `${rel} should not use retired AIUI dimensions`);
    const png = rel.replace(/\.html$/, '.png');
    const pngPath = path.join(ROOT, png);
    assert.ok(fs.existsSync(pngPath), `${png} should exist`);
    assert.ok(fs.statSync(pngPath).size > 20_000, `${png} should be a non-empty rendered capture`);
  }
});

test('public descriptions are plain bilingual copy', () => {
  const descriptions = [
    readJson('package.json').description,
    readInkDef('pages/index/index.ink').description,
    readInkDef('pages/run_hud/index.ink').description,
    readInkDef('pages/bluetooth/index.ink').description,
    readInkDef('pages/settings/index.ink').description,
    readInkDef('pages/coach/index.ink').description,
  ];
  const forbiddenImplementationTerms = /\b(HUD|IMU|BLE|LLM|0x180D|GATT|JSUI)\b/i;
  for (const description of descriptions) {
    assert.match(description, /中文：/);
    assert.match(description, /English:/);
    assert.doesNotMatch(description, forbiddenImplementationTerms);
  }
  const manifest = readText('AGENTS.md');
  assert.match(manifest, /## 平台描述 \/ Store Description/);
  assert.match(manifest, /中文：AISmartRun 是 Rokid 眼镜上的跑步助手/);
  assert.match(manifest, /English: AISmartRun is a running assistant for Rokid glasses/);
});

test('store description has a single source of truth (AGENTS.md == package.json)', () => {
  // Store 文案曾出现双源漂移:AGENTS.md 与 package.json 各自演化。
  // 守卫:package.json description 的中英句子必须逐字出现在 AGENTS.md 平台描述里。
  const pkgDesc = readJson('package.json').description;
  const manifest = readText('AGENTS.md');
  const [cn, en] = pkgDesc.split('\n\n');
  assert.ok(cn && cn.startsWith('中文：'), 'package.json 描述应含中文段');
  assert.ok(en && en.startsWith('English:'), 'package.json 描述应含英文段');
  assert.ok(manifest.includes(cn), 'AGENTS.md 平台描述应包含与 package.json 相同的中文文案');
  assert.ok(manifest.includes(en), 'AGENTS.md 平台描述应包含与 package.json 相同的英文文案');
  // 诚实性:Store 文案必须说明首次需配对授权,不许过度承诺"全自动"
  assert.match(cn, /首次使用需在设备页完成一次配对授权/);
  assert.match(en, /First-time use requires one pairing authorization/);
});

test('README indexes official references and local delivery docs', () => {
  const readme = readText('README.md');
  assert.match(readme, /https:\/\/aiui\.rokid\.com\//);
  assert.match(readme, /https:\/\/js\.rokid\.com\/AIUI/);
  assert.match(readme, /https:\/\/github\.com\/jsar-project\/AIUI\/tree\/main\/skills\/aiui-dev/);
  assert.match(readme, /https:\/\/github\.com\/jsar-project\/AIUI\/tree\/main\/samples/);
  assert.match(readme, /https:\/\/gitee\.com\/jsar-project\/AIUI/);
  assert.match(readme, /https:\/\/custom\.rokid\.com\/prod\/rokid_web/);
  assert.match(readme, /\[docs\/AIUI_DOC_ALIGNMENT\.md\]\(\.\/docs\/AIUI_DOC_ALIGNMENT\.md\)/);
  assert.match(readme, /\[docs\/BACKEND_EVERMIND_CONTRACT\.md\]\(\.\/docs\/BACKEND_EVERMIND_CONTRACT\.md\)/);
  assert.match(readme, /\[docs\/LOCAL_RELEASE_SCORECARD\.md\]\(\.\/docs\/LOCAL_RELEASE_SCORECARD\.md\)/);
  assert.match(readme, /EverMind secrets, workspace routing and double-write policy stay server-side/);
});
