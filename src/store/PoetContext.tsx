import React, { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { POETS, POET_MAP } from '../data/poets';
import type { EraKey, PanelView, PlaySpeed, Poet } from '../types';
import { activeNodeIndex } from '../utils/geo';

/** 王朝筛选 */
export type DynastyFilter = 'all' | '唐' | '宋';

export interface AppState {
  /** 已选中的诗人 id（第一位为主诗人；对比模式最多 3 位） */
  selectedIds: string[];
  /** 主诗人 id */
  primaryId: string;
  dynastyFilter: DynastyFilter;
  search: string;
  /** 每位诗人当前的播放年份 */
  yearByPoet: Record<string, number>;
  /** 手动锁定的节点 id（点击地图节点或作品墙时使用） */
  lockedNodeByPoet: Record<string, string | null>;
  playing: boolean;
  speed: PlaySpeed;
  /** 底图时代：唐（开元十五道）/ 宋（路制） */
  era: EraKey;
  /** 右侧面板视图 */
  view: PanelView;
  sidebarOpen: boolean;
  /** 作品全文展开的作品 id */
  expandedWorkIds: string[];
  /** 时间轴是否所有诗人同步（对比模式） */
  syncYears: boolean;
  /** 对比模式下被手动隐藏轨迹的诗人 id（轨迹可独立开关） */
  hiddenPoetIds: string[];
  /** 播放时地图是否自动跟随当前节点（节点移出视野即平滑归中） */
  followPlay: boolean;
  /** 是否显示「同地同时」的交游连线（迭代 5） */
  showLinks: boolean;
  /**
   * 迭代 6：请求地图聚焦到某经纬度（点击城市列表时用）。
   * 带 token 以便重复点击同一城市也能再次触发飞行动画。
   */
  focus: { lng: number; lat: number; token: number } | null;
  /**
   * 迭代 11：地点访客面板。点击地图上的城市标注（或节点浮层中的「查看此地来过的人」）
   * 时，记录被点地点的经纬度，由地图据此飞行并在其上弹出访客面板。
   * label / modernLabel 为可选覆盖：点击城市标注时带入城市自己的古称 / 今地，
   * 避免面板标题直接显示坐标归并得出的、可能不够直观的聚簇名（如「临安市」）。
   * 带 token 以便重复点击同一地点也能再次触发飞行动画。
   */
  placeDetail: { lng: number; lat: number; token: number; label?: string; modernLabel?: string } | null;
  /** 全屏模式：隐藏顶栏 / 名录 / 右栏，仅留地图 + 时间轴（保留主要操作按钮） */
  mapFullscreen: boolean;
  /** 播放生平轨迹时是否朗读诗人小传 */
  readBrief: boolean;
  /** 古韵背景音乐开关 */
  bgmOn: boolean;
  /** 迭代 16：当前在「全文放大页」中展示的作品 id（null 表示未打开） */
  openWorkId: string | null;
  /** 迭代 17：移动端右栏是否抽屉展开（仅 < md 视口生效；宽屏右栏始终可见） */
  rightPanelOpen: boolean;
  /** 迭代 17：移动端名录抽屉是否展开（仅 < md 视口生效；宽屏始终可见） */
  sidebarDrawerOpen: boolean;
}

export type AppAction =
  | { type: 'SELECT_POET'; id: string }
  | { type: 'TOGGLE_COMPARE'; id: string }
  | { type: 'CLEAR_COMPARE' }
  | { type: 'SET_FILTER'; filter: DynastyFilter }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SET_YEAR'; poetId: string; year: number }
  | { type: 'SET_YEAR_ALL'; year: number }
  | { type: 'SET_NODE'; poetId: string; nodeId: string; year: number }
  | { type: 'RESET_YEAR'; poetId: string }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_SPEED'; speed: PlaySpeed }
  | { type: 'SET_ERA'; era: EraKey }
  | { type: 'SET_VIEW'; view: PanelView }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'TOGGLE_WORK'; workId: string }
  | { type: 'ENSURE_WORK_EXPANDED'; workId: string }
  | { type: 'SET_SYNC'; sync: boolean }
  /** 对比模式下开关某位诗人的地图轨迹显示 */
  | { type: 'TOGGLE_TRACK'; id: string }
  /** 开关「播放时地图自动跟随当前节点」 */
  | { type: 'TOGGLE_FOLLOW' }
  /** 开关「同地同时」交游连线 */
  | { type: 'TOGGLE_LINKS' }
  /** 请求地图飞行聚焦到某点 */
  | { type: 'FOCUS_POINT'; lng: number; lat: number }
  /** 迭代 6：关闭地图作品浮层（清除锁定节点） */
  | { type: 'CLEAR_NODE'; poetId: string }
  /** 迭代 11：打开「地点访客」面板（记录被点地点的经纬度与可选的标题覆盖） */
  | { type: 'OPEN_PLACE'; lng: number; lat: number; label?: string; modernLabel?: string }
  /** 迭代 11：关闭「地点访客」面板 */
  | { type: 'CLOSE_PLACE' }
  /** 迭代 12：进入 / 退出地图全屏模式 */
  | { type: 'SET_FULLSCREEN'; value: boolean }
  /** 迭代 12：切换「播放生平轨迹时朗读诗人小传」 */
  | { type: 'TOGGLE_READ_BRIEF' }
  /** 迭代 12：切换古韵背景音乐 */
  | { type: 'TOGGLE_BGM' }
  /** 迭代 16：打开 / 关闭「作品全文放大页」 */
  | { type: 'OPEN_WORK_FULL'; workId: string | null }
  /** 迭代 17：移动端右栏抽屉开关（宽屏忽略） */
  | { type: 'SET_RIGHT_PANEL'; open: boolean }
  /** 迭代 17：移动端名录抽屉开关（宽屏忽略） */
  | { type: 'SET_SIDEBAR_DRAWER'; open: boolean };

const MAX_COMPARE = 3;

const initialYearMap = (): Record<string, number> => {
  const map: Record<string, number> = {};
  for (const p of POETS) map[p.id] = p.birthYear;
  return map;
};

export const initialState: AppState = {
  selectedIds: [POETS[0].id],
  primaryId: POETS[0].id,
  dynastyFilter: 'all',
  search: '',
  yearByPoet: initialYearMap(),
  lockedNodeByPoet: {},
  playing: false,
  speed: 1,
  era: 'tang',
  view: 'map',
  // 迭代 3 · 响应式：窄屏（<1100px）默认收起诗人名录，给地图让出空间
  sidebarOpen: typeof window === 'undefined' ? true : window.innerWidth >= 1100,
  expandedWorkIds: [],
  syncYears: false,
  hiddenPoetIds: [],
  followPlay: true,
  showLinks: true,
  focus: null,
  placeDetail: null,
  // 迭代 12：全屏模式默认关闭；朗读与背景音乐默认开启（背景音乐需用户手势后才真正发声）
  mapFullscreen: false,
  readBrief: true,
  bgmOn: true,
  // 迭代 16：全文放大页默认关闭
  openWorkId: null,
  // 迭代 17：移动端右栏默认收起（让位地图，用户可一键展开）
  rightPanelOpen: false,
  // 迭代 17：移动端名录默认收起（让位地图，用户可一键展开）
  sidebarDrawerOpen: false,
};

/** 依据诗人 id 取当前年份（回退到出生年） */
export function yearOf(state: AppState, poetId: string): number {
  const poet = POET_MAP[poetId];
  if (!poet) return 0;
  const y = state.yearByPoet[poetId];
  if (typeof y !== 'number') return poet.birthYear;
  return Math.min(poet.deathYear, Math.max(poet.birthYear, y));
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SELECT_POET': {
      const poet = POET_MAP[action.id];
      if (!poet) return state;
      // 切换诗人：停止播放，并把年份归零到该诗人的出生年，
      // 否则播放中的浮点年份会被带到新诗人身上，跳过其青少年阶段。
      return {
        ...state,
        primaryId: action.id,
        selectedIds: [action.id],
        yearByPoet: { ...state.yearByPoet, [action.id]: poet.birthYear },
        lockedNodeByPoet: { ...state.lockedNodeByPoet, [action.id]: null },
        playing: false,
      };
    }
    case 'TOGGLE_COMPARE': {
      const has = state.selectedIds.includes(action.id);
      let next: string[];
      if (has) {
        if (state.selectedIds.length === 1) return state; // 至少保留一位
        next = state.selectedIds.filter((id) => id !== action.id);
      } else {
        if (state.selectedIds.length >= MAX_COMPARE) return state;
        next = [...state.selectedIds, action.id];
      }
      return { ...state, selectedIds: next, primaryId: next[0] };
    }
    case 'CLEAR_COMPARE':
      return { ...state, selectedIds: [state.primaryId] };
    case 'SET_FILTER':
      return { ...state, dynastyFilter: action.filter };
    case 'SET_SEARCH':
      return { ...state, search: action.search };
    case 'SET_YEAR': {
      if (state.syncYears) {
        const nextYears: Record<string, number> = { ...state.yearByPoet };
        for (const id of state.selectedIds) nextYears[id] = action.year;
        return { ...state, yearByPoet: nextYears, lockedNodeByPoet: {} };
      }
      return {
        ...state,
        yearByPoet: { ...state.yearByPoet, [action.poetId]: action.year },
        lockedNodeByPoet: { ...state.lockedNodeByPoet, [action.poetId]: null },
      };
    }
    case 'SET_YEAR_ALL': {
      const nextYears: Record<string, number> = { ...state.yearByPoet };
      for (const id of state.selectedIds) nextYears[id] = action.year;
      return { ...state, yearByPoet: nextYears, lockedNodeByPoet: {} };
    }
    case 'SET_NODE': {
      // 迭代 15 · 作品默认展开全文：定位到某节点时，把该节点的所有作品默认展开
      const node = POET_MAP[action.poetId]?.nodes.find((n) => n.id === action.nodeId);
      const workIds: string[] = node && node.works.length > 0 ? node.works.map((w) => w.id) : [];
      if (state.syncYears) {
        const nextYears: Record<string, number> = { ...state.yearByPoet };
        for (const id of state.selectedIds) nextYears[id] = action.year;
        // 同步年份时同样要锁定「发起定位的那位诗人」的节点：
        // 否则全局检索命中作品后跳转，地图作品浮层不会弹出（迭代 9 修复）。
        const locked: Record<string, string | null> = { ...state.lockedNodeByPoet };
        for (const id of state.selectedIds) locked[id] = null;
        locked[action.poetId] = action.nodeId;
        return {
          ...state,
          yearByPoet: nextYears,
          lockedNodeByPoet: locked,
          playing: false,
          expandedWorkIds: workIds.length > 0 ? [...state.expandedWorkIds, ...workIds] : state.expandedWorkIds,
        };
      }
      return {
        ...state,
        yearByPoet: { ...state.yearByPoet, [action.poetId]: action.year },
        lockedNodeByPoet: { ...state.lockedNodeByPoet, [action.poetId]: action.nodeId },
        playing: false,
        expandedWorkIds: workIds.length > 0 ? [...state.expandedWorkIds, ...workIds] : state.expandedWorkIds,
      };
    }
    case 'RESET_YEAR': {
      const poet = POET_MAP[action.poetId];
      if (!poet) return state;
      if (state.syncYears) {
        const nextYears: Record<string, number> = { ...state.yearByPoet };
        for (const id of state.selectedIds) nextYears[id] = poet.birthYear;
        return { ...state, yearByPoet: nextYears, lockedNodeByPoet: {}, playing: false };
      }
      return {
        ...state,
        yearByPoet: { ...state.yearByPoet, [action.poetId]: poet.birthYear },
        lockedNodeByPoet: { ...state.lockedNodeByPoet, [action.poetId]: null },
        playing: false,
      };
    }
    case 'TOGGLE_PLAY': {
      // 迭代 15 · 修复「轨迹播放完成后闪退」：
      // 播放中每帧 SET_YEAR 都会把 lockedNodeByPoet[poetId] 置 null（关掉浮层），
      // 播完时若用户按空格想暂停/重播，没有「当前节点」供浮层定位 → 画面看起来像闪退。
      // 这里在 暂停→播放 切换时，把「当前年份对应的活动节点」锁上，
      // 让地图作品浮层在播放终点（或暂停点）稳定呈现，不会闪掉。
      if (!state.playing) {
        // 将要进入播放态：锁上出生年节点（轨迹起点），浮层在起点稳定呈现
        const poet = POET_MAP[state.primaryId];
        if (poet) {
          const birthNode = poet.nodes.find((n) => n.eventType === 'birth') ?? poet.nodes[0];
          if (birthNode) {
            const locked = { ...state.lockedNodeByPoet, [state.primaryId]: birthNode.id };
            return { ...state, playing: true, lockedNodeByPoet: locked };
          }
        }
        return { ...state, playing: true };
      }
      // 将要暂停：锁上当前年份对应的活动节点（可能是轨迹终点），浮层稳定呈现
      const poet = POET_MAP[state.primaryId];
      if (poet) {
        const curYear = state.yearByPoet[state.primaryId] ?? poet.birthYear;
        const idx = activeNodeIndex(poet.nodes, curYear);
        const node = idx >= 0 ? poet.nodes[idx] : undefined;
        if (node) {
          const locked = { ...state.lockedNodeByPoet, [state.primaryId]: node.id };
          return { ...state, playing: false, lockedNodeByPoet: locked };
        }
      }
      return { ...state, playing: false };
    }
    case 'SET_PLAYING':
      // 迭代 15 · 修复「轨迹播放完成后闪退」：
      // 播放走到末年自动停止（useTimelinePlayer 的 onEnd）时，
      // 若镜头跟随开启，panTo 在最后一帧触发，浮层又被 SET_YEAR 的 null 锁清掉，
      // 三件事叠加在 260ms 内发生 → 画面剧烈跳动（用户感知为「闪退」）。
      // 这里把「当前年份对应的活动节点」锁上，让浮层在轨迹终点稳定呈现，
      // 同时避免浮层随镜头飞行反复重定位。
      if (action.playing === false) {
        const poet = POET_MAP[state.primaryId];
        if (poet) {
          const curYear = state.yearByPoet[state.primaryId] ?? poet.deathYear;
          const idx = activeNodeIndex(poet.nodes, curYear);
          const node = idx >= 0 ? poet.nodes[idx] : undefined;
          if (node) {
            return {
              ...state,
              playing: false,
              lockedNodeByPoet: { ...state.lockedNodeByPoet, [state.primaryId]: node.id },
            };
          }
        }
        return { ...state, playing: false };
      }
      return { ...state, playing: action.playing };
    case 'SET_SPEED':
      return { ...state, speed: action.speed };
    case 'SET_ERA':
      return { ...state, era: action.era };
    case 'SET_VIEW':
      return { ...state, view: action.view };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'TOGGLE_WORK': {
      const has = state.expandedWorkIds.includes(action.workId);
      return {
        ...state,
        expandedWorkIds: has
          ? state.expandedWorkIds.filter((id) => id !== action.workId)
          : [...state.expandedWorkIds, action.workId],
      };
    }
    // 迭代 1 · B.2：播放/定位时自动展开某篇作品（已展开则不变，避免抖动）
    case 'ENSURE_WORK_EXPANDED': {
      if (state.expandedWorkIds.includes(action.workId)) return state;
      return { ...state, expandedWorkIds: [...state.expandedWorkIds, action.workId] };
    }
    case 'SET_SYNC':
      return { ...state, syncYears: action.sync };
    // 迭代 1 · C.2：对比模式下开关某位诗人的地图轨迹（不影响其参与对照计算）
    case 'TOGGLE_TRACK': {
      const hidden = state.hiddenPoetIds.includes(action.id);
      return {
        ...state,
        hiddenPoetIds: hidden
          ? state.hiddenPoetIds.filter((id) => id !== action.id)
          : [...state.hiddenPoetIds, action.id],
      };
    }
    // 迭代 4：播放时地图自动跟随当前节点
    case 'TOGGLE_FOLLOW':
      return { ...state, followPlay: !state.followPlay };
    // 迭代 5：同地同时的交游连线
    case 'TOGGLE_LINKS':
      return { ...state, showLinks: !state.showLinks };
    // 迭代 6：关闭地图上的作品浮层
    case 'CLEAR_NODE':
      return { ...state, lockedNodeByPoet: { ...state.lockedNodeByPoet, [action.poetId]: null } };
    // 迭代 6：地图飞行聚焦（token 递增，保证重复点击同一城市也能再触发）
    case 'FOCUS_POINT':
      return {
        ...state,
        focus: { lng: action.lng, lat: action.lat, token: (state.focus?.token ?? 0) + 1 },
      };
    // 迭代 11：打开地点访客面板（token 递增，保证重复点击同一地点也能再触发飞行）
    case 'OPEN_PLACE':
      return {
        ...state,
        placeDetail: {
          lng: action.lng,
          lat: action.lat,
          token: (state.placeDetail?.token ?? 0) + 1,
          label: action.label,
          modernLabel: action.modernLabel,
        },
      };
    // 迭代 11：关闭地点访客面板
    case 'CLOSE_PLACE':
      return { ...state, placeDetail: null };
    // 迭代 12：地图全屏（隐藏顶栏 / 名录 / 右栏，仅留地图 + 时间轴）
    case 'SET_FULLSCREEN':
      return { ...state, mapFullscreen: action.value };
    // 迭代 12：播放时是否朗读诗人小传（关闭朗读时应立即停声，由组件 effect 处理）
    case 'TOGGLE_READ_BRIEF':
      return { ...state, readBrief: !state.readBrief };
    // 迭代 12：古韵背景音乐
    case 'TOGGLE_BGM':
      return { ...state, bgmOn: !state.bgmOn };
    // 迭代 16：作品全文放大页
    case 'OPEN_WORK_FULL':
      return { ...state, openWorkId: action.workId };
    // 迭代 17：移动端右栏抽屉
    case 'SET_RIGHT_PANEL':
      return { ...state, rightPanelOpen: action.open };
    // 迭代 17：移动端名录抽屉
    case 'SET_SIDEBAR_DRAWER':
      return { ...state, sidebarDrawerOpen: action.open };
    default:
      return state;
  }
}

const StateContext = createContext<AppState>(initialState);
const DispatchContext = createContext<Dispatch<AppAction>>(() => undefined);

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

/** 读取应用状态 */
export function useAppState(): AppState {
  return useContext(StateContext);
}

/** 读取 dispatch（不会因状态变化而重渲染） */
export function useAppDispatch(): Dispatch<AppAction> {
  return useContext(DispatchContext);
}

export interface AppDerived {
  poets: Poet[];
  primaryPoet: Poet;
  selectedPoets: Poet[];
  compareMode: boolean;
  currentYear: number;
}

/** 组合后的派生数据（主诗人、对比模式、当前年份等） */
export function useApp(): AppDerived & { state: AppState; dispatch: Dispatch<AppAction> } {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const selectedPoets = useMemo(
    () => state.selectedIds.map((id) => POET_MAP[id]).filter((p): p is Poet => Boolean(p)),
    [state.selectedIds],
  );
  const primaryPoet = POET_MAP[state.primaryId] ?? POETS[0];
  const currentYear = yearOf(state, primaryPoet.id);
  return {
    state,
    dispatch,
    poets: POETS,
    primaryPoet,
    selectedPoets,
    compareMode: selectedPoets.length > 1,
    currentYear,
  };
}

/**
 * 过滤后的诗人列表（朝代 + 搜索）。
 * 迭代 10：收录扩至两部三百首的 161 家后名录变长，改为
 * 「唐在前、宋在后，各自按生年升序」，让名录自己就是一条时间线。
 */
export function useFilteredPoets(): Poet[] {
  const { poets } = useApp();
  const state = useAppState();
  return useMemo(() => {
    const kw = state.search.trim();
    const filtered = poets.filter((p) => {
      if (state.dynastyFilter !== 'all' && p.dynasty !== state.dynastyFilter) return false;
      if (!kw) return true;
      const hay = `${p.name}${p.courtesy ?? ''}${p.pseudonym ?? ''}${p.birthplace}${p.brief}`;
      return hay.includes(kw);
    });
    return filtered.sort((a, b) => {
      if (a.dynasty !== b.dynasty) return a.dynasty === '唐' ? -1 : 1;
      return a.birthYear - b.birthYear;
    });
  }, [poets, state.dynastyFilter, state.search]);
}
