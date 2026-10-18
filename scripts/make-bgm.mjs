/**
 * 生成站点背景音乐：public/bgm.mp3
 * --------------------------------------------------------------
 * 原创**轻快**古风配乐（古琴轻拨 + 竹笛短句 + 弱低音衬底），G 宫五声音阶。
 * 相比旧版（52 BPM 沉郁古韵）：速度提到 92 BPM、笛声担任主旋律、
 * 古琴改作短促伴奏点，整体明快跳跃，仍保持「琴声主导」的古韵底色。
 *
 * 为什么自己合成而不是下载现成音乐？
 * 1. 站点是纯离线静态站，且当前构建环境出口受限，无法从 Pixabay 等免费音乐站下载；
 * 2. 原创音乐没有授权限制 —— 比「免费可商用」素材更干净（素材站通常禁止
 *    把音乐以独立文件形式再分发，而 bgm.mp3 必然要随仓库公开托管）。
 *
 * 运行（仅生成阶段需要 lamejs，不进入项目运行时依赖）：
 *   npm i lamejs
 *   node scripts/make-bgm.mjs
 *
 * 输出：public/bgm.mp3（单声道 44.1kHz，96kbps，无缝循环）
 */

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// lamejs 的源码入口（src/js/index.js）依赖 MPEGMode / Lame / BitStream 三个全局变量，
// 在 Node 的模块作用域下会抛 ReferenceError。先补上全局量再取用。
globalThis.MPEGMode = require('lamejs/src/js/MPEGMode.js');
globalThis.Lame = require('lamejs/src/js/Lame.js');
globalThis.BitStream = require('lamejs/src/js/BitStream.js');
const lamejs = require('lamejs');
const Mp3Encoder = lamejs.Mp3Encoder ?? lamejs;

/* ============================ 基本参数 ============================ */
const SR = 44100; // 采样率
const BPM = 92; // 轻快的中速
const BEAT = 60 / BPM;
const BARS = 16;
const BEATS = BARS * 4; // 64 拍 ≈ 42 秒
const TAIL = 2.0; // 尾音余量（秒），用于环绕折叠实现无缝循环
const LOOP_N = Math.round(BEATS * BEAT * SR);
const TAIL_N = Math.round(TAIL * SR);
const N = LOOP_N + TAIL_N;

// G 宫五声音阶：宫(G) 商(A) 角(B) 徵(D) 羽(E)，跨三个八度
//  0:G4   1:A4   2:B4   3:D5   4:E5  |  5:G5   6:A5   7:B5   8:D6   9:E6 | 10:G6
const P = [392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0, 987.77, 1174.66, 1318.5, 1567.98];
// 低音区（古琴常用音域）：-1:G3 -2:A3 -3:B3 -4:D4 -5:E4
const LOW = [196.0, 220.0, 246.94, 293.66, 329.63];

// 固定种子的伪随机，保证每次生成结果完全一致（可复现）
let seed = 20261018;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

/** 音级取频率：正数取中高音区 P，负数取低音区 LOW */
const freqOf = (deg) => (deg >= 0 ? P[deg] : LOW[-deg - 1]);

const buf = new Float32Array(N);

/* ============================ 乐器音色 ============================ */

/** 古琴拨弦（轻快版）：快起快收，短促干净，带一点「挑」的亮色 */
function addPluck(t0, deg, dur, vel) {
  const start = Math.round(t0 * SR);
  const len = Math.min(Math.round(dur * SR), N - start);
  if (len <= 0) return;
  const f = freqOf(deg);
  const partials = [1, 2, 3, 4.18];
  const amps = [1, 0.35, 0.15, 0.06];
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 3.2) * (1 - Math.exp(-t * 400));
    let s = 0;
    for (let p = 0; p < partials.length; p++) {
      s += amps[p] * Math.sin(2 * Math.PI * f * partials[p] * t + 0.55 * p);
    }
    buf[start + i] += vel * 0.13 * env * s;
  }
}

/** 竹笛：正弦为主 + 二次谐波，短起短收，带轻揉音与气声 */
function addFlute(t0, deg, dur, vel) {
  const start = Math.round(t0 * SR);
  const len = Math.min(Math.round(dur * SR), N - start);
  if (len <= 0) return;
  const f = freqOf(deg);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const atk = 1 - Math.exp(-t * 22);
    const rel = 1 - Math.exp(-Math.max(0, dur - t) * 9);
    const env = Math.min(atk, rel);
    const vib = 1 + 0.005 * Math.sin(2 * Math.PI * 5.5 * t);
    const s =
      Math.sin(2 * Math.PI * f * vib * t) + 0.2 * Math.sin(2 * Math.PI * f * 2 * vib * t);
    const breath = (rnd() - 0.5) * 0.05 * env; // 吹奏气声
    buf[start + i] += vel * 0.16 * env * (s + breath);
  }
}

/** 低频衬底：极弱的长音持续音，垫住整体空间感 */
function addDrone(freq, amp) {
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const lfo = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.055 * t);
    buf[i] += amp * lfo * (Math.sin(2 * Math.PI * freq * t) + 0.28 * Math.sin(2 * Math.PI * freq * 2 * t));
  }
}

/* ============================ 混响（Freeverb 简化版） ============================ */
function reverb(input, wet = 0.3) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({
    b: new Float32Array(d),
    i: 0,
    fb: 0.79,
  }));
  const allp = [225, 556, 441].map((d) => ({ b: new Float32Array(d), i: 0 }));
  const out = new Float32Array(input.length);
  for (let k = 0; k < input.length; k++) {
    let c = 0;
    for (const cb of combs) {
      const v = cb.b[cb.i];
      cb.b[cb.i] = input[k] + v * cb.fb;
      cb.i = (cb.i + 1) % cb.b.length;
      c += v;
    }
    c /= combs.length;
    for (const ap of allp) {
      const v = ap.b[ap.i];
      const y = -0.7 * c + v;
      ap.b[ap.i] = c + 0.7 * y;
      ap.i = (ap.i + 1) % ap.b.length;
      c = y;
    }
    out[k] = input[k] * (1 - wet) + c * wet;
  }
  return out;
}

/* ============================ 编曲 ============================ */

// 竹笛的主题句（4 小节 = 16 拍）：短句为主，跳跃、上行，明亮
const PHRASE = [
  [0.0, 5, 0.5],
  [0.5, 7, 0.5],
  [1.0, 9, 0.5],
  [1.5, 8, 1.0],
  [2.0, 6, 0.5],
  [2.5, 7, 0.5],
  [3.0, 5, 1.0],
  [4.0, 3, 0.5],
  [4.5, 5, 0.5],
  [5.0, 7, 0.5],
  [5.5, 6, 1.0],
  [6.0, 5, 0.5],
  [6.5, 4, 0.5],
  [7.0, 3, 1.5],
  [8.0, 7, 0.5],
  [8.5, 9, 0.5],
  [9.0, 10, 0.5],
  [9.5, 9, 0.5],
  [10.0, 8, 1.0],
  [11.0, 6, 0.5],
  [11.5, 8, 0.5],
  [12.0, 7, 0.5],
  [12.5, 5, 0.5],
  [13.0, 6, 0.5],
  [13.5, 7, 1.0],
  [14.0, 5, 0.5],
  [14.5, 4, 0.5],
  [15.0, 3, 1.0],
];

// 古琴的伴奏织体（4 小节）：低音区为主，短促点，轻快跳跃
const PLUCKS = [
  [0.0, 0, 0.6],
  [0.5, -1, 0.5],
  [1.0, -2, 0.6],
  [1.5, 1, 0.5],
  [2.0, -1, 0.5],
  [2.5, 0, 0.6],
  [3.0, -3, 0.5],
  [3.5, -1, 0.5],
  [4.0, -2, 0.6],
  [4.5, -1, 0.5],
  [5.0, 0, 0.5],
  [5.5, 2, 0.5],
  [6.0, -2, 0.6],
  [6.5, -1, 0.5],
  [7.0, 0, 0.6],
  [7.5, 1, 0.5],
  [8.0, -3, 0.6],
  [8.5, -2, 0.5],
  [9.0, -1, 0.5],
  [9.5, 0, 0.6],
  [10.0, -2, 0.5],
  [10.5, -1, 0.6],
  [11.0, -3, 0.5],
  [11.5, -1, 0.5],
  [12.0, 0, 0.6],
  [12.5, 1, 0.5],
  [13.0, -2, 0.5],
  [13.5, -1, 0.6],
  [14.0, 0, 0.5],
  [14.5, 2, 0.5],
  [15.0, -1, 0.6],
  [15.5, 0, 0.5],
];

// 主题句重复 4 次构成 16 小节；每遍做不同处理，避免机械重复：
// ① 全奏 ② 稀疏留白 ③ 高八度变奏 ④ 收束
const VARIANTS = [
  { drop: 0.05, shift: 0, gain: 1.0 },
  { drop: 0.3, shift: 0, gain: 0.85 },
  { drop: 0.1, shift: 2, gain: 0.9 },
  { drop: 0.4, shift: 0, gain: 0.7 },
];

for (let rep = 0; rep < 4; rep++) {
  const v = VARIANTS[rep];
  const off = rep * 16 * BEAT;

  // 竹笛：主题句
  for (const [b, deg, d] of PHRASE) {
    if (rnd() < v.drop) continue; // 按比例留白
    const jitter = (rnd() - 0.5) * 0.04; // 轻微的人性化时值浮动
    addFlute(off + b * BEAT, Math.min(10, Math.max(0, deg + v.shift)), d * BEAT * (1 + jitter), v.gain);
  }

  // 古琴：伴奏（短促，最后一遍逐渐稀疏形成收束感）
  const sparse = rep === 3 ? 0.35 : rep === 2 ? 0.18 : 0.1;
  for (const [b, deg, d] of PLUCKS) {
    if (rnd() < sparse) continue;
    addPluck(off + b * BEAT, deg, d * BEAT, 0.85 + (rnd() - 0.5) * 0.25);
  }
}

// 低频衬底：G2 + D3，音量极低，只作空间铺垫
addDrone(98.0, 0.04);
addDrone(146.83, 0.018);

/* ============================ 混响 + 无缝循环折叠 ============================ */
const wet = reverb(buf, 0.32);

/**
 * 无缝循环：
 * 把超过循环点的尾巴（混响余韵 + 末尾延音）线性淡出后叠回开头，
 * 这样播放器循环播放时接缝处不会出现「咔哒」或突然静音。
 */
const loop = new Float32Array(LOOP_N);
loop.set(wet.subarray(0, LOOP_N));
for (let i = 0; i < TAIL_N && i < LOOP_N; i++) {
  loop[i] += wet[LOOP_N + i] * (1 - i / TAIL_N);
}

/* ============================ 归一化 + 软限幅 ============================ */
let peak = 0;
for (let i = 0; i < loop.length; i++) peak = Math.max(peak, Math.abs(loop[i]));
const norm = peak > 0 ? 0.92 / peak : 1;
const pcm = new Int16Array(loop.length);
for (let i = 0; i < loop.length; i++) {
  const x = loop[i] * norm;
  // tanh 软限幅，避免削波失真
  pcm[i] = Math.round(Math.tanh(x) * 32000);
}

/* ============================ MP3 编码 ============================ */
const enc = new Mp3Encoder(1, SR, 96); // 1 = 单声道
const chunks = [];
const BLOCK = 1152;
for (let i = 0; i < pcm.length; i += BLOCK) {
  const chunk = pcm.subarray(i, Math.min(i + BLOCK, pcm.length));
  const out = enc.encodeBuffer(chunk);
  if (out.length > 0) chunks.push(Buffer.from(out));
}
const tail = enc.flush();
if (tail.length > 0) chunks.push(Buffer.from(tail));

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'public', 'bgm.mp3');
mkdirSync(dirname(outPath), { recursive: true });
const mp3 = Buffer.concat(chunks);
writeFileSync(outPath, mp3);

console.log(`时长   : ${(LOOP_N / SR).toFixed(1)} 秒（无缝循环，BPM=${BPM}）`);
console.log(`峰值   : ${peak.toFixed(3)} → 归一化系数 ${norm.toFixed(3)}`);
console.log(`输出   : ${outPath}`);
console.log(`大小   : ${(mp3.length / 1024 / 1024).toFixed(2)} MB`);
