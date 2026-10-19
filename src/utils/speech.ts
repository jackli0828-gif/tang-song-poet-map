/**
 * 朗读分发器
 * --------------------------------------------------------------
 * 默认走 Edge TTS（拟人化、免费、浏览器直连），失败自动回退到系统
 * speechSynthesis（机械音但永远可用）。
 *
 * 对外接口保持与旧版一致：
 *   speak(text, id?)            —— 按当前引擎朗读
 *   cancelSpeech()             —— 停止当前朗读
 *   speakingId()               —— 当前正在朗读的 id
 *   subscribeSpeech(cb)        —— 订阅状态变化
 *
 * 新增接口：
 *   getTTSEngine / setTTSEngine —— 切换 'edge' | 'system'
 *   getTTSVoice / setTTSVoice   —— 切换 Edge 音色
 *
 * 引擎与音色偏好持久化到 localStorage（'poetmap-tts-engine' / 'poetmap-tts-voice'）。
 */

import {
  cancelSpeech as cancelSystem,
  speak as speakSystem,
  speakingId as systemSpeakingId,
  subscribeSpeech as subscribeSystem,
} from './speech-system';
import {
  edgeSpeak,
  edgeTtsSupported,
  EDGE_VOICES,
  DEFAULT_EDGE_VOICE,
  type EdgeHandle,
  type EdgeVoice,
} from './edge-tts';

const LS_ENGINE = 'poetmap-tts-engine';
const LS_VOICE = 'poetmap-tts-voice';

export type TTSEngine = 'edge' | 'system';

let engine: TTSEngine = loadEngine();
let edgeVoice: string = loadVoice();
let activeEdge: EdgeHandle | null = null;
let currentId: string | null = null;

const listeners = new Set<() => void>();
function notify() { listeners.forEach((l) => l()); }

function loadEngine(): TTSEngine {
  try {
    const v = localStorage.getItem(LS_ENGINE);
    if (v === 'edge' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'edge';
}

function loadVoice(): string {
  try {
    const v = localStorage.getItem(LS_VOICE);
    if (v && EDGE_VOICES.some((x) => x.id === v)) return v;
  } catch { /* ignore */ }
  return DEFAULT_EDGE_VOICE;
}

/* ---------- 引擎 / 音色 读写 ---------- */

export function getTTSEngine(): TTSEngine { return engine; }
export function getTTSVoice(): string { return edgeVoice; }

export function setTTSEngine(next: TTSEngine): void {
  if (next === engine) return;
  cancelSpeech();
  engine = next;
  try { localStorage.setItem(LS_ENGINE, next); } catch { /* ignore */ }
  notify();
}

export function setTTSVoice(id: string): void {
  if (!EDGE_VOICES.some((v) => v.id === id)) return;
  cancelSpeech();
  edgeVoice = id;
  try { localStorage.setItem(LS_VOICE, id); } catch { /* ignore */ }
  notify();
}

export function cycleTTSVoice(): string {
  const idx = EDGE_VOICES.findIndex((v) => v.id === edgeVoice);
  const next = EDGE_VOICES[(idx + 1) % EDGE_VOICES.length].id;
  setTTSVoice(next);
  return next;
}

export function ttsEngineSupported(): boolean {
  return edgeTtsSupported();
}

/* ---------- 朗读 ---------- */

export function speak(text: string, id?: string, opts?: { rate?: number }): void {
  if (engine === 'edge' && edgeTtsSupported()) {
    // 先取消旧的
    if (activeEdge) {
      activeEdge.cancel();
      activeEdge = null;
    }
    // 取消 system（避免两者同时响）
    cancelSystem();

    currentId = id ?? null;
    notify();

    edgeSpeak(text, {
      voice: edgeVoice,
      rate: opts?.rate ?? 0.95,
      onDone: () => {
        activeEdge = null;
        currentId = null;
        notify();
      },
      onError: (e) => {
        // 回退到 system
        console.warn('[TTS] Edge TTS 失败，回退系统引擎:', e);
        activeEdge = null;
        speakSystem(text, id, { rate: opts?.rate ?? 0.95 });
      },
    }).then((handle) => {
      activeEdge = handle;
    }).catch((e) => {
      console.warn('[TTS] edgeSpeak 启动失败:', e);
      activeEdge = null;
      speakSystem(text, id, { rate: opts?.rate ?? 0.95 });
    });
    return;
  }

  // system 引擎（或 edge 不可用）
  cancelSystem();
  currentId = id ?? null;
  speakSystem(text, id, opts);
  notify();
}

export function cancelSpeech(): void {
  if (activeEdge) {
    activeEdge.cancel();
    activeEdge = null;
  }
  cancelSystem();
  currentId = null;
  notify();
}

export function speakingId(): string | null {
  if (currentId !== null) return currentId;
  // 兼容 system 引擎的状态
  return systemSpeakingId();
}

export function subscribeSpeech(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/* ---------- 音色展示名 ---------- */

export function voiceLabel(id: string): string {
  const v: EdgeVoice | undefined = EDGE_VOICES.find((x) => x.id === id);
  return v ? v.label : id;
}

export const TTS_VOICES = EDGE_VOICES;
