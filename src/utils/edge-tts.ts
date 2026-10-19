/**
 * Edge TTS · 浏览器直连客户端
 * --------------------------------------------------------------
 * 纯前端、免费、无需 API Key，使用微软 Edge 内置 TTS 的 WebSocket 端点
 * （wss://speech.platform.bing.com/...）。响应是 24kHz 16-bit 小端 PCM WAV，
 * 直接包一层 Blob 就能播。
 *
 * 流程：
 *   1. 随机 41 位 token → SHA256 → 4 字符大写（Sec-MS-GEC 头）
 *   2. 建 WebSocket，发 2 帧 text：
 *        - 第 1 帧：SSML 语音配置（X-Id:config）
 *        - 第 2 帧：要朗读的文本（X-Id:<uuid>，X-Request:cmd.text）
 *   3. 服务端回 3 帧：
 *        - 0x012/0x013 二进制头（合成中/完成）
 *        - 0x011 二进制（WAV 音频数据）← 我们要的就是这个
 *        - 0x014 结束
 *   4. 把 0x011 音频拼成 Blob → URL → <audio> 播放。
 *
 * 取消：close WebSocket + audio.pause()。
 * 失败回退：调用方（speech.ts）捕获异常后切回 system speechSynthesis。
 */

import { generateGecToken, hashGec } from './edge-tts-gec';

/* ---------- 中文音色清单 ---------- */

export interface EdgeVoice {
  id: string;      // 微软 voice 名，如 'zh-CN-YunxiNeural'
  label: string;   // 展示名
  gender: 'male' | 'female' | 'neutral';
}

export const EDGE_VOICES: EdgeVoice[] = [
  { id: 'zh-CN-YunxiNeural',   label: '云希（男·青年）', gender: 'male' },
  { id: 'zh-CN-XiaoxiaoNeural',label: '晓晓（女·温暖）', gender: 'female' },
  { id: 'zh-CN-YunyangNeural', label: '云扬（男·浑厚）', gender: 'male' },
  { id: 'zh-CN-YunhaoNeural',  label: '云皓（男·磁性）', gender: 'male' },
  { id: 'zh-CN-YunfengNeural', label: '云枫（男·沉稳）', gender: 'male' },
];

export const DEFAULT_EDGE_VOICE = EDGE_VOICES[0].id;

/* ---------- 帧编解码 ---------- */

function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

/** 一帧二进制文本/二进制消息：2 字节类型(0x012/0x013/0x011/0x014) + 2 字节长度 + 载荷 */
function readFrameHeader(buf: ArrayBuffer, offset = 0): { type: number; len: number; payloadOffset: number } {
  const dv = new DataView(buf);
  const type = dv.getUint16(offset, false);
  const len  = dv.getUint16(offset + 2, false);
  return { type, len, payloadOffset: offset + 4 };
}

/** Edge TTS 音频是裸 PCM 流（24kHz/16bit/mono），封装成 WAV 让 <audio> 能播 */
function pcmToWavBlob(pcm: ArrayBuffer, sampleRate: number, channels: number, bitDepth: number): Blob {
  const dataLen = pcm.byteLength;
  const header = new DataView(new ArrayBuffer(44));
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) header.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  header.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);                  // PCM
  header.setUint16(22, channels, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * channels * bitDepth / 8, true);
  header.setUint16(32, channels * bitDepth / 8, true);
  header.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  header.setUint32(40, dataLen, true);
  const full = new Uint8Array(44 + dataLen);
  full.set(new Uint8Array(header.buffer), 0);
  full.set(new Uint8Array(pcm), 44);
  return new Blob([full], { type: 'audio/wav' });
}

/** 把多段 0x011 音频块（含 0x12 元数据头）依次剥壳拼接成 PCM 裸流 */
function concatAudioPayloads(frames: ArrayBuffer[]): ArrayBuffer {
  // 每个 0x011 帧的 payload 可能以 0x00（元数据块）开头，也可能直接是 0x01 数据块。
  // 这里保守处理：把每个 payload 当作「可能含一个元数据头」，按 0x01/0x00 子块解析，
  // 取 0x01 子块的数据部分（1 字节标记 + 4 字节时间戳 + 数据）拼接。
  const chunks: Uint8Array[] = [];
  for (const f of frames) {
    const dv = new DataView(f);
    const bytes = new Uint8Array(f);
    let off = 0;
    while (off + 5 <= f.byteLength) {
      const blockType = bytes[off];
      const blockLen = dv.getUint16(off + 1, false);
      if (blockType === 0x01) {
        // 1 字节标记 + 4 字节时间戳 + 数据
        const dataStart = off + 5;
        const dataEnd = Math.min(off + 1 + blockLen + 4, f.byteLength);
        if (dataEnd > dataStart) chunks.push(bytes.subarray(dataStart, dataEnd));
        off = dataEnd;
      } else {
        // 0x00 元数据块，跳过
        off += 1 + blockLen + 4;
      }
    }
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}

/* ---------- 客户端 ---------- */

export interface EdgeSpeakOpts {
  voice?: string;
  rate?: number;   // 0.1 ~ 2.0，1 为正常
  pitch?: string;  // 如 '+0Hz'、'+5Hz'
  onDone?: () => void;
  onError?: (e: unknown) => void;
}

export interface EdgeHandle {
  cancel: () => void;
  /** 等待朗读真正开始（拿到首帧音频前一直 pending），用于判断是否回退 */
  started: Promise<void>;
}

/**
 * 用 Edge TTS 朗读一段文本。
 * - 默认 24kHz/16bit/mono WAV
 * - 成功调用 onDone；网络/协议异常调用 onError
 * - 返回 handle，cancel() 立即停止
 */
export async function edgeSpeak(text: string, opts: EdgeSpeakOpts = {}): Promise<EdgeHandle> {
  const voice = opts.voice || DEFAULT_EDGE_VOICE;
  const rate = opts.rate ?? 1;
  const pitch = opts.pitch ?? '+0Hz';

  const token = generateGecToken();
  const gec = await hashGec(token);
  const reqId = uuid();

  const audioBufs: ArrayBuffer[] = [];
  let audio: HTMLAudioElement | null = null;
  let url: string | null = null;
  let ws: WebSocket | null = null;
  let cancelled = false;
  let startedRes: () => void;
  let startedRej: (e: unknown) => void;
  const started = new Promise<void>((res, rej) => { startedRes = res; startedRej = rej; });

  const ssml =
    `<speak version="1.0" xml:lang="zh-CN">` +
    `<voice name="${voice}">` +
    `<prosody rate="${rate}" pitch="${pitch}">${escapeXml(text)}</prosody>` +
    `</voice></speak>`;

  const configJson = JSON.stringify({
    context: {
      synthesis: {
        config: {
          audio: {
            metadata: true,
            bitrate: 192000,
            codec: 'audio-24khz-16k-16kmono',
            sampleRate: 24000,
            textType: 'ssml',
            wordBoundaryMetadata: true,
          },
          authorizationToken: '',
          input: { context: { _instanceId: reqId }, instanceId: reqId },
          output: { context: { _instanceId: reqId }, instanceId: reqId },
        },
      },
    },
  });

  const headers =
    `X-Id:config\r\nX-Client-Seq:0\r\nContent-Type:application/json;charcoding=utf-8\r\n` +
    `Authorization:Bearer\r\nSec-MS-GEC:${gec}\r\nSec-MS-GEC-Version:1-0.6\r\n\r\n` +
    configJson + `\r\nX-Request:cmd.text\r\nX-Id:${reqId}\r\nX-Client-Seq:1\r\n\r\n${ssml}`;

  const wsUrl =
    'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge?' +
    `truncated=true&configurations=2&requestid=${reqId}`;

  ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    ws?.send(headers);
  };
  ws.onmessage = (ev) => {
    if (cancelled) return;
    if (typeof ev.data === 'string') {
      // 协议层文本帧（错误等）
      if (/error|Error/i.test(ev.data)) {
        failed(new Error('Edge TTS 错误: ' + ev.data));
        return;
      }
      return;
    }
    const buf: ArrayBuffer = ev.data;
    // 可能一帧里夹多个 0x012/0x011/0x013/0x014，循环解析
    let off = 0;
    while (off + 4 <= buf.byteLength) {
      const { type, len, payloadOffset } = readFrameHeader(buf, off);
      off = payloadOffset;
      if (type === 0x011) {
        const chunk = buf.slice(off, off + len);
        audioBufs.push(chunk);
        // 首块：开始播放；后续块：换源续播（WAV 头随 PCM 总量重算）
        const blob = pcmToWavBlob(concatAudioPayloads(audioBufs), 24000, 1, 16);
        const newUrl = URL.createObjectURL(blob);
        if (!url) {
          url = newUrl;
          audio = new Audio(url);
          audio.onended = () => done();
          audio.onerror = () => failed(new Error('Edge TTS 音频解码失败'));
          audio.play().catch((e) => failed(e));
        } else if (audio) {
          URL.revokeObjectURL(url);
          url = newUrl;
          audio.src = newUrl;
          audio.onended = () => done();
          audio.onerror = () => failed(new Error('Edge TTS 音频解码失败'));
          audio.play().catch(() => {});
        }
        startedRes?.();
      }
      off += len;
    }
  };
  ws.onclose = () => {
    if (cancelled) return;
    if (audioBufs.length === 0) failed(new Error('Edge TTS 连接提前关闭'));
    else done();
  };
  ws.onerror = () => {
    if (cancelled) return;
    failed(new Error('Edge TTS 连接失败（网络/跨域）'));
  };

  // 15s 超时
  const timeout = window.setTimeout(() => {
    if (!audioBufs.length) failed(new Error('Edge TTS 超时'));
  }, 15000);

  function done() {
    if (cancelled) return;
    cancelled = true;
    clearTimeout(timeout);
    ws?.close();
    ws = null;
    if (url) URL.revokeObjectURL(url);
    audio?.removeAttribute('src');
    audio = null;
    opts.onDone?.();
  }

  function failed(err: unknown) {
    if (cancelled) return;
    cancelled = true;
    clearTimeout(timeout);
    ws?.close();
    ws = null;
    if (url) URL.revokeObjectURL(url);
    audio?.pause();
    audio = null;
    startedRej?.(err);
    opts.onError?.(err);
  }

  return {
    cancel() {
      cancelled = true;
      clearTimeout(timeout);
      ws?.close();
      ws = null;
      if (url) URL.revokeObjectURL(url);
      audio?.pause();
      audio = null;
    },
    started,
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function edgeTtsSupported(): boolean {
  return typeof WebSocket !== 'undefined' && typeof crypto !== 'undefined' && !!(window as any).crypto?.subtle;
}
