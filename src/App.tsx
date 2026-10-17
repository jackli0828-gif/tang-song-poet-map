import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useAppState, useAppDispatch, yearOf } from './store/PoetContext';
import { activeNodeIndex } from './utils/geo';
import TopBar from './components/TopBar';
import GuideOverlay, { hasOnboarded, type GuideMode } from './components/GuideOverlay';
import PoetSidebar from './components/PoetSidebar';
import MapCanvas from './components/MapCanvas';
import Timeline from './components/Timeline';
import WorkPanel from './components/WorkPanel';
import WorksGallery from './components/WorksGallery';
import CompareView from './components/CompareView';
import Legend from './components/Legend';
import { useHashSync } from './hooks/useHashSync';

/** 右侧面板：按视图切换 */
function RightPanel(): JSX.Element {
  const state = useAppState();
  if (state.view === 'works') return <WorksGallery />;
  if (state.view === 'compare') return <CompareView />;
  return <WorkPanel />;
}

/**
 * 迭代 4 · 全局键盘快捷键
 * - 空格：播放 / 暂停
 * - ← / →：上一站 / 下一站（沿年谱节点跳转）
 * - Home：回到出生年
 * 输入框内不拦截，避免影响搜索。
 */
function useKeyboardShortcuts(onOpenHelp: () => void): void {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { primaryPoet } = useApp();

  // 同样用 ref 承载，避免回调变化导致反复解绑重绑
  const helpRef = useRef(onOpenHelp);
  useEffect(() => {
    helpRef.current = onOpenHelp;
  }, [onOpenHelp]);

  const idx = useMemo(
    () => activeNodeIndex(primaryPoet.nodes, yearOf(state, primaryPoet.id)),
    [primaryPoet, state],
  );

  // 关键：用 ref 承载最新值，使监听器只注册一次。
  // 若把 idx / primaryPoet 放进依赖，播放时每帧都会解绑再重绑一次 keydown，白白浪费开销。
  const ctxRef = useRef({ primaryPoet, idx });
  useEffect(() => {
    ctxRef.current = { primaryPoet, idx };
  }, [primaryPoet, idx]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      // 输入框 / 文本域 / 可编辑区不拦截
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const { primaryPoet, idx } = ctxRef.current;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_PLAY' });
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = primaryPoet.nodes[idx - 1];
        if (prev) dispatch({ type: 'SET_NODE', poetId: primaryPoet.id, nodeId: prev.id, year: prev.year });
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = primaryPoet.nodes[idx + 1];
        if (next) dispatch({ type: 'SET_NODE', poetId: primaryPoet.id, nodeId: next.id, year: next.year });
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        dispatch({ type: 'RESET_YEAR', poetId: primaryPoet.id });
        return;
      }
      // 迭代 9：「?」唤出操作速查
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        helpRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);
}

export default function App(): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();

  // 迭代 9 · 轮次 3：首访自动弹出三步引导；顶栏「?」或 ? 键唤出速查表
  const [guide, setGuide] = useState<GuideMode>(null);
  useEffect(() => {
    if (!hasOnboarded()) setGuide('intro');
  }, []);
  const switchGuideMode = useCallback(() => {
    setGuide((m) => (m === 'intro' ? 'help' : 'intro'));
  }, []);

  // 迭代 3 · URL 深链：#<诗人id>/<年份>，支持分享与刷新保持
  useHashSync();
  // 迭代 4 · 键盘快捷键
  useKeyboardShortcuts(useCallback(() => setGuide('help'), []));

  return (
    <div className="paper-bg flex h-full flex-col overflow-hidden text-ink">
      <TopBar onOpenHelp={() => setGuide('help')} />

      <div className="flex min-h-0 flex-1">
        <PoetSidebar />

        {/* 侧栏收起时的展开把手 */}
        {!state.sidebarOpen ? (
          <button
            type="button"
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className="shrink-0 border-r border-ink-4/40 bg-paper-2/60 px-1 text-[12px] text-ink-3 transition hover:bg-paper-3"
            title="展开诗人名录"
          >
            <span className="vertical-title mx-auto">名录</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className="absolute left-[244px] top-[64px] z-10 -ml-px hidden rounded-r-sm border border-l-0 border-ink-4/40 bg-paper-2 px-1 py-2 text-[11px] text-ink-3 hover:bg-paper-3 lg:block"
            title="收起诗人名录"
          >
            ‹
          </button>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* 迭代 2：地图区加卷轴装裱边框 */}
          <div className="scroll-frame relative min-h-0 flex-1">
            <MapCanvas />
            <div className="pointer-events-none absolute inset-0">
              <Legend />
            </div>
          </div>
          <Timeline />
        </main>

        {/* 迭代 3 · 响应式：窄屏收窄右面板，宽屏恢复 400px */}
        <aside className="h-full w-[320px] shrink-0 border-l border-ink-4/40 bg-paper/60 xl:w-[400px]">
          <RightPanel />
        </aside>
      </div>

      {/* 迭代 9：首屏引导 / 快捷键速查（同一遮罩，两种模式） */}
      <GuideOverlay
        mode={guide}
        onClose={() => setGuide(null)}
        onSwitchMode={switchGuideMode}
      />
    </div>
  );
}
