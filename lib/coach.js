// AI 跑步教练领域逻辑 —— 纯函数，无 AIUI/wx/DOM 依赖，可单测。
//   buildCoachSystemPrompt: 把实时跑步数据注入 LLM system prompt（这是本产品
//     相对 Runsight/HuBu 纯数据显示器的差异化：教练"看得见"你的当前状态）。
//   fallbackCoachReply: LLM/网络不可用时的确定性兜底回答（镜像 FunpizzaSmartRun
//     chat_fallback 思路——跑步中绝不把用户晾在"出错了"上，规则化也要给一句有用的话）。
// snapshot 形状对齐 RunSession.snapshot() + HUD 已算好的 zone/paceSecPerKm。

import { formatElapsed, formatPace, formatDistanceKm } from './format.js';

const PERSONA =
  '你是 SmartRun 的 AI 跑步教练，正通过 AI 眼镜陪用户跑步。' +
  '回答必须简短口语化，一次最多两句中文，因为会在眼镜上显示并朗读。' +
  '不诊断疾病、不给医疗建议；心率明显偏高时优先提醒降速和呼吸。';

/** 把 snapshot 压成一行人类可读的状态串，供 prompt 注入与兜底复用。 */
export function summarizeSnapshot(s) {
  if (!s || typeof s !== 'object') return '暂无运动数据';
  const parts = [];
  if (Number.isFinite(s.bpm) && s.bpm > 0) {
    parts.push(`心率 ${Math.round(s.bpm)}${s.zone > 0 ? `(Z${s.zone})` : ''}`);
  }
  if (Number.isFinite(s.paceSecPerKm) && s.paceSecPerKm > 0) {
    const p = formatPace(s.paceSecPerKm);
    if (p !== '--:--') parts.push(`配速 ${p}/km`);
  }
  if (Number.isFinite(s.cadenceSpm) && s.cadenceSpm > 0) {
    parts.push(`步频 ${Math.round(s.cadenceSpm)}`);
  }
  if (Number.isFinite(s.distanceM) && s.distanceM > 0) {
    parts.push(`距离 ${formatDistanceKm(s.distanceM)}km`);
  }
  if (Number.isFinite(s.elapsedMs) && s.elapsedMs > 0) {
    parts.push(`时长 ${formatElapsed(s.elapsedMs)}`);
  }
  if (s.paused) parts.push('已暂停');
  return parts.length ? parts.join('，') : '暂无运动数据';
}

/** LLM system prompt = 人设 + 实时数据快照。 */
export function buildCoachSystemPrompt(s) {
  return `${PERSONA}\n当前实时数据：${summarizeSnapshot(s)}。`;
}

/**
 * 主动语音提示:比较上一拍与当前快照,决定教练是否该「主动开口」(TTS),
 * 不用等用户问。纯函数,眼镜端定时器每拍调用一次;返回一句话或 null。
 * 优先级:进 Z5 安全降速 > 整公里里程碑 > 每 5 分钟 > 进 Z4 提醒。
 * snapshot 形状:{ distanceM, elapsedMs, zone, cadenceSpm, paceSecPerKm }。
 */
export function nextProactiveCue(prev, cur) {
  if (!cur || typeof cur !== 'object') return null;
  const pz = prev && Number.isFinite(prev.zone) ? prev.zone : 0;
  const cz = Number.isFinite(cur.zone) ? cur.zone : 0;

  // 1) 安全优先:刚进 Z5 无条件提醒降速
  if (cz >= 5 && pz < 5) return '心率到 Z5 了,先把配速降下来,用深呼吸慢慢调整。';

  // 2) 整公里里程碑
  const pd = prev && Number.isFinite(prev.distanceM) ? prev.distanceM : 0;
  const cd = Number.isFinite(cur.distanceM) ? cur.distanceM : 0;
  if (cd >= 1000 && Math.floor(cd / 1000) > Math.floor(pd / 1000)) {
    const km = Math.floor(cd / 1000);
    const p = Number.isFinite(cur.paceSecPerKm) && cur.paceSecPerKm > 0 ? formatPace(cur.paceSecPerKm) : '--:--';
    return p !== '--:--'
      ? `第 ${km} 公里,配速 ${p}/km,节奏不错,继续。`
      : `跑了 ${km} 公里了,继续加油。`;
  }

  // 3) 每 5 分钟
  const pm = prev && Number.isFinite(prev.elapsedMs) ? Math.floor(prev.elapsedMs / 300000) : 0;
  const cm = Number.isFinite(cur.elapsedMs) ? Math.floor(cur.elapsedMs / 300000) : 0;
  if (cm >= 1 && cm > pm) {
    const cad = Number.isFinite(cur.cadenceSpm) && cur.cadenceSpm > 0 ? `,步频 ${Math.round(cur.cadenceSpm)}` : '';
    return `已经跑了 ${cm * 5} 分钟${cad},保持呼吸节奏。`;
  }

  // 4) 刚进 Z4:提醒别再猛加
  if (cz === 4 && pz < 4) return '心率上到 Z4 了,注意呼吸,别再猛加速。';

  return null;
}

/** 粗分用户问题意图，仅用于兜底回答选择模板。 */
export function classifyIntent(question) {
  const t = String(question || '');
  if (/配速|速度|快|慢|提速|降速/.test(t)) return 'pace';
  if (/心率|心跳|bpm|区间|zone/i.test(t)) return 'hr';
  if (/距离|多远|公里|千米|km/i.test(t)) return 'distance';
  if (/多久|时间|多长|跑了多少时间|还要跑/.test(t)) return 'time';
  return 'general';
}

/**
 * 确定性兜底教练回答：LLM 不可用/超时时调用。
 * 安全优先——zone>=5 无条件提醒降速，覆盖任何问题意图。
 */
export function fallbackCoachReply(s, question) {
  const snap = s && typeof s === 'object' ? s : {};
  const zone = Number.isFinite(snap.zone) ? snap.zone : 0;

  if (zone >= 5) {
    return '心率到 Z5 了，先把配速降下来，用深呼吸慢慢调整。';
  }

  switch (classifyIntent(question)) {
    case 'pace': {
      const p = Number.isFinite(snap.paceSecPerKm) && snap.paceSecPerKm > 0
        ? formatPace(snap.paceSecPerKm) : '--:--';
      if (p !== '--:--') {
        return `当前配速 ${p}/km，${zone >= 4 ? '稍微收一点' : '节奏不错，保持住'}。`;
      }
      return '还没测到稳定配速，先匀速跑两分钟看看。';
    }
    case 'hr':
      if (Number.isFinite(snap.bpm) && snap.bpm > 0) {
        return `心率 ${Math.round(snap.bpm)}${zone > 0 ? `，在 Z${zone}` : ''}，${zone >= 4 ? '偏高注意点' : '很稳'}。`;
      }
      return '还没连到心率，戴好胸带或让手表广播心率。';
    case 'distance':
      if (Number.isFinite(snap.distanceM) && snap.distanceM > 0) {
        return `已经跑了 ${formatDistanceKm(snap.distanceM)} 公里，继续加油。`;
      }
      return '刚起步，距离还在累计。';
    case 'time':
      if (Number.isFinite(snap.elapsedMs) && snap.elapsedMs > 0) {
        return `已经跑了 ${formatElapsed(snap.elapsedMs)}，按自己的节奏来。`;
      }
      return '刚开始，慢慢进入状态。';
    default:
      if (zone >= 4) return '心率有点高，稍微放慢，注意呼吸。';
      if (zone > 0 && zone <= 2) return '状态很轻松，想提速可以再稳一点加。';
      return '保持节奏，注意呼吸和落地，你做得很好。';
  }
}
