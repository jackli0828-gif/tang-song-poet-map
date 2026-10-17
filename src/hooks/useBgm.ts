import { useCallback, useEffect, useRef } from 'react';

/**
 * 古韵背景音乐（纯前端、零外部依赖）
 * --------------------------------------------------------------
 * 方案：用 Web Audio API 实时合成一段舒缓的五声音阶（D 宫）古琴风循环，
 * 拨弦式包络（快起慢落）+ 偶发的低八度衬底，营造古韵氛围。
 * 同时支持「真实音频覆盖」：若站点根存在 public/bgm.mp3（构建后位于 ./bgm.mp3），
 * 则优先用该文件循环播放；文件缺失时自动回退到合成音，保证离线可用。
 *
 * 浏览器自动播放策略：音频上下文须在用户手势后才能发声，
 * 因此「开启」由顶栏按钮（手势）触发；若上下文仍处 suspended，
 * 则挂一个一次性的 pointerdown/keydown 监听，在首次交互时 resume。
 */

// D 宫五声音阶（含高八度），单位 Hz
const SCALE = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25];
// 一段舒缓的循环旋律（SCALE 索引；-1 表示休止）
const PHRASE = [0, 2, 4, 3, 2, 0, -1, 1, 3, 5, 4, 2, 0, -1, 2, 1];
const STEP_MS = 720;
const FILE_URL = `${import.meta.env.BASE_URL}bgm.mp3`;

function playPluck(ctx: AudioContext, master: GainNode, freq: number, dur: number, peak: number): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.05);
}

export function useBgm(enabled: boolean, volume = 0.12): void {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stepRef = useRef(0);
  const gestureRef = useRef<(() => void) | null>(null);

  /** 移除「等待用户手势以恢复播放」的一次性监听 */
  const clearGesture = useCallback((): void => {
    if (gestureRef.current) {
      window.removeEventListener('pointerdown', gestureRef.current);
      window.removeEventListener('keydown', gestureRef.current);
      gestureRef.current = null;
    }
  }, []);

  /** 若音频上下文被浏览器挂起，挂一次性监听，在首次交互时恢复 */
  const attachGesture = useCallback(
    (resume: () => void): void => {
      clearGesture();
      gestureRef.current = resume;
      window.addEventListener('pointerdown', resume);
      window.addEventListener('keydown', resume);
    },
    [clearGesture],
  );

  /** 停止播放：清掉合成调度、暂停文件播放、卸掉手势监听 */
  const stop = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    audioRef.current?.pause();
    clearGesture();
  }, [clearGesture]);

  /** 合成音：五声音阶循环（文件缺失时的回退方案） */
  const startSynth = useCallback((): void => {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;

    if (!ctxRef.current) {
      ctxRef.current = new AC();
      const master = ctxRef.current.createGain();
      master.gain.value = volume;
      master.connect(ctxRef.current.destination);
      masterRef.current = master;
    }
    const ctx = ctxRef.current;
    const master = masterRef.current!;
    master.gain.value = volume;

    if (ctx.state === 'suspended') {
      attachGesture(() => {
        ctx.resume().catch(() => undefined);
      });
      ctx.resume().catch(() => undefined);
    }

    if (timerRef.current !== null) return; // 已在播放，避免重复起调度器
    stepRef.current = 0;
    const tick = (): void => {
      const idx = PHRASE[stepRef.current];
      if (idx >= 0) {
        const freq = SCALE[idx];
        playPluck(ctx, master, freq, 1.4, 0.9);
        // 每 8 步叠一个低八度衬底，增添古琴的浑厚
        if (stepRef.current % 8 === 0) playPluck(ctx, master, freq / 2, 2.2, 0.45);
      }
      stepRef.current = (stepRef.current + 1) % PHRASE.length;
    };
    tick();
    timerRef.current = window.setInterval(tick, STEP_MS);
  }, [volume, attachGesture]);

  /** 启动播放：先试真实音频文件，失败则回退合成音 */
  const start = useCallback((): void => {
    if (typeof window === 'undefined') return;

    let settled = false;
    const audio = new Audio(FILE_URL);
    audio.loop = true;
    audio.volume = volume;

    audio.addEventListener(
      'canplaythrough',
      () => {
        if (settled) return;
        settled = true;
        audioRef.current = audio;
        audio.play().catch(() => {
          // 自动播放被拦截：等用户首次交互再起
          attachGesture(() => {
            audio.play().catch(() => undefined);
          });
        });
      },
      { once: true },
    );

    audio.addEventListener(
      'error',
      () => {
        if (settled) return;
        settled = true;
        // 文件缺失 / 无法解码 → 回退到实时合成
        startSynth();
      },
      { once: true },
    );

    audio.load();
  }, [volume, attachGesture, startSynth]);

  useEffect(() => {
    if (enabled) start();
    else stop();
  }, [enabled, start, stop]);

  // 卸载时彻底释放音频资源
  useEffect(
    () => () => {
      stop();
      audioRef.current = null;
      ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    },
    [stop],
  );
}
