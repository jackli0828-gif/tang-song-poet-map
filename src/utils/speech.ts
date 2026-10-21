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

/* ---------- 逐句高亮：边界 / 起止事件 ---------- */

export type SpeechBoundaryEvent =
  | { id: string | null; type: 'start' }
  | { id: string | null; type: 'end' }
  | {
      id: string | null;
      type: 'boundary';
      kind: 'edge' | 'system';
      /** edge：WordBoundary / SentenceBoundary */
      bType?: 'WordBoundary' | 'SentenceBoundary';
      /** edge：该边界的原文（用于与展示文本对齐） */
      text?: string;
      offset100ns?: number;
      duration100ns?: number;
      /** system：boundary 事件名（'word' | 'sentence'） */
      name?: string;
      /** system：字符起止（UTF-16 单位，直接对应展示文本下标） */
      charStart?: number;
      charLen?: number;
    };

const boundaryListeners = new Set<(ev: SpeechBoundaryEvent) => void>();
function emitBoundary(ev: SpeechBoundaryEvent): void {
  boundaryListeners.forEach((l) => l(ev));
}

/** 订阅逐句高亮边界事件（按 id 过滤即可只关注当前作品） */
export function subscribeBoundaries(cb: (ev: SpeechBoundaryEvent) => void): () => void {
  boundaryListeners.add(cb);
  return () => { boundaryListeners.delete(cb); };
}

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
  const prevId = currentId;
  const emitStart = (): void => emitBoundary({ id: id ?? null, type: 'start' });
  const emitEnd = (): void => emitBoundary({ id: id ?? null, type: 'end' });

  if (engine === 'edge' && edgeTtsSupported()) {
    // 先取消旧的
    if (activeEdge) {
      activeEdge.cancel();
      activeEdge = null;
    }
    // 取消 system（避免两者同时响）
    cancelSystem();
    if (prevId && prevId !== id) emitBoundary({ id: prevId, type: 'end' });

    currentId = id ?? null;
    notify();

    edgeSpeak(text, {
      voice: edgeVoice,
      rate: opts?.rate ?? 0.95,
      onDone: () => {
        activeEdge = null;
        currentId = null;
        notify();
        emitEnd();
      },
      onError: (e) => {
        // 回退到 system
        console.warn('[TTS] Edge TTS 失败，回退系统引擎:', e);
        activeEdge = null;
        emitEnd();
        speakSystem(text, id, {
          rate: opts?.rate ?? 0.95,
          onStart: emitStart,
          onEnd: emitEnd,
          onBoundary: (ev) =>
            emitBoundary({
              id: id ?? null,
              type: 'boundary',
              kind: 'system',
              name: ev.name,
              charStart: ev.charIndex,
              charLen: ev.charLength,
            }),
        });
      },
      onBoundary: (b) => {
        emitBoundary({
          id: id ?? null,
          type: 'boundary',
          kind: 'edge',
          bType: b.type,
          text: b.text,
          offset100ns: b.offset100ns,
          duration100ns: b.duration100ns,
        });
      },
    })
      .then((handle) => {
        activeEdge = handle;
        handle.started
          .then(() => emitStart())
          .catch(() => {
            /* 启动失败已走 onError 回退 */
          });
      })
      .catch((e) => {
        console.warn('[TTS] edgeSpeak 启动失败:', e);
        activeEdge = null;
        speakSystem(text, id, {
          rate: opts?.rate ?? 0.95,
          onStart: emitStart,
          onEnd: emitEnd,
          onBoundary: (ev) =>
            emitBoundary({
              id: id ?? null,
              type: 'boundary',
              kind: 'system',
              name: ev.name,
              charStart: ev.charIndex,
              charLen: ev.charLength,
            }),
        });
      });
    return;
  }

  // system 引擎（或 edge 不可用）
  cancelSystem();
  if (prevId && prevId !== id) emitBoundary({ id: prevId, type: 'end' });
  currentId = id ?? null;
  speakSystem(text, id, {
    rate: opts?.rate ?? 0.95,
    onStart: emitStart,
    onEnd: emitEnd,
    onBoundary: (ev) =>
      emitBoundary({
        id: id ?? null,
        type: 'boundary',
        kind: 'system',
        name: ev.name,
        charStart: ev.charIndex,
        charLen: ev.charLength,
      }),
  });
  notify();
}

export function cancelSpeech(): void {
  const endedId = currentId;
  if (activeEdge) {
    activeEdge.cancel();
    activeEdge = null;
  }
  cancelSystem();
  currentId = null;
  notify();
  if (endedId) emitBoundary({ id: endedId, type: 'end' });
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
