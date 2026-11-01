import React, { useEffect, useRef, useState } from 'react';
import { useApp, useAppDispatch, useAppState } from '../store/PoetContext';
import GlobalSearch from './GlobalSearch';
import { useTheme } from '../hooks/useTheme';

/**
 * 迭代 9 · 轮次 3：复制分享链接。
 * URL 的 hash 里带着「诗人 id / 年份」深链（useHashSync），
 * 对方打开即回到同一位诗人的同一年，这正是本图最值得分享的状态。
 */
function ShareButton(): JSX.Element {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const share = async (): Promise<void> => {
    const url = window.location.href;
    let ok = true;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 非安全上下文 / 旧浏览器：退回手动复制
      window.prompt('复制此链接即可分享当前视角：', url);
      ok = false;
    }
    if (!ok) return;
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={share}
      title="复制当前视角的分享链接（含诗人与年份）"
      className={`h-8 rounded-sm border px-2.5 text-[12px] transition ${
        copied
          ? 'border-cinnabar/60 bg-cinnabar/10 text-cinnabar'
          : 'border-ink-4/45 bg-paper/70 text-ink-2 hover:bg-paper-3'
      }`}
    >
      {copied ? '✓ 已复制' : '分享链接'}
    </button>
  );
}
import { useStats } from '../hooks/usePoetData';
import type { DynastyFilter } from '../store/PoetContext';
import type { EraKey, PanelView } from '../types';

const VIEWS: { key: PanelView; label: string }[] = [
  { key: 'map', label: '行迹 · 作品' },
  { key: 'works', label: '作品总览' },
  { key: 'compare', label: '对照时间线' },
];

/** 朝代底图切换（唐开元十五道 / 宋路制） */
export function EraSwitch(): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const items: { key: EraKey; label: string }[] = [
    { key: 'tang', label: '唐 · 开元十五道' },
    { key: 'song', label: '宋 · 路制' },
  ];
  return (
    <div className="flex items-center gap-1 rounded-sm border border-ink-4/40 bg-paper/70 p-0.5">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => dispatch({ type: 'SET_ERA', era: it.key })}
          className={`rounded-sm px-2.5 py-1 text-[12px] transition ${
            state.era === it.key ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-3'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** 顶栏：标题、视图切换、底图切换、搜索与统计 */
export default function TopBar({ onOpenHelp }: { onOpenHelp: () => void }): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { compareMode } = useApp();
  // 统计来自两级数据门面：首屏取名录索引的数字，补录语料并入后自动刷新
  const stats = useStats();
  // 迭代 17 · 深色模式切换（跟随系统 / 手动）
  const { theme, toggle } = useTheme();

  const filters: { key: DynastyFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: '唐', label: '唐' },
    { key: '宋', label: '宋' },
  ];

  return (
    <header className="z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-4/40 bg-paper/90 px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="seal text-[11px] leading-tight">
          诗
          <br />
          旅
        </span>
        <div className="leading-tight">
          <h1 className="text-[19px] tracking-[0.14em] text-ink">唐宋词人时空轨迹图</h1>
          <p className="text-[11px] text-ink-3">人 · 时间 · 地点 · 作品 —— 一一对应</p>
        </div>
      </div>

      <nav className="flex items-center gap-1 rounded-sm border border-ink-4/40 bg-paper/70 p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => dispatch({ type: 'SET_VIEW', view: v.key })}
            className={`rounded-sm px-3 py-1 text-[12.5px] transition ${
              state.view === v.key ? 'bg-cinnabar text-paper' : 'text-ink-2 hover:bg-paper-3'
            }`}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <EraSwitch />

      <div className="flex items-center gap-1 rounded-sm border border-ink-4/40 bg-paper/70 p-0.5">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => dispatch({ type: 'SET_FILTER', filter: f.key })}
            className={`rounded-sm px-2.5 py-1 text-[12px] transition ${
              state.dynastyFilter === f.key ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-3'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 迭代 9：顶栏搜索升级为全局四维检索（诗人 / 作品 / 地点），
          同时保留原有的「名录过滤」行为（state.search 仍驱动 PoetSidebar 过滤）。 */}
      <GlobalSearch />

      {/* 迭代 9：操作速查 + 分享链接；迭代 12：古韵背景音乐开关；
          迭代 17：深色模式切换（跟随系统偏好，手动切换后持久化） */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggle}
          title={theme === 'dark' ? '切换为宣纸浅色' : '切换为墨色深色'}
          aria-label={theme === 'dark' ? '切换为宣纸浅色' : '切换为墨色深色'}
          className="flex h-8 w-8 items-center justify-center rounded-sm border border-ink-4/45 bg-paper/70 text-[13px] text-ink-2 transition hover:bg-paper-3"
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_BGM' })}
          title={state.bgmOn ? '关闭背景音乐（古琴风）' : '开启背景音乐（古琴风）'}
          aria-label="背景音乐开关"
          className={`flex h-8 items-center justify-center rounded-sm border px-2 text-[12px] transition ${
            state.bgmOn
              ? 'border-cinnabar/60 bg-cinnabar/10 text-cinnabar'
              : 'border-ink-4/45 bg-paper/70 text-ink-2 hover:bg-paper-3'
          }`}
        >
          ♪ 背景音乐
        </button>
        <button
          type="button"
          onClick={onOpenHelp}
          title="操作速查（也可按 ? 键）"
          aria-label="操作速查"
          className="flex h-8 w-8 items-center justify-center rounded-sm border border-ink-4/45 bg-paper/70 text-[13px] text-ink-2 transition hover:bg-paper-3"
        >
          ?
        </button>
        <ShareButton />
      </div>

      <div className="ml-auto flex items-center gap-3 text-[11px] text-ink-3">
        <span>
          收录 {stats.poets} 家（唐 {stats.tang} · 宋 {stats.song}）
        </span>
        <span>节点 {stats.nodes}</span>
        <span>作品 {stats.works}</span>
        {compareMode ? <span className="rounded-sm bg-cinnabar/10 px-2 py-0.5 text-cinnabar">对比模式</span> : null}
      </div>
    </header>
  );
}
