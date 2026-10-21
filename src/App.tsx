import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useAppState, useAppDispatch, yearOf } from './store/PoetContext';
import { loadSupplements } from './data/poets';
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
import WorkFullscreen from './components/WorkFullscreen';
import { useHashSync } from './hooks/useHashSync';
import { useBgm } from './hooks/useBgm';

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

  // 迭代 17 · 性能裁剪：挂载后立即（但不阻塞）拉取「辞典补录」语料分块。
  // 这批数据约占产物三分之一体积，独立成 chunk 后首屏不必等它解析完。
  // 并入完成后 dataVersion +1，使承载数据的子树重挂载一次，
  // 让新并入的作品与统计数字进入界面（比逐个刷新对象身份更稳、更简单）。
  const [dataVersion, setDataVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadSupplements().then(() => {
      if (!cancelled) setDataVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
  // 迭代 12 · 古韵背景音乐（全局常驻；浏览器策略要求用户手势后才真正发声）
  useBgm(state.bgmOn);

  /* ============================================================
   * 迭代 12 · 地图全屏模式
   * 全屏时对整棵应用根元素调用 requestFullscreen，并隐藏顶栏 / 诗人名录 /
   * 右侧面板，让 main（地图 + 时间轴）独占画面 —— 时间轴上的
   * 「播放 / 暂停 / 复位 / 速度 / 上一站下一站 / 年份」等主要操作按钮
   * 全部保留，地图自身的缩放、导出、全屏按钮也照常可用。
   * 用户按 ESC 退出全屏时，用 fullscreenchange 反向同步状态，避免
   * 「画面已退出全屏但界面仍以为在全屏」的错位。
   * ============================================================ */
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (state.mapFullscreen) {
      if (!document.fullscreenElement) {
        // 由用户点击触发，满足浏览器的用户手势要求；失败（如 iframe 无权限）则静默
        el.requestFullscreen?.().catch(() => undefined);
      }
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => undefined);
    }
  }, [state.mapFullscreen]);

  useEffect(() => {
    const onFsChange = (): void => {
      if (!document.fullscreenElement && state.mapFullscreen) {
        dispatch({ type: 'SET_FULLSCREEN', value: false });
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [state.mapFullscreen, dispatch]);

  return (
    <div ref={rootRef} className="paper-bg flex h-full flex-col overflow-hidden text-ink">
      {/* 迭代 12：全屏模式下隐藏顶栏，把整屏让给地图 */}
      {!state.mapFullscreen ? <TopBar key={`top-${dataVersion}`} onOpenHelp={() => setGuide('help')} /> : null}

      <div key={`row-${dataVersion}`} className="flex min-h-0 flex-1">
        {/* 迭代 17 · 左侧名录抽屉：宽屏（≥md）始终可见；窄屏（<md）默认收起，
            点左下角浮标可展开（左侧滑入）；右上角有 ✕ 关闭 */}
        {!state.mapFullscreen ? (
          <aside
            className={`h-full shrink-0 border-r border-ink-4/40 bg-paper/95 backdrop-blur-sm transition-transform duration-300 md:bg-paper-2/60 md:translate-x-0 ${
              state.sidebarDrawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
            }`}
          >
            <div className="h-full w-[160px] md:w-[244px] xl:w-[244px]">
              <PoetSidebar />
            </div>
          </aside>
        ) : null}

        {/* 迭代 17 · 左侧名录抽屉浮标（左下角，宽屏隐藏；与右栏抽屉互斥：打开任一侧自动关另一侧） */}
        {!state.mapFullscreen ? (
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'SET_SIDEBAR_DRAWER', open: !state.sidebarDrawerOpen });
              // 抽屉互斥：打开左侧自动关右侧（避免双栏挤爆）
              if (!state.sidebarDrawerOpen && state.rightPanelOpen) {
                dispatch({ type: 'SET_RIGHT_PANEL', open: false });
              }
            }}
            className={`fixed bottom-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-ink-4/40 bg-paper text-[15px] text-ink-2 shadow-popup transition md:hidden ${
              state.sidebarDrawerOpen ? 'hidden' : ''
            }`}
            title={state.sidebarDrawerOpen ? '收起诗人名录' : '展开诗人名录'}
            aria-label={state.sidebarDrawerOpen ? '收起诗人名录' : '展开诗人名录'}
          >
            {state.sidebarDrawerOpen ? '‹' : '名录'}
          </button>
        ) : null}

        {/* 迭代 17 · 左侧名录抽屉关闭把手（右上角，仅窄屏 + 打开时显示） */}
        {!state.mapFullscreen && state.sidebarDrawerOpen ? (
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_SIDEBAR_DRAWER', open: false })}
            className="fixed left-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-ink-4/40 bg-paper text-[16px] text-ink-3 shadow-popup transition md:hidden"
            title="收起诗人名录"
            aria-label="收起诗人名录"
          >
            ✕
          </button>
        ) : null}

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

        {/* 迭代 17 · 移动端右栏抽屉：宽屏（≥md）始终可见；窄屏（<md）
            默认收起让位地图，点右下角浮标可展开抽屉（右侧滑入） */}
        {!state.mapFullscreen ? (
          <aside
            className={`h-full shrink-0 border-l border-ink-4/40 bg-paper/95 backdrop-blur-sm transition-transform duration-300 md:bg-paper/60 md:translate-x-0 ${
              state.rightPanelOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
            }`}
          >
            <div className="h-full w-[320px] xl:w-[400px]">
              <RightPanel />
            </div>
          </aside>
        ) : null}
      </div>

      {/* 迭代 17 · 移动端右栏抽屉浮标（右下角，宽屏隐藏） */}
      {!state.mapFullscreen ? (
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', open: !state.rightPanelOpen })}
          className={`fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-ink-4/40 bg-paper text-[15px] text-ink-2 shadow-popup transition md:hidden ${
            state.rightPanelOpen ? 'hidden' : ''
          }`}
          title={state.rightPanelOpen ? '收起作品面板' : '展开作品面板'}
          aria-label={state.rightPanelOpen ? '收起作品面板' : '展开作品面板'}
        >
          {state.rightPanelOpen ? '‹' : '作品'}
        </button>
      ) : null}

      {/* 迭代 17 · 移动端抽屉关闭把手（右上角，仅窄屏 + 打开时显示） */}
      {!state.mapFullscreen && state.rightPanelOpen ? (
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', open: false })}
          className="fixed right-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-ink-4/40 bg-paper text-[16px] text-ink-3 shadow-popup transition md:hidden"
          title="收起作品面板"
          aria-label="收起作品面板"
        >
          ✕
        </button>
      ) : null}

      {/* 迭代 9：首屏引导 / 快捷键速查（同一遮罩，两种模式） */}
      <GuideOverlay
        mode={guide}
        onClose={() => setGuide(null)}
        onSwitchMode={switchGuideMode}
      />

      {/* 迭代 16：作品全文放大页（字号 / 页面大小可调，Esc 关闭） */}
      <WorkFullscreen />
    </div>
  );
}
