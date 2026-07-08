<script type="application/json" def>
{
  "navigationBarTitleText": "AISmartRun 教练",
  "description": "中文：跑步时可以向 AI 教练询问配速、心率和节奏。它会优先参考当前跑步数据，给出简短语音建议；网络或模型不可用时，也会用本地规则给出基础提醒。\n\nEnglish: During a run, ask the AI coach about pace, heart rate and rhythm. It uses current run data first and gives short voice guidance; if the network or model is unavailable, it falls back to basic local tips.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "status": { "type": "string", "description": "中文：当前语音状态。 English: Current voice interaction status." },
        "reply": { "type": "string", "description": "中文：教练最近一次回复。 English: Latest coach reply." }
      },
      "required": ["status", "reply"]
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import {
  buildCoachPersonaPrompt, fallbackCoachReply, sanitizeCoachReply, summarizeSnapshot,
} from '../../lib/coach.js';
import {
  buildAnonLoginRequest, parseAnonLoginResponse,
  buildAiuiRecordRequest, parseAiuiRecordResponse,
  buildMemoryContextRequest, parseMemoryContext, buildAugmentedQuestion,
  resolveCoachBackendConfig,
} from '../../lib/coach_api.js';
import { readLiveSnapshot } from '../../lib/live.js';
import { readRunSettings } from '../../lib/settings.js';

const STREAM_POLL_MS = 16;
const ASR_IDLE_TIMEOUT_MS = 5000;
const SPEECH_LANG = 'zh-CN';
const COACH_TOKEN_KEY = 'coach_token';           // wx storage 里的鉴权 JWT
const DEVICE_ID_KEY = 'smartrun_device_id';       // 匿名设备 ID(通用链路)
const BACKEND_TIMEOUT_MS = 2500;                  // EverMind 后台超时:登录+记忆最坏 5s,不拖垮"思考"
const LOGIN_RETRY_MS = 60000;                     // 匿名直登失败负缓存:60s 内不重试,失败不重复付超时
const LLM_TIMEOUT_MS = 10000;                     // 官方模型流式总超时:挂起也要落到规则兜底,不许永久"思考"

// 教练读 run_hud 通过 wx storage 写下的"此刻真实快照"(lib/live.js)。
// 没在跑步 → 读到 null → summarizeSnapshot 给「暂无运动数据」、兜底也不编数字。
function liveSnapshot() {
  return readLiveSnapshot(wx) || {};
}

function compactStatLine(snapshot) {
  const s = summarizeSnapshot(snapshot);
  return s.length > 24 ? s.slice(0, 24) + '...' : s;
}

function normalizeText(v) {
  return typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').trim() : '';
}

function errMsg(e) {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  return e.message || e.errMsg || String(e);
}

function extractTranscript(event) {
  const results = event && event.results;
  if (!results || typeof results.length !== 'number') return { transcript: '', hasFinal: false };
  const parts = [];
  let hasFinal = false;
  for (let i = 0; i < results.length; i += 1) {
    const alt = results[i] && results[i][0];
    if (alt && alt.transcript) parts.push(alt.transcript);
    if (results[i] && results[i].isFinal) hasFinal = true;
  }
  return { transcript: normalizeText(parts.join('')), hasFinal };
}

export default {
  data: {
    status: 'checking',
    llmAvailable: false,
    asrAvailable: false,
    ttsAvailable: false,
    statLine: '',
    liveTranscript: '',
    question: '',
    reply: '点开始问：配速、心率、节奏。',
    usedFallback: false,
    replySource: '',
    lastError: '',
  },

  async onLoad() {
    this.session = null;
    this.recognition = null;
    this.asrIdleTimer = null;
    this.turnId = '';
    this.finalTranscript = '';
    this.recognitionFailed = false;
    this.runSettings = readRunSettings(wx);
    this.backendConfig = resolveCoachBackendConfig(wx);
    this.setData({ statLine: compactStatLine(liveSnapshot()) });
    await this.refreshAvailability();
  },

  onUnload() {
    this.recognitionFailed = true;
    this.turnId = '';
    this.clearIdleTimer();
    this.disposeRecognition();
    if (this.session) {
      try { this.session.destroy(); } catch (_e) {}
      this.session = null;
    }
  },

  onVoiceWakeup(event) {
    this.beginTurn(event && event.keyword ? event.keyword : 'wake');
  },

  onKeyUp(event) {
    const code = event && event.code;
    if (code === 'Backspace') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (this.turnId || this.data.status === 'listening'
          || this.data.status === 'thinking' || this.data.status === 'speaking') {
        this.cancelTurn();
        return;
      }
      this.goBack();
      return;
    }
    if (code !== 'Enter' && code !== 'NumpadEnter' && code !== 'Space' && code !== 'GlobalHook') {
      return;
    }
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    this.toggleAsr();
  },

  goBack() {
    if (typeof wx.navigateBack === 'function') {
      wx.navigateBack({ delta: 1 });
      return;
    }
    if (typeof wx.redirectTo === 'function') wx.redirectTo({ url: '/pages/index/index' });
  },

  cancelTurn() {
    this.recognitionFailed = true;
    this.turnId = '';
    this.clearIdleTimer();
    try {
      if (this.recognition && typeof this.recognition.abort === 'function') this.recognition.abort();
      else if (this.recognition && typeof this.recognition.stop === 'function') this.recognition.stop();
    } catch (_e) {}
    this.setData({ status: 'idle', liveTranscript: '', reply: '已取消。' });
  },

  detectAsr() { return typeof SpeechRecognition !== 'undefined'; },
  detectTts() {
    return (typeof speechSynthesis !== 'undefined' &&
      typeof SpeechSynthesisUtterance !== 'undefined' &&
      typeof speechSynthesis.speak === 'function') ||
      !!(wx && wx.speech && typeof wx.speech.playTTS === 'function');
  },

  async refreshAvailability() {
    const asrAvailable = this.detectAsr();
    const ttsAvailable = this.detectTts();
    this.setData({ asrAvailable, ttsAvailable, status: 'checking' });
    try {
      const a = await LanguageModel.availability();
      this.setData({ llmAvailable: a === 'available', status: 'idle' });
    } catch (e) {
      // LLM 不可用不是致命——兜底教练仍能工作
      this.setData({ llmAvailable: false, status: 'idle', lastError: errMsg(e) });
    }
  },

  async ensureSession() {
    if (this.session) return this.session;
    // 不指定模型名,交给 Rokid AIUI 宿主 defaultModel 配置(官方 DeepSeek 能力)。
    // system prompt 只含人设:会话跨轮复用,实时快照每轮由 buildAugmentedQuestion
    // 注入问题,避免会话创建瞬间的快照被"冻结"成全程事实。
    this.session = await LanguageModel.create({
      initialPrompts: [{ role: 'system', content: buildCoachPersonaPrompt() }],
    });
    return this.session;
  },

  clearIdleTimer() {
    if (this.asrIdleTimer) { clearTimeout(this.asrIdleTimer); this.asrIdleTimer = null; }
  },

  refreshIdleTimer() {
    this.clearIdleTimer();
    if (!this.turnId || this.data.status !== 'listening') return;
    const turn = this.turnId;
    this.asrIdleTimer = setTimeout(() => {
      if (this.turnId !== turn || this.data.status !== 'listening') return;
      this.recognitionFailed = true;
      this.disposeRecognition();
      this.turnId = '';
      this.setData({ status: 'idle', reply: '没听清，再点一次。', liveTranscript: '' });
    }, ASR_IDLE_TIMEOUT_MS);
  },

  bindRecognition() {
    if (!this.detectAsr()) return false;
    this.disposeRecognition();
    const rec = new SpeechRecognition();
    rec.lang = SPEECH_LANG;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => { this.refreshIdleTimer(); this.setData({ status: 'listening' }); };
    rec.onaudiostart = () => this.refreshIdleTimer();
    rec.onspeechstart = () => this.refreshIdleTimer();
    rec.onresult = (event) => {
      if (!this.turnId) return;
      this.refreshIdleTimer();
      const { transcript, hasFinal } = extractTranscript(event);
      this.setData({ liveTranscript: transcript });
      if (hasFinal && transcript) this.finalTranscript = transcript;
    };
    rec.onerror = (event) => {
      this.clearIdleTimer();
      this.recognitionFailed = true;
      this.disposeRecognition();
      this.turnId = '';
      this.setData({ status: 'idle', lastError: (event && event.error) || 'asr error', reply: '识别失败，点重试。' });
    };
    rec.onend = async () => {
      this.clearIdleTimer();
      if (this.recognition === rec) this.recognition = null;
      if (!this.turnId || this.recognitionFailed) return;
      const transcript = normalizeText(this.finalTranscript || this.data.liveTranscript);
      if (!transcript) {
        this.turnId = '';
        this.setData({ status: 'idle', reply: '没听到，再说一次。' });
        return;
      }
      this.setData({ question: transcript });
      await this.answer(this.turnId, transcript);
    };

    this.recognition = rec;
    return true;
  },

  disposeRecognition() {
    const rec = this.recognition;
    if (!rec) return;
    try {
      rec.onstart = null; rec.onaudiostart = null; rec.onspeechstart = null;
      rec.onresult = null; rec.onerror = null; rec.onend = null;
      rec.abort();
    } catch (_e) {}
    this.recognition = null;
  },

  // 手动触发（眼镜交互态要求 ASR 必须由用户动作发起）
  toggleAsr() {
    if (this.data.status === 'listening') {
      this.recognitionFailed = true;
      this.clearIdleTimer();
      this.disposeRecognition();
      this.turnId = '';
      this.setData({ status: 'idle', liveTranscript: '' });
      return;
    }
    if (this.data.status === 'thinking' || this.data.status === 'speaking') return;
    this.beginTurn('manual');
  },

  beginTurn(keyword) {
    if (this.data.status === 'thinking' || this.data.status === 'speaking') return;
    if (!this.bindRecognition()) {
      this.setData({ status: 'idle', reply: '此环境不支持语音。', lastError: 'no SpeechRecognition' });
      return;
    }
    this.clearIdleTimer();
    this.finalTranscript = '';
    this.recognitionFailed = false;
    this.turnId = `turn-${Date.now()}`;
    this.setData({ status: 'listening', liveTranscript: '', question: '', usedFallback: false, lastError: '' });
    try {
      this.recognition.start();
    } catch (e) {
      this.turnId = '';
      this.setData({ status: 'idle', reply: '启动失败，点重试。', lastError: errMsg(e) });
    }
  },

  // 流式读全量,带截止时间:超时/取消(turnId 变化)即停,防止挂起流把用户永久卡在"思考"。
  async readAll(stream, turnId, deadlineMs) {
    const chunks = [];
    while (true) {
      if (this.turnId !== turnId) break;
      if (deadlineMs && Date.now() > deadlineMs) throw new Error('llm timeout');
      const { done, value } = await stream.read();
      if (done) break;
      if (typeof value === 'string' && value.length > 0) {
        chunks.push(value);
        this.setData({ reply: chunks.join('') });
      } else {
        await new Promise((r) => setTimeout(r, STREAM_POLL_MS));
      }
    }
    return chunks.join('');
  },

  // wx.request Promise 化 + 超时(超时/异常一律 resolve(null) 触发降级)
  wxRequest(req) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      const timer = setTimeout(() => finish(null), BACKEND_TIMEOUT_MS);
      try {
        wx.request({
          ...req,
          success: (r) => { clearTimeout(timer); finish(r); },
          fail: () => { clearTimeout(timer); finish(null); },
        });
      } catch (_e) { clearTimeout(timer); finish(null); }
    });
  },

  // 稳定的匿名设备 ID(通用链路):首启生成一次,存 wx storage 长期不变。
  // 页面级缓存兜底:storage 损坏时同一页面生命周期内仍复用同一个 ID,
  // 不会每轮问答都在后端注册一个新匿名用户。
  ensureDeviceId() {
    if (this.deviceIdCache) return this.deviceIdCache;
    let id = '';
    try { id = wx.getStorageSync(DEVICE_ID_KEY) || ''; } catch (_e) {}
    if (!id) {
      id = 'aiui-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      try { wx.setStorageSync(DEVICE_ID_KEY, id); } catch (_e) {}
    }
    this.deviceIdCache = id;
    return id;
  },

  // 取鉴权 token:优先已存的(你的个人 token 或上次匿名直登的);没有则用设备 ID 匿名直登换一个。
  // 直登失败进入 60s 负缓存:断网时不为每轮问答重复支付一次登录超时。
  // 后端 anon-login 强制要求共享 app key(缺失 422/不匹配 401):无 key 直接跳过登录,
  // 不打必失败的请求 —— 记忆链路显式关闭,教练仍走官方模型 + 规则兜底。
  async ensureToken() {
    let token = '';
    try { token = wx.getStorageSync(COACH_TOKEN_KEY) || ''; } catch (_e) {}
    if (token) return token;
    if (this.loginFailedAt && Date.now() - this.loginFailedAt < LOGIN_RETRY_MS) return '';
    const config = this.backendConfig || resolveCoachBackendConfig(wx);
    if (!config.appKey) return '';
    const resp = await this.wxRequest(
      buildAnonLoginRequest({
        baseUrl: config.baseUrl,
        clientId: config.clientId,
        appKey: config.appKey,
        deviceId: this.ensureDeviceId(),
      }),
    );
    const t = parseAnonLoginResponse(resp);
    if (t) {
      this.loginFailedAt = null;
      try { wx.setStorageSync(COACH_TOKEN_KEY, t); } catch (_e) {}
    } else {
      this.loginFailedAt = Date.now();
    }
    return t || '';
  },

  // AIUI 官方 LanguageModel 已生成的结果写回后端,由后端存历史并双写 EverMind。
  async recordCoachTurn(question, reply, snapshot, source) {
    if (this.runSettings && this.runSettings.memoryContext === false) return false;
    try {
      const token = await this.ensureToken();
      if (!token) return false;
      const config = this.backendConfig || resolveCoachBackendConfig(wx);
      const resp = await this.wxRequest(buildAiuiRecordRequest({
        baseUrl: config.baseUrl, token, question, reply, snapshot, source,
      }));
      if (resp && resp.statusCode === 401) {
        try { wx.removeStorageSync(COACH_TOKEN_KEY); } catch (_e) {}
        return false;
      }
      return parseAiuiRecordResponse(resp);
    } catch (_e) {
      return false;
    }
  },

  // 记忆检索:只从后端取 EverMind/本地记忆,不让后端跑 LLM;注入官方 AIUI 模型 prompt。
  async fetchMemoryContext(question) {
    if (this.runSettings && this.runSettings.memoryContext === false) return null;
    const token = await this.ensureToken();
    if (!token) return null;
    const config = this.backendConfig || resolveCoachBackendConfig(wx);
    const resp = await this.wxRequest(buildMemoryContextRequest({
      baseUrl: config.baseUrl, token, query: question,
    }));
    if (resp && resp.statusCode === 401) {
      try { wx.removeStorageSync(COACH_TOKEN_KEY); } catch (_e) {}  // token 过期 → 清掉,下次重新直登
      return null;
    }
    return parseMemoryContext(resp);
  },

  async answer(turnId, question) {
    if (!turnId || this.turnId !== turnId) return;
    const snap = liveSnapshot();
    this.setData({
      status: 'thinking', reply: '', usedFallback: false, replySource: '',
      statLine: compactStatLine(snap),   // 顶部实时行每轮刷新,不再停留在进页那一刻
    });

    let finalText = '';
    let replySource = '';
    let usedFallback = false;
    const zone = Number.isFinite(snap.zone) ? snap.zone : 0;

    // 安全优先:Z5 高心率时直接用确定性规则回答(降速提醒),不把安全提示
    // 交给概率性的 LLM;prompt 约束只是请求,规则才是保证。
    if (zone >= 5) {
      finalText = fallbackCoachReply(snap, question);
      usedFallback = true;
      replySource = 'rule-safety';
    } else {
      // 记忆增强(best-effort):后端只取 EverMind/本地记忆,官方 AIUI 模型负责生成回答。
      let memCtx = null;
      try { memCtx = await this.fetchMemoryContext(question); } catch (_e) { memCtx = null; }
      if (this.turnId !== turnId) return;

      // Tier 1(主链路):Rokid 官方 AIUI LanguageModel(DeepSeek)。
      // 不再用 onLoad 时的一次性 llmAvailable 快照做闸门:能力可能恢复,
      // 直接尝试创建/提问,失败自然落到规则兜底。流式带 10s 总超时。
      try {
        const session = await this.ensureSession();
        const stream = session.promptStreaming(buildAugmentedQuestion(question, snap, memCtx));
        const raw = await this.readAll(stream, turnId, Date.now() + LLM_TIMEOUT_MS);
        // 后置消毒:prompt 里的"≤15字/无列表/无 markdown"只是请求,这里确定性保证。
        finalText = sanitizeCoachReply(normalizeText(raw));
        if (finalText) {
          replySource = (memCtx && (memCtx.memories.length || memCtx.profile)) ? 'aiui+evermind' : 'aiui';
        } else {
          throw new Error('empty reply');
        }
      } catch (_e) { finalText = ''; }
    }

    // Tier 2:规则兜底(官方 AIUI 模型不可用时也绝不把用户晾在"出错了")。
    if (!finalText) {
      finalText = fallbackCoachReply(snap, question);
      usedFallback = true;
      replySource = 'rule';
    }

    if (this.turnId !== turnId) return;
    this.setData({ reply: finalText, usedFallback, replySource });
    this.recordCoachTurn(question, finalText, snap, replySource);
    await this.speak(turnId, finalText);
  },

  async speak(turnId, text) {
    const content = normalizeText(text);
    if (this.runSettings && this.runSettings.voiceCue === false) { this.finishTurn(turnId); return; }
    if (!content || !this.data.ttsAvailable) { this.finishTurn(turnId); return; }
    try {
      await this.playTts(content);
    } catch (e) {
      this.setData({ lastError: `TTS: ${errMsg(e)}` });
    }
    this.finishTurn(turnId);
  },

  playTts(text) {
    if (wx && wx.speech && typeof wx.speech.playTTS === 'function') {
      this.setData({ status: 'speaking' });
      try {
        wx.speech.playTTS(text);
        return Promise.resolve('done');
      } catch (e) {
        return Promise.reject(e);
      }
    }
    if (typeof speechSynthesis !== 'undefined' &&
        typeof SpeechSynthesisUtterance !== 'undefined' &&
        typeof speechSynthesis.speak === 'function') {
      return new Promise((resolve, reject) => {
        try {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = SPEECH_LANG;
          u.onstart = () => this.setData({ status: 'speaking' });
          u.onend = () => resolve('done');
          u.onerror = (ev) => reject(new Error(ev && ev.message ? ev.message : 'tts error'));
          speechSynthesis.speak(u);
        } catch (e) { reject(e); }
      });
    }
    return Promise.resolve('unsupported');
  },

  finishTurn(turnId) {
    if (this.turnId !== turnId && turnId) return;
    this.clearIdleTimer();
    this.turnId = '';
    this.finalTranscript = '';
    this.recognitionFailed = false;
    this.setData({ status: 'idle', liveTranscript: '', statLine: compactStatLine(liveSnapshot()) });
  },
};
</script>

<page>
  <view class="coach-wrap">
  <card class="coach">
    <view class="coach-top">
      <view class="coach-mark">
        <image class="coach-logo" src="../../assets/smartrun-runner-48.png" mode="aspectFit" />
      </view>
      <text class="coach-title">教练</text>
      <text class="coach-status">{{ status === 'listening' ? '聆听' : (status === 'thinking' ? '思考' : '待命') }}</text>
    </view>

    <view class="chat-bubble">
      <text class="bubble-text">{{ status === 'listening' ? (liveTranscript || '正在聆听') : reply }}</text>
    </view>

    <view class="coach-bottom">
      <text class="coach-context">配速 心率 节奏</text>
      <button class="btn-mic btn-selected" bindtap="toggleAsr">
        <text class="btn-mic-txt">{{ status === 'listening' ? '停止' : '开始问' }}</text>
      </button>
    </view>
  </card>
  </view>
</page>

<style>
.coach-wrap {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 150px;
}

.coach {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 150px;
  background-color: #000000;
  border: 2px solid var(--color-primary-60, rgba(64, 255, 94, 0.6));
  border-radius: 12px;
  padding: 10px 12px;
}

.coach-top {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 30px;
}

.coach-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 2px solid var(--color-primary-60, rgba(64, 255, 94, 0.6));
  border-radius: 15px;
  background-color: var(--color-primary-08, rgba(64, 255, 94, 0.08));
}

.coach-logo {
  width: 26px;
  height: 26px;
}

.coach-title {
  color: var(--color-primary, #40ff5e);
  font-size: 26px;
  line-height: 30px;
  font-weight: bold;
  font-family: monospace;
  margin-left: 8px;
}

.coach-status {
  color: var(--color-primary, #40ff5e);
  font-size: 18px;
  line-height: 22px;
  font-weight: bold;
  padding: 0 9px;
  border: 2px solid var(--color-primary-60, rgba(64, 255, 94, 0.6));
  border-radius: 12px;
  background-color: var(--color-primary-08, rgba(64, 255, 94, 0.08));
}

.chat-bubble {
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  height: 64px;
  margin-top: 6px;
  padding: 8px 12px;
  background-color: var(--color-primary-08, rgba(64, 255, 94, 0.08));
  border: 4px solid var(--color-primary, #40ff5e);
  border-radius: 12px;
}

.bubble-text {
  color: var(--color-primary, #40ff5e);
  font-size: 22px;
  line-height: 28px;
  font-weight: bold;
}

.coach-bottom {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  margin-top: 6px;
}

.coach-context {
  color: var(--color-primary-60, rgba(64, 255, 94, 0.6));
  font-size: 18px;
  line-height: 24px;
  font-weight: bold;
}

.btn-mic {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 120px;
  height: 34px;
  background-color: #000000;
  border-radius: 12px;
  border: 2px solid var(--color-primary, #40ff5e);
}

.btn-mic-txt {
  color: var(--color-primary, #40ff5e);
  font-size: 24px;
  line-height: 30px;
  font-weight: bold;
  text-align: center;
}

.btn-selected {
  border-width: 4px;
}
</style>
