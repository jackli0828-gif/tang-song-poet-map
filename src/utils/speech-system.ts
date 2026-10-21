/**
 * 系统 Web Speech API 朗读控制器（原 speech.ts 逻辑保留，供 Edge TTS 回退用）
 * --------------------------------------------------------------
 * 浏览器内置 speechSynthesis：免费、永远可用，但声音机械。
 * 被 speech.ts 分发器引用：Edge TTS 失败 / 用户选择「系统引擎」时回退到这里。
 */

type Listener = () => void;

const listeners = new Set<Listener>();

let synth: SpeechSynthesis | null = null;
let currentId: string | null = null;
let zhVoice: SpeechSynthesisVoice | null = null;

function ensureSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  if (synth) return synth;
  synth = window.speechSynthesis ?? null;
  if (!synth) return null;
  const pick = (): void => {
    const voices = synth?.getVoices() ?? [];
    zhVoice =
      voices.find((v) => /^zh[-_]?CN/i.test(v.lang)) ||
      voices.find((v) => /^zh/i.test(v.lang)) ||
      null;
  };
  pick();
  synth.onvoiceschanged = pick;
  return synth;
}

export function speechSupported(): boolean {
  return ensureSynth() !== null;
}

/* ---------- keep-alive（Chromium 15 秒卡顿缺陷的变通） ---------- */
let keepAliveTimer: number | null = null;
const KEEPALIVE_MS = 9000;

function stopKeepAlive(): void {
  if (keepAliveTimer !== null) {
    window.clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

function startKeepAlive(): void {
  stopKeepAlive();
  if (typeof window === 'undefined') return;
  keepAliveTimer = window.setInterval(() => {
    const s = ensureSynth();
    if (!s || !s.speaking) {
      stopKeepAlive();
      return;
    }
    if (!s.paused) {
      s.pause();
      s.resume();
    }
  }, KEEPALIVE_MS);
}

export interface SystemSpeakOpts {
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
  /** 逐句高亮：系统引擎的 boundary 事件（部分浏览器支持） */
  onBoundary?: (e: SpeechSynthesisEvent) => void;
}

export function speak(text: string, id?: string, opts?: SystemSpeakOpts): void {
  const s = ensureSynth();
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  if (zhVoice) u.voice = zhVoice;
  u.rate = opts?.rate ?? 0.95;
  u.pitch = opts?.pitch ?? 1;
  u.onstart = () => {
    opts?.onStart?.();
  };
  u.onboundary = (e) => {
    opts?.onBoundary?.(e);
  };
  u.onend = () => {
    if (currentId === id) {
      currentId = null;
      notify();
    }
    opts?.onEnd?.();
    stopKeepAlive();
  };
  u.onerror = () => {
    if (currentId === id) {
      currentId = null;
      notify();
    }
    opts?.onEnd?.();
    stopKeepAlive();
  };
  currentId = id ?? null;
  s.speak(u);
  startKeepAlive();
  notify();
}

export function cancelSpeech(): void {
  const s = ensureSynth();
  s?.cancel();
  stopKeepAlive();
  currentId = null;
  notify();
}

export function speakingId(): string | null {
  return currentId;
}

function notify(): void {
  listeners.forEach((l) => l());
}

export function subscribeSpeech(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
