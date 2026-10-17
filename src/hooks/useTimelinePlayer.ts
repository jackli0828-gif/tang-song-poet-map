import { useEffect, useRef } from 'react';

export interface TimelinePlayerOptions {
  /** 起始年份（出生年） */
  start: number;
  /** 结束年份（卒年） */
  end: number;
  playing: boolean;
  /** 倍速：0.5 / 1 / 2 */
  speed: number;
  /** 当前年份（外部受控，播放时以它为起点） */
  currentYear: number;
  /** 每帧回调（年份为浮点数，便于平滑插值） */
  onTick: (year: number) => void;
  /** 播放到末尾 */
  onEnd?: () => void;
}

/** 基础速度：每秒推进的「年数」（1x） */
const YEARS_PER_SECOND = 7;

/**
 * 时间轴播放器：使用 requestAnimationFrame 逐帧推进年份。
 * 播放到末年自动暂停并回调 onEnd。
 */
export function useTimelinePlayer(options: TimelinePlayerOptions): void {
  const { start, end, playing, speed, currentYear, onTick, onEnd } = options;

  // 用 ref 保存最新值与回调，避免频繁重建 rAF 循环
  const yearRef = useRef<number>(currentYear);
  const tickRef = useRef(onTick);
  const endRef = useRef(onEnd);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    tickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    endRef.current = onEnd;
  }, [onEnd]);

  // 起点同步（迭代 9 修复：必须与「区间重置」放在同一个 effect 里，且重置在前、同步在后）
  //
  // 原先写成两个 effect 时有个隐蔽缺陷：全局检索命中作品后会连续 dispatch
  // SELECT_POET + SET_NODE（同一次 React 批处理）。effect 按声明顺序执行，
  // 于是「区间重置」后执行，把刚定位到的年份（如苏轼黄州 1080）覆盖回出生年（1037），
  // 表现为：点开搜索结果后按播放，年份不是从 1080 继续，而是倒退回 1051。
  // 合并且固定次序后：先按新区间归位，再同步外部年份，后者才是最终起点。
  const rangeRef = useRef<{ start: number; end: number }>({ start, end });
  useEffect(() => {
    const prev = rangeRef.current;
    if (prev.start !== start || prev.end !== end) {
      // 生卒区间变化（切换诗人）：内部年份先回到新区间起点，
      // 否则播放中切换诗人会把上一位诗人的浮点年份带过来。
      rangeRef.current = { start, end };
      yearRef.current = start;
    }
    // 外部（拖动滑块 / 点击节点 / 检索跳转）修改年份时同步内部起点
    if (!playing) yearRef.current = currentYear;
  }, [currentYear, playing, start, end]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // 起始点若已在末尾，则从头播放
    if (yearRef.current >= end - 0.01) yearRef.current = start;
    lastTsRef.current = 0;

    const step = (ts: number): void => {
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      // 后台标签页会暂停 rAF，恢复后 dt 可能极大；夹紧以免一帧跳到卒年
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.1);
      lastTsRef.current = ts;

      const next = yearRef.current + dt * YEARS_PER_SECOND * speed;
      if (next >= end) {
        yearRef.current = end;
        tickRef.current(end);
        rafRef.current = null;
        endRef.current?.();
        return;
      }
      yearRef.current = next;
      tickRef.current(next);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing, speed, start, end]);
}
