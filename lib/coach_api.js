// EverMind 教练后端(FunpizzaSmartRun /api/coach/chat)对接:纯逻辑构造请求 / 解析响应,
//   便于单测;真正的 wx.request 网络调用在 coach 页里(带 token 与超时/降级)。
// 差异化:后端教练带 EverMind 记忆(记得用户历史/画像),这里把「此刻实时快照」
//   也拼进 message,让带记忆的教练同时看得见当前状态。
// 三级降级(在页面里):本模块 → 眼镜内置 LLM → 规则兜底 fallbackCoachReply。

import { summarizeSnapshot } from './coach.js';

// hermes 公网(nip.io 自带 TLS)。coach 应用在内部是 /api/coach/chat,
// nginx 把它挂在 location /api/coach-svc/ → 8001/api/,故公网路径为 /api/coach-svc/coach/chat。
// (直连 8001 已验证 EverMind 教练 + 长效 token 正常;该 nginx 路由转发 POST body 有 bug 待修。)
export const DEFAULT_BASE_URL = 'https://119.28.104.126.nip.io';
export const CHAT_PATH = '/api/coach-svc/coach/chat';

/** 把实时快照压成前缀,连同问题拼成发给后端的 message;无有效数据则只发问题。 */
export function buildCoachMessage(question, snapshot) {
  const q = String(question || '').trim();
  const ctx = summarizeSnapshot(snapshot);
  return ctx && ctx !== '暂无运动数据' ? `[实时 ${ctx}] ${q}` : q;
}

/**
 * 构造 wx.request 参数(不发送)。token 缺失时不加 Authorization 头
 * (让后端返回 401,页面据此降级到内置 LLM)。
 */
export function buildChatRequest(opts = {}) {
  const {
    baseUrl = DEFAULT_BASE_URL, path = CHAT_PATH, token, question, snapshot,
  } = opts;
  const header = { 'Content-Type': 'application/json' };
  if (token) header.Authorization = `Bearer ${token}`;
  return {
    url: String(baseUrl).replace(/\/+$/, '') + path,
    method: 'POST',
    header,
    data: { message: buildCoachMessage(question, snapshot) },
  };
}

/**
 * 解析后端响应 → 教练回复字符串;非 200 / 无有效 reply 返回 null(触发降级)。
 * resp 形状对齐 wx.request 回调:{ statusCode, data:{ reply, fallback, ... } }。
 */
export function parseChatResponse(resp) {
  if (!resp || resp.statusCode !== 200) return null;
  const d = resp.data;
  const reply = d && typeof d.reply === 'string' ? d.reply.trim() : '';
  return reply || null;
}

// ── 通用链路:匿名设备直登 ────────────────────────────────────
// 任意用户直接打开 AIUI SmartRun → 眼镜用 App key + 本机 device_id 换 JWT,
// 无需手机登录。每设备一个匿名用户 → 各自本地记忆。公网路径同走 coach-svc。
export const ANON_LOGIN_PATH = '/api/coach-svc/coach/anon-login';

/** 构造匿名直登请求(不发送)。 */
export function buildAnonLoginRequest(opts = {}) {
  const {
    baseUrl = DEFAULT_BASE_URL, path = ANON_LOGIN_PATH, appKey, deviceId,
  } = opts;
  return {
    url: String(baseUrl).replace(/\/+$/, '') + path,
    method: 'POST',
    header: { 'Content-Type': 'application/json' },
    data: { app_key: appKey, device_id: deviceId },
  };
}

/** 解析匿名直登响应 → JWT 字符串;非 200 / 无 token 返回 null(降级到内置 LLM)。 */
export function parseAnonLoginResponse(resp) {
  if (!resp || resp.statusCode !== 200) return null;
  const d = resp.data;
  const token = d && typeof d.token === 'string' ? d.token.trim() : '';
  return token || null;
}

// ── 记忆增强(省 token 方案) ──────────────────────────────────
// 主力是眼镜内置 DeepSeek V4 Pro;本端点只从后端"检索记忆"(不跑 LLM),
// 把用户历史记忆+画像注入 on-device 模型的 prompt。best-effort,取不到不影响主流程。
export const MEMORY_CONTEXT_PATH = '/api/coach-svc/coach/memory-context';

/** 构造记忆检索请求(不发送)。 */
export function buildMemoryContextRequest(opts = {}) {
  const {
    baseUrl = DEFAULT_BASE_URL, path = MEMORY_CONTEXT_PATH, token, query,
  } = opts;
  const header = { 'Content-Type': 'application/json' };
  if (token) header.Authorization = `Bearer ${token}`;
  return {
    url: String(baseUrl).replace(/\/+$/, '') + path,
    method: 'POST',
    header,
    data: { query: String(query || '') },
  };
}

/** 解析记忆检索响应 → { memories:[], profile:'' };非 200 返回 null。 */
export function parseMemoryContext(resp) {
  if (!resp || resp.statusCode !== 200 || !resp.data) return null;
  const d = resp.data;
  return {
    memories: Array.isArray(d.memories) ? d.memories : [],
    profile: typeof d.profile === 'string' ? d.profile : '',
  };
}

/** 把记忆 + 画像 + 实时快照拼进用户问题,喂给眼镜内置模型(有记忆则个性化,没有也能答)。 */
export function buildAugmentedQuestion(question, snapshot, memCtx) {
  const q = String(question || '').trim();
  const parts = [];
  if (memCtx && Array.isArray(memCtx.memories) && memCtx.memories.length) {
    parts.push(`[关于我: ${memCtx.memories.slice(0, 5).join('; ')}]`);
  }
  if (memCtx && memCtx.profile) parts.push(`[画像: ${memCtx.profile}]`);
  const ctx = summarizeSnapshot(snapshot);
  if (ctx && ctx !== '暂无运动数据') parts.push(`[实时: ${ctx}]`);
  return parts.length ? `${parts.join(' ')} ${q}` : q;
}
