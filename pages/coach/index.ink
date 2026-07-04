<script type="application/json" def>
{
  "navigationBarTitleText": "AI 跑步教练",
  "description": "语音 AI 跑步教练：唤醒或点按开始拾音，教练结合实时心率/配速给出简短语音指导，LLM 不可用时用规则化兜底回答。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "status": { "type": "string", "description": "语音回合状态：idle/listening/thinking/speaking/error" },
        "reply": { "type": "string", "description": "教练最近一句回答文本" }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { buildCoachSystemPrompt, fallbackCoachReply, summarizeSnapshot } from '../../lib/coach.js';
import {
  buildAnonLoginRequest, parseAnonLoginResponse,
  buildMemoryContextRequest, parseMemoryContext, buildAugmentedQuestion,
} from '../../lib/coach_api.js';
import { readLiveSnapshot } from '../../lib/live.js';

const STREAM_POLL_MS = 16;
const ASR_IDLE_TIMEOUT_MS = 5000;
const SPEECH_LANG = 'zh-CN';
const COACH_TOKEN_KEY = 'coach_token';           // wx storage 里的鉴权 JWT
const DEVICE_ID_KEY = 'smartrun_device_id';       // 匿名设备 ID(通用链路)
const BACKEND_TIMEOUT_MS = 6000;                  // 后端超时 → 降级到内置 LLM
// AIUI 通用链路 App 共享密钥。⚠️ 仓库转私有后再填真值;占位时匿名直登失败 → 优雅降级到内置 LLM。
const APP_KEY = '__SET_AFTER_REPO_PRIVATE__';

// 教练读 run_hud 通过 wx storage 写下的"此刻真实快照"(lib/live.js)。
// 没在跑步 → 读到 null → summarizeSnapshot 给「暂无运动数据」、兜底也不编数字。
function liveSnapshot() {
  return readLiveSnapshot(wx) || {};
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
    reply: '点按钮，问配速或心率。',
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
    this.setData({ statLine: summarizeSnapshot(liveSnapshot()) });
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
    this.session = await LanguageModel.create({
      initialPrompts: [{ role: 'system', content: buildCoachSystemPrompt(liveSnapshot()) }],
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

  async readAll(stream) {
    const chunks = [];
    while (true) {
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
  ensureDeviceId() {
    let id = '';
    try { id = wx.getStorageSync(DEVICE_ID_KEY) || ''; } catch (_e) {}
    if (!id) {
      id = 'aiui-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      try { wx.setStorageSync(DEVICE_ID_KEY, id); } catch (_e) {}
    }
    return id;
  },

  // 取鉴权 token:优先已存的(你的个人 token 或上次匿名直登的);没有则用设备 ID 匿名直登换一个。
  async ensureToken() {
    let token = '';
    try { token = wx.getStorageSync(COACH_TOKEN_KEY) || ''; } catch (_e) {}
    if (token) return token;
    const resp = await this.wxRequest(
      buildAnonLoginRequest({ appKey: APP_KEY, deviceId: this.ensureDeviceId() }),
    );
    const t = parseAnonLoginResponse(resp);
    if (t) { try { wx.setStorageSync(COACH_TOKEN_KEY, t); } catch (_e) {} }
    return t || '';
  },

  // 记忆检索(省 token:只从后端取记忆,不让后端跑 LLM);无 token 自动匿名直登;失败 → null,不影响主流程。
  async fetchMemoryContext(question) {
    const token = await this.ensureToken();
    if (!token) return null;
    const resp = await this.wxRequest(buildMemoryContextRequest({ token, query: question }));
    if (resp && resp.statusCode === 401) {
      try { wx.removeStorageSync(COACH_TOKEN_KEY); } catch (_e) {}  // token 过期 → 清掉,下次重新直登
      return null;
    }
    return parseMemoryContext(resp);
  },

  async answer(turnId, question) {
    if (!turnId || this.turnId !== turnId) return;
    this.setData({ status: 'thinking', reply: '', usedFallback: false, replySource: '' });

    const snap = liveSnapshot();
    let finalText = '';
    let replySource = '';

    // 记忆增强(best-effort,不阻塞):后端取 EverMind/本地记忆;取不到就 null,不影响主流程。
    let memCtx = null;
    try { memCtx = await this.fetchMemoryContext(question); } catch (_e) { memCtx = null; }
    if (this.turnId !== turnId) return;

    // Tier 1(主力)：眼镜内置 DeepSeek V4 Pro,prompt 注入记忆+实时数据 —— 省你的 token、兼容性好
    try {
      if (!this.data.llmAvailable) throw new Error('LLM unavailable');
      const session = await this.ensureSession();
      const stream = session.promptStreaming(buildAugmentedQuestion(question, snap, memCtx));
      finalText = normalizeText(await this.readAll(stream));
      if (finalText) {
        replySource = (memCtx && (memCtx.memories.length || memCtx.profile)) ? 'device+memory' : 'device';
      } else {
        throw new Error('empty reply');
      }
    } catch (_e) { finalText = ''; }

    // Tier 2：规则兜底(内置模型不可用/离线也绝不把用户晾在"出错了")
    let usedFallback = false;
    if (!finalText) {
      finalText = fallbackCoachReply(snap, question);
      usedFallback = true;
      replySource = 'rule';
    }

    if (this.turnId !== turnId) return;
    this.setData({ reply: finalText, usedFallback, replySource });
    await this.speak(turnId, finalText);
  },

  async speak(turnId, text) {
    const content = normalizeText(text);
    if (!content || !this.data.ttsAvailable) { this.finishTurn(turnId); return; }
    try {
      await this.playTts(content);
    } catch (e) {
      this.setData({ lastError: `TTS: ${errMsg(e)}` });
    }
    this.finishTurn(turnId);
  },

  playTts(text) {
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
    if (wx && wx.speech && typeof wx.speech.playTTS === 'function') {
      this.setData({ status: 'speaking' });
      return new Promise((resolve, reject) => {
        wx.speech.playTTS({ text, success: () => resolve('done'), fail: reject });
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
    this.setData({ status: 'idle', liveTranscript: '' });
  },
};
</script>

<page>
  <view class="coach">
    <view class="avatar-row">
      <image class="avatar" src="./coach-avatar.png" mode="aspectFill" />
      <view class="avatar-meta">
        <text class="avatar-name">SmartRun 教练</text>
        <text class="avatar-src" ink:if="{{ replySource === 'device+memory' }}">V4·带记忆</text>
        <text class="avatar-src" ink:if="{{ replySource === 'device' }}">DeepSeek V4</text>
        <text class="avatar-src" ink:if="{{ replySource === 'rule' }}">离线兜底</text>
      </view>
    </view>

    <view class="stat-row">
      <text class="stat-dot">●</text>
      <text class="stat-text">{{ statLine }}</text>
    </view>

    <view class="reply-box">
      <text class="reply-text">{{ reply }}</text>
      <text class="fallback-tag" ink:if="{{ usedFallback }}">规则兜底（LLM 离线）</text>
    </view>

    <view class="live" ink:if="{{ status === 'listening' }}">
      <text class="live-text">{{ liveTranscript || '正在聆听…' }}</text>
    </view>

    <view class="foot">
      <text class="status-chip status-{{ status }}">{{ status }}</text>
      <view class="btn-mic" bindtap="toggleAsr">
        <text class="btn-mic-txt">{{ status === 'listening' ? '停止' : '问教练' }}</text>
      </view>
    </view>
  </view>
</page>

<style>
.avatar-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 20px;
  border: 1px solid #24452f;
  margin-right: 10px;
}

.avatar-meta {
  display: flex;
  flex-direction: column;
}

.avatar-name {
  color: var(--color-primary, #40ff5e);
  font-size: 15px;
  line-height: 19px;
  font-weight: bold;
}

.avatar-src {
  color: #73a785;
  font-size: 10px;
  line-height: 14px;
}

.coach {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: #000000;
  border: 2px solid #143a20;
  border-radius: var(--radius-md, 12px);
  padding: 14px;
}

.stat-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.stat-dot {
  color: var(--color-primary, #40ff5e);
  font-size: 10px;
}

.stat-text {
  color: #8fe0a0;
  font-size: 12px;
  line-height: 16px;
}

.reply-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 56px;
  padding: 10px;
  border: 1px solid #1c3424;
  border-radius: var(--radius-md, 12px);
}

.reply-text {
  color: var(--color-primary, #40ff5e);
  font-size: 18px;
  line-height: 26px;
}

.fallback-tag {
  color: #73a785;
  font-size: 10px;
  line-height: 14px;
}

.live {
  display: flex;
  flex-direction: row;
}

.live-text {
  color: #dbffe5;
  font-size: 13px;
  line-height: 18px;
}

.foot {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.status-chip {
  font-size: 11px;
  color: #73a785;
}

.status-listening,
.status-thinking,
.status-speaking {
  color: var(--color-primary, #40ff5e);
}

.btn-mic {
  min-width: 110px;
  padding: 8px 14px;
  background-color: var(--color-primary, #40ff5e);
  border-radius: var(--radius-md, 12px);
}

.btn-mic-txt {
  color: #031106;
  font-size: 15px;
  line-height: 19px;
  font-weight: bold;
  text-align: center;
}
</style>
