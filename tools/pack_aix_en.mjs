import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'release/AISmartRun-en.aix');
const STAGE = path.resolve(ROOT, 'release/.AISmartRun-en.src.tmp');
const TMP = path.resolve(ROOT, 'release/.AISmartRun-en.aix.tmp');
const NON_EN_RE = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/;
const TEXT_FILE_RE = /\.(?:js|json|md|ink)$/;

const PACKAGE_ENTRIES = [
  'assets',
  'lib',
  'pages',
  'AGENTS.md',
  'app.js',
  'app.json',
  'package.json',
  'VERSION',
];

const EN_DESCRIPTION =
  'Running assistant for Rokid glasses with pace, cadence, heart rate and AI coaching.';
const PAGE_DESCRIPTIONS = {
  home: EN_DESCRIPTION,
  run: 'Tracks time, cadence, distance, pace and optional heart rate during a run.',
  bluetooth: 'Finds and remembers a standard Bluetooth heart-rate device for run auto-connect.',
  settings: 'Sets stride length, automatic heart rate, voice cues and memory-assisted coaching.',
  coach: 'Lets runners ask an AI coach for short pace, heart-rate and rhythm guidance.',
};

for (const [name, description] of Object.entries({
  agent: EN_DESCRIPTION,
  ...PAGE_DESCRIPTIONS,
})) {
  if (description.length > 100) {
    fail(`English ${name} description is too long: ${description.length} chars`);
  }
}

const EN_AGENTS = `# Agent Manifest - AISmartRun

## Store Description

${EN_DESCRIPTION}

## Identity
- **Name**: AISmartRun
- **Version**: 0.1.0
- **Description**: ${EN_DESCRIPTION}
- **Author**: Eason

## Capabilities
- **Permissions**:
  - bluetooth      # Connect standard heart-rate watches, straps and running devices
  - accelerometer  # Estimate steps, cadence and distance without external devices
  - microphone     # Receive voice questions during a run
  - audio          # Play AI coach voice guidance
  - network        # Retrieve memory context and store AI coach records

### Runtime Capabilities
- \`wx storage\`: run settings, preferred device and live run snapshot with a 10-second TTL
- \`LanguageModel\`: primary AI coach answer path through the host default model
- \`SpeechRecognition\`: voice questions on the coach page
- TTS: \`wx.speech.playTTS\` or Web Speech for coach replies and proactive cues
- Voice wakeup: start a run from home or start asking from the coach page

## Pages
- \`pages/index/index\` formal home
- \`pages/run_hud/index\` live running data page
- \`pages/bluetooth/index\` Bluetooth heart-rate device page
- \`pages/settings/index\` pre-run settings page
- \`pages/coach/index\` AI voice coach

## Design Constraints
- 480px wide, 120-380px high, black background, single green theme token, no emoji, card style
- Use green opacity and border weight for warning or abnormal states
- Keep the run page as large data and necessary status only
- Data refresh uses \`setData\`, event callbacks and 1s aggregation; clean resources in \`onUnload\` and \`onHide\`
- The run HUD is passive and contains no in-card buttons
- On hide, pause recording; on show, resume recording so time and distance remain consistent
- Heart-rate GATT disconnect or 8 seconds without new data silently falls back to glasses-only mode
- Home shows readiness only; Bluetooth connection happens in the run HUD after start
- Backspace is handled explicitly on every page; mid-run exit requires a second Backspace within 3 seconds
- EverMind is backend-managed; AIUI sends \`app_id=AISmartRun\` and an anonymous device id only
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function rel(...parts) {
  return path.join(STAGE, ...parts);
}

function read(relPath) {
  return fs.readFileSync(rel(relPath), 'utf8');
}

function write(relPath, text) {
  fs.writeFileSync(rel(relPath), text);
}

function replaceText(relPath, pairs) {
  let text = read(relPath);
  for (const [from, to] of pairs) {
    text = text.split(from).join(to);
  }
  write(relPath, text);
}

function replaceRegex(relPath, pairs) {
  let text = read(relPath);
  for (const [from, to] of pairs) {
    text = text.replace(from, to);
  }
  write(relPath, text);
}

function listTextFiles(dir = STAGE) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTextFiles(abs));
    } else if (TEXT_FILE_RE.test(entry.name)) {
      files.push(abs);
    }
  }
  return files;
}

function prepareStage() {
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });
  for (const entry of PACKAGE_ENTRIES) {
    const src = path.join(ROOT, entry);
    const dst = rel(entry);
    if (!fs.existsSync(src)) fail(`Missing package entry: ${entry}`);
    fs.cpSync(src, dst, { recursive: true });
  }
  normalizeStageLineEndings();
}

function normalizeStageLineEndings() {
  for (const abs of listTextFiles()) {
    const text = fs.readFileSync(abs, 'utf8');
    fs.writeFileSync(abs, text.replace(/\r\n/g, '\n'));
  }
}

function localizeMetadata() {
  write('AGENTS.md', EN_AGENTS);
  const pkg = JSON.parse(read('package.json'));
  pkg.description = EN_DESCRIPTION;
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
}

function localizeHome() {
  replaceText('pages/index/index.ink', [
    ['"description": "中文：AISmartRun 是 Rokid 眼镜上的跑步助手。首页显示单眼镜就绪和心率设备状态；点开跑后由跑步页自动接入已记住的心率设备。\\n\\nEnglish: AISmartRun is a running assistant for Rokid glasses. The home page shows glasses-ready and heart-rate device states; after starting a run, the run page automatically connects the remembered heart-rate device."', `"description": "${EN_DESCRIPTION}"`],
    ["statusText: '已就绪'", "statusText: 'Ready'"],
    ["heartLabel: '待配对'", "heartLabel: 'Pair HR'"],
    ["glassesLabel: '已就绪'", "glassesLabel: 'Ready'"],
    ["helperText: '无心率也可开跑'", "helperText: 'No HR needed'"],
    ["this.applyStoredState('设备')", "this.applyStoredState('Devices')"],
    ["statusText: '已就绪',\n        heartLabel: '已关闭',\n        helperText: '单眼镜模式开跑'", "statusText: 'Ready',\n        heartLabel: 'Off',\n        helperText: 'Glasses-only'"],
    ["statusText: '已就绪',\n        heartLabel: '不可用',\n        helperText: '单眼镜可跑'", "statusText: 'Ready',\n        heartLabel: 'N/A',\n        helperText: 'Glasses ready'"],
    ["statusText: '已就绪',\n        heartLabel: heartRateDeviceLabel(preferred),\n        helperText: '开跑自动连'", "statusText: 'Ready',\n        heartLabel: heartRateDeviceLabel(preferred),\n        helperText: 'Auto on start'"],
    ["statusText: '已就绪',\n      heartLabel: '待配对',\n      helperText: '设备页可配对'", "statusText: 'Ready',\n      heartLabel: 'Pair HR',\n      helperText: 'Pair in Devices'"],
    ['<text class="ready-main">自由跑</text>', '<text class="ready-main">Free Run</text>'],
    ['<text class="ready-sub">单眼镜可用</text>', '<text class="ready-sub">Glasses ready</text>'],
    ['<text class="device-name">单眼镜</text>', '<text class="device-name">Glasses</text>'],
    ['<text class="device-name">心率</text>', '<text class="device-name">Heart</text>'],
    ['<text class="action-text">设备</text>', '<text class="action-text">Device</text>'],
    ['<text class="action-text">开跑</text>', '<text class="action-text">Start</text>'],
  ]);
  replaceText('pages/index/index.ink', [
    ["'已就绪'", "'Ready'"],
    ["'已关闭'", "'Off'"],
    ["'不可用'", "'N/A'"],
    ["'已记住'", "'Remembered'"],
    ["'待配对'", "'Pair HR'"],
    ["'单眼镜模式开跑'", "'Glasses-only'"],
    ["'单眼镜可跑'", "'Glasses ready'"],
    ["'开跑自动连'", "'Auto on start'"],
    ["'设备页可配对'", "'Pair in Devices'"],
  ]);
}

function localizeRunHud() {
  replaceText('pages/run_hud/index.ink', [
    ['"navigationBarTitleText": "AISmartRun 跑步"', '"navigationBarTitleText": "AISmartRun Run"'],
    ['"description": "中文：跑步页会自动开始记录。单眼镜模式显示时间、步频、估算距离和配速；接入心率后才在同一面板补充心率，不切换页面。\\n\\nEnglish: The run page starts tracking automatically. Glasses-only mode shows time, step rate, estimated distance and pace; heart rate appears in the same panel only after heart-rate data is connected."', `"description": "${PAGE_DESCRIPTIONS.run}"`],
    ["const START_CUE = '开跑，呼吸放稳。';", "const START_CUE = 'Start easy, breathe.';"],
    ["const EXIT_CONFIRM_LINE = '再按一次结束';", "const EXIT_CONFIRM_LINE = 'Press again to end';"],
    ["modeLabel: '单眼镜模式'", "modeLabel: 'Glasses mode'"],
    ["sourceMain: '眼镜估算'", "sourceMain: 'Glasses est.'"],
    ["coachLine: '准备开跑'", "coachLine: 'Ready to run'"],
    ["this.setData({ paused: true, coachLine: '已暂停' });", "this.setData({ paused: true, coachLine: 'Paused' });"],
    ["coachLine: '单眼镜计时中'", "coachLine: 'Timing only'"],
    ["modeLabel: '心率接入'", "modeLabel: 'HR linked'"],
    ["sourceMain: '心率+眼镜'", "sourceMain: 'HR+glasses'"],
    ["sourceMain: '仅计时'", "sourceMain: 'Timing only'"],
    ["coachLine: '找心率设备'", "coachLine: 'Finding HR'"],
    ["coachLine: '用眼镜估算距离'", "coachLine: 'Using glasses'"],
    ["coachLine: '心率已连接'", "coachLine: 'HR linked'"],
    ['<text class="metric-label">心率</text>', '<text class="metric-label">HR</text>'],
    ['<text class="metric-label">配速</text>', '<text class="metric-label">Pace</text>'],
    ['<text class="metric-label">步频</text>', '<text class="metric-label">Cad.</text>'],
    ['<text class="metric-label">距离</text>', '<text class="metric-label">Dist.</text>'],
    ['<text class="metric-label">时长</text>', '<text class="metric-label">Time</text>'],
    ["paused ? '已暂停' : '节奏很好，保持'", "paused ? 'Paused' : 'Good rhythm'"],
  ]);
}

function localizeBluetooth() {
  replaceText('pages/bluetooth/index.ink', [
    ['"navigationBarTitleText": "AISmartRun 设备"', '"navigationBarTitleText": "AISmartRun Devices"'],
    ['"description": "中文：搜索并记住标准蓝牙心率设备，控制自动心率开关；跑步页开跑后会优先连接已记住的设备。\\n\\nEnglish: Searches and remembers a standard Bluetooth heart-rate device and controls the automatic heart-rate switch; after a run starts, the run page prefers the remembered device."', `"description": "${PAGE_DESCRIPTIONS.bluetooth}"`],
    ["statusText: '设备'", "statusText: 'Devices'"],
    ["savedLabel: '自动选择'", "savedLabel: 'Auto pick'"],
    ["scanLabel: '扫描'", "scanLabel: 'Scan'"],
    ["autoLabel: '开'", "autoLabel: 'On'"],
    ["forgetLabel: '无'", "forgetLabel: 'None'"],
    ["deviceNote: '未搜索'", "deviceNote: 'Not searched'"],
    ["this.applyStoredState('设备')", "this.applyStoredState('Devices')"],
    ["hasDevice ? '清除' : '无'", "hasDevice ? 'Clear' : 'None'"],
    ["statusText: keepStatus ? this.data.statusText : '设备'", "statusText: keepStatus ? this.data.statusText : 'Devices'"],
    ["deviceNote: '已停止'", "deviceNote: 'Stopped'"],
    ["statusText: '不可用'", "statusText: 'N/A'"],
    ["deviceNote: '单眼镜可跑'", "deviceNote: 'Glasses ok'"],
    ["deviceNote: '需要授权'", "deviceNote: 'Need auth'"],
    ["statusText: '扫描中'", "statusText: 'Scanning'"],
    ["scanLabel: '停止'", "scanLabel: 'Stop'"],
    ["deviceNote: '搜索心率'", "deviceNote: 'Search HR'"],
    ["statusText: '不支持'", "statusText: 'Unsupported'"],
    ["deviceNote: '非标准心率'", "deviceNote: 'Not HR'"],
    ["statusText: '发现设备'", "statusText: 'Found'"],
    ["deviceNote: '连接中'", "deviceNote: 'Connecting'"],
    ["statusText: '未发现'", "statusText: 'Not found'"],
    ["deviceNote: '靠近心率设备'", "deviceNote: 'Move HR near'"],
    ["statusText: '扫描失败'", "statusText: 'Scan failed'"],
    ["deviceNote: '需要手势'", "deviceNote: 'Need gesture'"],
    ["statusText: '已授权'", "statusText: 'Authorized'"],
    ["deviceNote: '连接已记住'", "deviceNote: 'Link saved'"],
    ["statusText: '连接中'", "statusText: 'Linking'"],
    ["deviceNote: '验证心率'", "deviceNote: 'Verify HR'"],
    ["statusText: '已记住'", "statusText: 'Remembered'"],
    ["forgetLabel: '清除'", "forgetLabel: 'Clear'"],
    ["deviceNote: '首页优先连接'", "deviceNote: 'Auto on run'"],
    ["statusText: '连接失败'", "statusText: 'Failed'"],
    ["deviceNote: '可重试'", "deviceNote: 'Retry'"],
    ["statusText: '已保存'", "statusText: 'Saved'"],
    ["next.autoHeartRate ? '自动心率开' : '自动心率关'", "next.autoHeartRate ? 'Auto HR on' : 'Auto HR off'"],
    ["statusText: '已清除'", "statusText: 'Cleared'"],
    ["savedLabel: '自动选择'", "savedLabel: 'Auto pick'"],
    ["forgetLabel: '无'", "forgetLabel: 'None'"],
    ["deviceNote: '不指定设备'", "deviceNote: 'No device'"],
    ['<text class="device-title">设备</text>', '<text class="device-title">Devices</text>'],
    ['<text class="setting-name">首选心率</text>', '<text class="setting-name">Preferred HR</text>'],
    ['<text class="setting-name">搜索设备</text>', '<text class="setting-name">Search</text>'],
    ['<text class="setting-name">自动心率</text>', '<text class="setting-name">Auto HR</text>'],
    ['<text class="setting-name">忘记设备</text>', '<text class="setting-name">Forget</text>'],
    ['<text class="action-text">设置</text>', '<text class="action-text">Settings</text>'],
    ['<text class="action-text">开跑</text>', '<text class="action-text">Start</text>'],
  ]);
}

function localizeSettings() {
  replaceText('pages/settings/index.ink', [
    ['"navigationBarTitleText": "AISmartRun 设置"', '"navigationBarTitleText": "AISmartRun Settings"'],
    ['"description": "中文：设置跑步前的基础偏好，包括估算步长、自动接入心率、语音提示和记忆增强。\\n\\nEnglish: Configures basic running preferences, including estimated stride length, automatic heart-rate connection, voice cues and memory-assisted coaching."', `"description": "${PAGE_DESCRIPTIONS.settings}"`],
    ["heartLabel: '开'", "heartLabel: 'On'"],
    ["voiceLabel: '开'", "voiceLabel: 'On'"],
    ["memoryLabel: '开'", "memoryLabel: 'On'"],
    ["statusText: '已保存'", "statusText: 'Saved'"],
    ["this.applySettings(readRunSettings(wx), '已保存')", "this.applySettings(readRunSettings(wx), 'Saved')"],
    ["this.applySettings(next, '已保存')", "this.applySettings(next, 'Saved')"],
    ['<text class="settings-title">设置</text>', '<text class="settings-title">Settings</text>'],
    ['<text class="setting-name">步长</text>', '<text class="setting-name">Stride</text>'],
    ['<text class="setting-name">自动心率</text>', '<text class="setting-name">Auto HR</text>'],
    ['<text class="setting-name">语音提示</text>', '<text class="setting-name">Voice</text>'],
    ['<text class="setting-name">记忆增强</text>', '<text class="setting-name">Memory</text>'],
    ['<text class="footer-note">跑前设置</text>', '<text class="footer-note">Pre-run</text>'],
    ['<text class="run-action-text">开跑</text>', '<text class="run-action-text">Start</text>'],
  ]);
}

function localizeCoachPage() {
  replaceText('pages/coach/index.ink', [
    ['"navigationBarTitleText": "AISmartRun 教练"', '"navigationBarTitleText": "AISmartRun Coach"'],
    ['"description": "中文：跑步时可以向 AI 教练询问配速、心率和节奏。它会优先参考当前跑步数据，给出简短语音建议；网络或模型不可用时，也会用本地规则给出基础提醒。\\n\\nEnglish: During a run, ask the AI coach about pace, heart rate and rhythm. It uses current run data first and gives short voice guidance; if the network or model is unavailable, it falls back to basic local tips."', `"description": "${PAGE_DESCRIPTIONS.coach}"`],
    ["const SPEECH_LANG = 'zh-CN';", "const SPEECH_LANG = 'en-US';"],
    ["reply: '点开始问：配速、心率、节奏。'", "reply: 'Tap ask: pace, HR, rhythm.'"],
    ["reply: '已取消。'", "reply: 'Canceled.'"],
    ["reply: '没听清，再点一次。'", "reply: 'Did not catch that.'"],
    ["reply: '识别失败，点重试。'", "reply: 'Speech failed. Retry.'"],
    ["reply: '没听到，再说一次。'", "reply: 'No speech heard.'"],
    ["reply: '此环境不支持语音。'", "reply: 'Speech not available.'"],
    ["reply: '启动失败，点重试。'", "reply: 'Start failed. Retry.'"],
    ['<text class="coach-title">教练</text>', '<text class="coach-title">Coach</text>'],
    ["status === 'listening' ? '聆听' : (status === 'thinking' ? '思考' : '待命')", "status === 'listening' ? 'Listen' : (status === 'thinking' ? 'Think' : 'Ready')"],
    ["liveTranscript || '正在聆听'", "liveTranscript || 'Listening'"],
    ['<text class="coach-context">配速 心率 节奏</text>', '<text class="coach-context">Pace HR Rhythm</text>'],
    ["status === 'listening' ? '停止' : '开始问'", "status === 'listening' ? 'Stop' : 'Ask'"],
  ]);
}

function localizeLibraries() {
  replaceText('lib/settings.js', [
    ["return value ? '开' : '关';", "return value ? 'On' : 'Off';"],
  ]);

  replaceText('lib/devices.js', [
    ["device.deviceName || (device.deviceId ? '已记住' : '自动选择')", "device.deviceName || (device.deviceId ? 'Remembered' : 'Auto pick')"],
    ["device && (device.name || device.deviceName || '心率设备')", "device && (device.name || device.deviceName || 'HR device')"],
  ]);

  replaceText('lib/registry.js', [
    ["label: '心率'", "label: 'Heart rate'"],
    ["label: '跑步速度/步频'", "label: 'Run speed/cadence'"],
    ["label: '骑行速度/踏频'", "label: 'Bike speed/cadence'"],
    ["label: '骑行功率'", "label: 'Bike power'"],
    ["label: '健身器械'", "label: 'Fitness machine'"],
    ["label: '血氧'", "label: 'Pulse ox'"],
    ["`${deviceName || '该设备'}未开放标准蓝牙运动服务（如 Apple Watch 不对第三方广播心率），请改用支持标准心率广播的设备`", "`${deviceName || 'This device'} does not expose standard Bluetooth sport services. Use a device that broadcasts standard heart rate.`"],
    ["`支持：${caps.map((c) => c.label).join(' / ')}`", "`Supported: ${caps.map((c) => c.label).join(' / ')}`"],
  ]);

  replaceText('lib/coach_api.js', [
    ["ctx && ctx !== '暂无运动数据' ? `[实时 ${ctx}] ${q}` : q", "ctx && ctx !== 'No run data' ? `[Live ${ctx}] ${q}` : q"],
    ["parts.push(`[关于我: ${snippets.join('; ')}]`);", "parts.push(`[About me: ${snippets.join('; ')}]`);"],
    ["parts.push(`[画像: ${sanitizeSnippet(memCtx.profile, 120)}]`);", "parts.push(`[Profile: ${sanitizeSnippet(memCtx.profile, 120)}]`);"],
    ["if (ctx && ctx !== '暂无运动数据') parts.push(`[实时: ${ctx}]`);", "if (ctx && ctx !== 'No run data') parts.push(`[Live: ${ctx}]`);"],
  ]);

  replaceText('lib/coach.js', [
    ["'你是 AISmartRun 的 AI 跑步教练，正通过 AI 眼镜陪用户跑步。' +\n  '回答必须是一句话、不超过15个汉字、口语化、可直接朗读，不用列表和表情。' +\n  '没有心率数据时不得猜心率，可按配速、步频和体感建议。' +\n  '不诊断疾病、不给医疗建议；心率明显偏高时优先提醒降速和呼吸。';", "'You are the AISmartRun AI running coach in Rokid glasses. ' +\n  'Answer in one short spoken sentence, no lists and no emoji. ' +\n  'Do not guess heart rate when no HR data is available; use pace, cadence and effort cues. ' +\n  'Do not give medical advice; if heart rate is high, prioritize slowing down and breathing.';"],
    ["return '暂无运动数据';", "return 'No run data';"],
    ["parts.push(`心率 ${Math.round(s.bpm)}${s.zone > 0 ? `(Z${s.zone})` : ''}`);", "parts.push(`HR ${Math.round(s.bpm)}${s.zone > 0 ? `(Z${s.zone})` : ''}`);"],
    ["if (p !== '--:--') parts.push(`配速 ${p}/km`);", "if (p !== '--:--') parts.push(`Pace ${p}/km`);"],
    ["parts.push(`步频 ${Math.round(s.cadenceSpm)}`);", "parts.push(`Cad ${Math.round(s.cadenceSpm)}`);"],
    ["parts.push(`距离 ${formatDistanceKm(s.distanceM)}km`);", "parts.push(`Dist ${formatDistanceKm(s.distanceM)}km`);"],
    ["parts.push(`时长 ${formatElapsed(s.elapsedMs)}`);", "parts.push(`Time ${formatElapsed(s.elapsedMs)}`);"],
    ["if (s.paused) parts.push('已暂停');", "if (s.paused) parts.push('Paused');"],
    ["return parts.length ? parts.join('，') : '暂无运动数据';", "return parts.length ? parts.join(', ') : 'No run data';"],
    ["return `${PERSONA}\\n当前实时数据：${summarizeSnapshot(s)}。`;", "return `${PERSONA}\\nLive data: ${summarizeSnapshot(s)}.`;"],
    ["if (cz >= 5 && pz < 5) return '心率 Z5 了，降速深呼吸。';", "if (cz >= 5 && pz < 5) return 'Z5 HR, slow down.';"],
    ["if (cMin > pMin) return '还在 Z5，先降下来。';", "if (cMin > pMin) return 'Still Z5, ease off.';"],
    ["? `第 ${km} 公里，配速 ${p}。`", "? `Km ${km}, pace ${p}.`"],
    [": `${km} 公里了，继续。`;", ": `${km} km, keep going.`;"],
    ["const cad = Number.isFinite(cur.cadenceSpm) && cur.cadenceSpm > 0 ? `，步频 ${Math.round(cur.cadenceSpm)}` : '';", "const cad = Number.isFinite(cur.cadenceSpm) && cur.cadenceSpm > 0 ? `, cad ${Math.round(cur.cadenceSpm)}` : '';"],
    ["return `跑了 ${cm * 5} 分钟${cad}。`;", "return `${cm * 5} min done${cad}.`;"],
    ["if (cz === 4 && pz < 4) return '到 Z4 了，别再加速。';", "if (cz === 4 && pz < 4) return 'Z4 now, do not push.';"],
    ["if (/配速|速度|快|慢|提速|加速|降速/.test(t)) return 'pace';", "if (/pace|speed|fast|slow|faster|slower/i.test(t)) return 'pace';"],
    ["if (/心率|心跳|bpm|区间|zone/i.test(t)) return 'hr';", "if (/bpm|zone|heart|hr|pulse/i.test(t)) return 'hr';"],
    ["if (/距离|多远|公里|千米|km/i.test(t)) return 'distance';", "if (/km|distance|far/i.test(t)) return 'distance';"],
    ["if (/多久|时间|多长|跑了多少时间|还要跑/.test(t)) return 'time';", "if (/time|long/i.test(t)) return 'time';"],
    ["return '心率 Z5 了，降速深呼吸。';", "return 'Z5 HR, slow down.';"],
    ["return `配速 ${p}，${zone >= 4 ? '稍收一点' : '保持住'}。`;", "return `Pace ${p}, ${zone >= 4 ? 'ease off' : 'hold it'}.`;"],
    ["return '先匀速跑两分钟再看。';", "return 'Run steady for 2 min.';"],
    ["return `心率 ${Math.round(snap.bpm)}${zone > 0 ? ` Z${zone}` : ''}，${zone >= 4 ? '偏高' : '很稳'}。`;", "return `HR ${Math.round(snap.bpm)}${zone > 0 ? ` Z${zone}` : ''}, ${zone >= 4 ? 'high' : 'steady'}.`;"],
    ["return '当前无心率数据。';", "return 'No HR data now.';"],
    ["return `已跑 ${formatDistanceKm(snap.distanceM)} 公里，加油。`;", "return `Done ${formatDistanceKm(snap.distanceM)} km.`;"],
    ["return '刚起步，慢慢来。';", "return 'Just started, ease in.';"],
    ["return `已跑 ${formatElapsed(snap.elapsedMs)}，稳住。`;", "return `Time ${formatElapsed(snap.elapsedMs)}, hold.`;"],
    ["return '刚开始，进状态。';", "return 'Getting started.';"],
    ["if (zone >= 4) return '心率偏高，放慢些。';", "if (zone >= 4) return 'HR high, slow down.';"],
    ["if (zone > 0 && zone <= 2) return '很轻松，可稳提速。';", "if (zone > 0 && zone <= 2) return 'Easy effort, lift gently.';"],
    ["if (!hasMotionData(snap)) return '先稳跑，找节奏。';", "if (!hasMotionData(snap)) return 'Settle into rhythm.';"],
    ["return '节奏很好，保持。';", "return 'Good rhythm, hold.';"],
  ]);
  replaceRegex('lib/coach.js', [
    [
      /const PERSONA =[\s\S]*?;\n/,
      "const PERSONA =\n  'You are the AISmartRun AI running coach in Rokid glasses. ' +\n  'Answer in one short spoken sentence, no lists and no emoji. ' +\n  'Do not guess heart rate when no HR data is available; use pace, cadence and effort cues. ' +\n  'Do not give medical advice; if heart rate is high, prioritize slowing down and breathing.';\n",
    ],
    [
      /const cut = Math\.max\([\s\S]*?\n\s*\);\n/,
      "const cut = Math.max(\n    head.lastIndexOf('.'), head.lastIndexOf('!'), head.lastIndexOf('?'),\n    head.lastIndexOf(','),\n  );\n",
    ],
    [/if \(\/[^/\n]*pace\|speed\|fast\|slow\|faster\|slower\/i\.test\(t\)\) return 'pace';/g, "if (/pace|speed|fast|slow|faster|slower/i.test(t)) return 'pace';"],
    [/if \(\/[^/\n]*bpm\|[^/\n]*zone\|heart\|hr\|pulse\/i\.test\(t\)\) return 'hr';/g, "if (/bpm|zone|heart|hr|pulse/i.test(t)) return 'hr';"],
    [/if \(\/[^/\n]*km\|distance\|far\/i\.test\(t\)\) return 'distance';/g, "if (/km|distance|far/i.test(t)) return 'distance';"],
    [/if \(\/[^/\n]*time\|long\/i\.test\(t\)\) return 'time';/g, "if (/time|long/i.test(t)) return 'time';"],
  ]);
}

function stripChineseComments() {
  for (const abs of listTextFiles()) {
    let text = fs.readFileSync(abs, 'utf8');
    text = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => (
      NON_EN_RE.test(comment) ? '' : comment
    ));
    text = text.replace(/^[ \t]*\/\/.*[\u3000-\u303f\u3400-\u9fff\uff00-\uffef].*$/gm, '');
    text = text.replace(/[ \t]+\/\/.*[\u3000-\u303f\u3400-\u9fff\uff00-\uffef].*$/gm, '');
    fs.writeFileSync(abs, text);
  }
}

function assertNoChineseInStage() {
  const hits = [];
  for (const abs of listTextFiles()) {
    const relPath = path.relative(STAGE, abs);
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (NON_EN_RE.test(lines[i])) {
        hits.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
        if (hits.length >= 30) break;
      }
    }
  }
  if (hits.length) {
    fail(`English AIX still contains non-English CJK/fullwidth text:\n${hits.join('\n')}`);
  }
}

function localizeAll() {
  localizeMetadata();
  localizeHome();
  localizeRunHud();
  localizeBluetooth();
  localizeSettings();
  localizeCoachPage();
  localizeLibraries();

  for (const pageFile of [
    'pages/index/index.ink',
    'pages/run_hud/index.ink',
    'pages/bluetooth/index.ink',
    'pages/settings/index.ink',
    'pages/coach/index.ink',
  ]) {
    replaceRegex(pageFile, [
      [/"description": "中文：[^"]+ English: ([^"]+)"/g, '"description": "$1"'],
    ]);
  }
  stripChineseComments();
  assertNoChineseInStage();
}

function packStage() {
  const zipCheck = spawnSync('zip', ['-v'], { cwd: STAGE, stdio: 'ignore' });
  if (zipCheck.error || zipCheck.status !== 0) {
    fail('Missing zip command. Install Info-ZIP or use the official AIUI packer when available.');
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.rmSync(TMP, { force: true });
  const result = spawnSync('zip', ['-q', '-X', '-r', TMP, ...PACKAGE_ENTRIES], {
    cwd: STAGE,
    stdio: 'inherit',
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`zip failed with exit code ${result.status}`);
  fs.renameSync(TMP, OUT);
  fs.chmodSync(OUT, 0o664);
  const sizeKb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`Packed ${path.relative(ROOT, OUT)} (${sizeKb} KB)`);
}

prepareStage();
localizeAll();
packStage();
