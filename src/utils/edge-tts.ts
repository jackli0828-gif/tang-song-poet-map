/**
 * Edge TTS · 浏览器直连客户端
 * --------------------------------------------------------------
 * 纯前端、免费、无需 API Key，使用微软 Edge 内置 TTS 的 WebSocket 端点
 * （wss://speech.platform.bing.com/...）。响应是 MP3 音频流，直接拼成
 * 一个 Blob 交给 <audio> 播放即可。
 *
 * 协议对齐当前 rany2/edge-tts（及 gitMFQ/ttss 移植版）：
 *   1. 建连 URL 携带鉴权查询参数：
 *        ?TrustedClientToken=...&Sec-MS-GEC=<v2 token>&Sec-MS-GEC-Version=2-143.0.3650.75&ConnectionId=...
 *      —— 注意：v2 令牌必须放进 URL，且版本号必须是 2-xxx；
 *         微软自 2026-10-19 起拒绝 v1（旧版随机 token + 4 字符头），
 *         用 v1 会在握手阶段返回 HTTP 403，整个拟人音引擎与换音都会失败。
 *   2. 连上后先发 speech.config，再发 ssml（均带 Path: 头）。
 *   3. 服务端以「二进制帧」回音频：uint16 BE 头长度 + 头文本 + MP3 载荷；
 *      文本帧则带 Path:turn.start / audio.metadata / turn.end。
 *   4. 收集所有音频载荷拼成完整 MP3 → Blob → <audio> 播放。
 *
 * 失败回退：调用方（speech.ts）捕获异常后切回 system speechSynthesis。
 */

import { generateGecToken, GEC_VERSION } from './edge-tts-gec';
import { TRUSTED_CLIENT_TOKEN } from './edge-tts-gec-constants';

/* ---------- 中文音色清单 ---------- */

export interface EdgeVoice {
  id: string; // 微软 voice 名，如 'zh-CN-YunxiNeural'
  label: string; // 展示名
  gender: 'male' | 'female' | 'neutral';
}

export const EDGE_VOICES: EdgeVoice[] = [
  { id: 'zh-CN-YunxiNeural', label: '云希（男·青年）', gender: 'male' },
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女·温暖）', gender: 'female' },
  { id: 'zh-CN-YunyangNeural', label: '云扬（男·浑厚）', gender: 'male' },
  { id: 'zh-CN-YunhaoNeural', label: '云皓（男·磁性）', gender: 'male' },
  { id: 'zh-CN-YunfengNeural', label: '云枫（男·沉稳）', gender: 'male' },
];

export const DEFAULT_EDGE_VOICE = EDGE_VOICES[0].id;

/** edge-tts 的 MP3 输出格式（24kHz 单声道） */
const AUDIO_FORMAT = 'audio-24khz-16k-16kmono';

/* ---------- 工具 ---------- */

/** 32 位十六进制连接 id */
function uuid32(): string {
  const charset = 'abcdef0123456789';
  let s = '';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 32; i++) s += charset[bytes[i % 16] & 0x0f];
  return s;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* ---------- 客户端 ---------- */

export interface EdgeSpeakOpts {
  voice?: string;
  rate?: number; // 0.1 ~ 2.0，1 为正常
  pitch?: string; // 如 '+0Hz'、'+5Hz'
  onDone?: () => void;
  onError?: (e: unknown) => void;
}

export interface EdgeHandle {
  cancel: () => void;
  /** 等待朗读真正开始（拿到音频并播放前一直 pending），用于判断是否回退 */
  started: Promise<void>;
}

/**
 * 用 Edge TTS 朗读一段文本。
 * - 默认 MP3（24kHz/单声道）
 * - 成功调用 onDone；网络/协议异常调用 onError
 * - 返回 handle，cancel() 立即停止
 */
export async function edgeSpeak(text: string, opts: EdgeSpeakOpts = {}): Promise<EdgeHandle> {
  const voice = opts.voice || DEFAULT_EDGE_VOICE;
  const rate = opts.rate ?? 1;
  const pitch = opts.pitch ?? '+0Hz';

  const connectionId = uuid32();
  const secMsGec = generateGecToken(); // 同步生成 v2 令牌
  const wsUrl =
    'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?' +
    `TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}` +
    `&Sec-MS-GEC-Version=${GEC_VERSION}&ConnectionId=${connectionId}`;

  const reqId = uuid32();
  const ssml =
    `<speak version="1.0" xml:lang="zh-CN">` +
    `<voice name="${voice}">` +
    `<prosody rate="${rate}" pitch="${pitch}">${escapeXml(text)}</prosody>` +
    `</voice></speak>`;

  const audioChunks: Uint8Array[] = [];
  let totalLen = 0;
  let ws: WebSocket | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let url: string | null = null;
  let cancelled = false;
  let settled = false;
  let startedRes: () => void;
  let startedRej: (e: unknown) => void;
  const started = new Promise<void>((res, rej) => {
    startedRes = res;
    startedRej = rej;
  });

  const configMsg =
    `X-Timestamp:${new Date().toISOString()}\r\n` +
    'Content-Type:application/json; charset=utf-8\r\n' +
    'Path:speech.config\r\n\r\n' +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: 'false',
              wordBoundaryEnabled: 'false',
            },
            outputFormat: AUDIO_FORMAT,
          },
        },
      },
    });

  const ssmlMsg =
    `X-Timestamp:${new Date().toISOString()}\r\n` +
    `X-RequestId:${reqId}\r\n` +
    'Content-Type:application/ssml+xml\r\n' +
    'Path:ssml\r\n\r\n' +
    ssml;

  function cleanup() {
    clearTimeout(timeout);
    if (url) URL.revokeObjectURL(url);
    audioEl?.pause();
    audioEl = null;
    if (ws) {
      try {
        ws.onmessage = null;
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      } catch {
        /* ignore */
      }
    }
    ws = null;
  }

  function done() {
    if (cancelled || settled) return;
    settled = true;
    cleanup();
    opts.onDone?.();
  }

  function fail(err: unknown) {
    if (cancelled || settled) return;
    settled = true;
    cleanup();
    startedRej?.(err);
    opts.onError?.(err);
  }

  function finalize() {
    if (cancelled || settled) return;
    if (audioChunks.length === 0) {
      fail(new Error('Edge TTS 未收到音频数据'));
      return;
    }
    const full = new Uint8Array(totalLen);
    let o = 0;
    for (const c of audioChunks) {
      full.set(c, o);
      o += c.length;
    }
    const blob = new Blob([full], { type: 'audio/mpeg' });
    url = URL.createObjectURL(blob);
    audioEl = new Audio(url);
    audioEl.onended = () => done();
    audioEl.onerror = () => fail(new Error('Edge TTS 音频解码失败'));
    audioEl.onplaying = () => startedRes?.();
    audioEl.play().catch((e) => fail(e));
  }

  ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    try {
      ws?.send(configMsg);
      ws?.send(ssmlMsg);
    } catch (e) {
      fail(e);
    }
  };

  ws.onmessage = (ev) => {
    if (cancelled || settled) return;
    if (typeof ev.data === 'string') {
      // 文本帧：含 Path: 头
      const m = /Path:\s*([^\r\n]+)/i.exec(ev.data);
      const path = m ? m[1].trim() : '';
      if (path === 'turn.end') finalize();
      return;
    }
    // 二进制帧：uint16 BE 头长度 + 头文本 + 音频载荷
    const buf = new Uint8Array(ev.data as ArrayBuffer);
    if (buf.length < 2) return;
    const headerLength = (buf[0] << 8) | buf[1];
    if (headerLength <= 0 || buf.length < 2 + headerLength) return;
    const headerText = new TextDecoder().decode(buf.subarray(2, 2 + headerLength));
    if (!/Path:\s*audio/i.test(headerText)) return;
    const payload = buf.subarray(2 + headerLength);
    if (payload.length > 0) {
      audioChunks.push(payload);
      totalLen += payload.length;
    }
  };

  ws.onclose = () => {
    if (cancelled || settled) return;
    // 正常流程在收到 turn.end 时已 finalize；若服务端未发 turn.end 而直接关连接，
    // 但已收到音频，则照常播放；否则判失败
    if (audioChunks.length > 0) finalize();
    else fail(new Error('Edge TTS 连接提前关闭'));
  };

  ws.onerror = () => {
    if (cancelled || settled) return;
    fail(new Error('Edge TTS 连接失败（网络/跨域）'));
  };

  // 15s 超时
  const timeout = window.setTimeout(() => {
    if (!audioChunks.length) fail(new Error('Edge TTS 超时'));
  }, 15000);

  return {
    cancel() {
      cancelled = true;
      settled = true;
      cleanup();
    },
    started,
  };
}

export function edgeTtsSupported(): boolean {
  return typeof WebSocket !== 'undefined';
}
