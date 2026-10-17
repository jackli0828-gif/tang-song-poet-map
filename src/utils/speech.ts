/**
 * 中文朗读控制器（Web Speech API）
 * --------------------------------------------------------------
 * 全局只有一个 speechSynthesis 实例，用单例模式避免多个组件各自创建
 * utterance 导致互相打断；通过轻量订阅让各组件感知「当前正在朗读的 id」，
 * 从而刷新按钮的「朗读中」状态。
 *
 * 设计要点：
 * - speak(text, id?) 会先 cancel 上一段，再朗读新文本，保证同一时刻只有一处发声；
 * - id 用于在多个朗读入口（生平小传 / 单篇作品）之间区分「谁在朗读」；
 * - 优先挑选 zh-CN / zh 语音，保证中文朗读而不是默认英文嗓。
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

/* ============================================================
 * 长文本保活（keep-alive）
 * ------------------------------------------------------------
 * Chromium 内核有一个长期存在的缺陷：连续朗读超过约 15 秒后，
 * speechSynthesis 会被浏览器自行暂停且不再恢复，表现为「读到一半卡住」。
 * 生平小传（几十字）与长篇作品全文都会超过这个时长。
 * 变通办法：朗读期间定期执行 pause() → resume()，重置内部计时器。
 * 仅在「确实正在朗读且未被暂停」时执行，避免与用户行为冲突。
 * ============================================================ */
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
    // 已经读完或被取消：收拢定时器，避免空转
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

export function speak(text: string, id?: string, opts?: { rate?: number; pitch?: number }): void {
  const s = ensureSynth();
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  if (zhVoice) u.voice = zhVoice;
  u.rate = opts?.rate ?? 0.95;
  u.pitch = opts?.pitch ?? 1;
  u.onend = () => {
    if (currentId === id) {
      currentId = null;
      notify();
    }
    stopKeepAlive();
  };
  u.onerror = () => {
    if (currentId === id) {
      currentId = null;
      notify();
    }
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
