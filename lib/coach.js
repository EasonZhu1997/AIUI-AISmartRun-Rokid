// AI 跑步教练领域逻辑 —— 纯函数，无 AIUI/wx/DOM 依赖，可单测。
//   buildCoachSystemPrompt: 把实时跑步数据注入 LLM system prompt（这是本产品
//     相对 Runsight/HuBu 纯数据显示器的差异化：教练"看得见"你的当前状态）。
//   fallbackCoachReply: LLM/网络不可用时的确定性兜底回答（镜像 FunpizzaSmartRun
//     chat_fallback 思路——跑步中绝不把用户晾在"出错了"上，规则化也要给一句有用的话）。
// snapshot 形状对齐 RunSession.snapshot() + HUD 已算好的 zone/paceSecPerKm。

import { formatElapsed, formatPace, formatDistanceKm } from './format.js';

// 眼镜上的话必须极短:用户在跑步,没时间听长句。回复≤15个汉字硬约束。
const PERSONA =
  '你是 SmartRun 的 AI 跑步教练，正通过 AI 眼镜陪用户跑步。' +
  '回答必须是一句话、不超过15个汉字、口语化、可直接朗读，不用列表和表情。' +
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

  // 1) 安全优先:刚进 Z5 无条件提醒降速(≤15字)
  if (cz >= 5 && pz < 5) return '心率 Z5 了，降速深呼吸。';

  // 2) 整公里里程碑
  const pd = prev && Number.isFinite(prev.distanceM) ? prev.distanceM : 0;
  const cd = Number.isFinite(cur.distanceM) ? cur.distanceM : 0;
  if (cd >= 1000 && Math.floor(cd / 1000) > Math.floor(pd / 1000)) {
    const km = Math.floor(cd / 1000);
    const p = Number.isFinite(cur.paceSecPerKm) && cur.paceSecPerKm > 0 ? formatPace(cur.paceSecPerKm) : '--:--';
    return p !== '--:--'
      ? `第 ${km} 公里，配速 ${p}。`
      : `${km} 公里了，继续。`;
  }

  // 3) 每 5 分钟
  const pm = prev && Number.isFinite(prev.elapsedMs) ? Math.floor(prev.elapsedMs / 300000) : 0;
  const cm = Number.isFinite(cur.elapsedMs) ? Math.floor(cur.elapsedMs / 300000) : 0;
  if (cm >= 1 && cm > pm) {
    const cad = Number.isFinite(cur.cadenceSpm) && cur.cadenceSpm > 0 ? `，步频 ${Math.round(cur.cadenceSpm)}` : '';
    return `跑了 ${cm * 5} 分钟${cad}。`;
  }

  // 4) 刚进 Z4:提醒别再猛加
  if (cz === 4 && pz < 4) return '到 Z4 了，别再加速。';

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
    return '心率 Z5 了，降速深呼吸。';
  }

  switch (classifyIntent(question)) {
    case 'pace': {
      const p = Number.isFinite(snap.paceSecPerKm) && snap.paceSecPerKm > 0
        ? formatPace(snap.paceSecPerKm) : '--:--';
      if (p !== '--:--') {
        return `配速 ${p}，${zone >= 4 ? '稍收一点' : '保持住'}。`;
      }
      return '先匀速跑两分钟再看。';
    }
    case 'hr':
      if (Number.isFinite(snap.bpm) && snap.bpm > 0) {
        return `心率 ${Math.round(snap.bpm)}${zone > 0 ? ` Z${zone}` : ''}，${zone >= 4 ? '偏高' : '很稳'}。`;
      }
      return '没心率，开手表广播。';
    case 'distance':
      if (Number.isFinite(snap.distanceM) && snap.distanceM > 0) {
        return `已跑 ${formatDistanceKm(snap.distanceM)} 公里，加油。`;
      }
      return '刚起步，慢慢来。';
    case 'time':
      if (Number.isFinite(snap.elapsedMs) && snap.elapsedMs > 0) {
        return `已跑 ${formatElapsed(snap.elapsedMs)}，稳住。`;
      }
      return '刚开始，进状态。';
    default:
      if (zone >= 4) return '心率偏高，放慢些。';
      if (zone > 0 && zone <= 2) return '很轻松，可稳提速。';
      return '节奏很好，保持。';
  }
}
