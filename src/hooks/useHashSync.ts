import { useEffect, useRef } from 'react';
import { getPoetMap } from '../data/poetStore';
import { useAppDispatch, useAppState, useYearState } from '../store/PoetContext';

/**
 * 迭代 3 · URL 深链：#<诗人id>/<年份>
 * - 载入时读取 hash 恢复到「某诗人的某一年」，便于分享与刷新保持；
 * - 当前主诗人 / 年份变化时写回 hash（用 replaceState，不污染浏览器历史）；
 * - 监听 hashchange，用户手动改地址栏也能同步。
 *
 * 例：#sushi/1079 直接打开「苏轼 · 1079 年」。
 */
export function useHashSync(): void {
  const state = useAppState();
  const yearState = useYearState();
  const dispatch = useAppDispatch();
  // 初始化只做一次，避免与写回逻辑互相触发
  const inited = useRef(false);

  /** 解析并应用 hash（返回是否成功应用） */
  const applyHash = useRef((hash: string): boolean => {
    const m = /^#([A-Za-z]+)(?:\/(\d{3,4}))?$/.exec(hash);
    if (!m) return false;
    const [, id, yearStr] = m;
    if (!getPoetMap()[id]) return false;
    dispatch({ type: 'SELECT_POET', id });
    if (yearStr) dispatch({ type: 'SET_YEAR', poetId: id, year: Number(yearStr) });
    return true;
  });

  // 1) 载入时恢复
  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    applyHash.current(window.location.hash);
  }, []);

  // 2) 用户手动改地址栏 / 点击带 hash 的链接
  useEffect(() => {
    const onHashChange = (): void => {
      applyHash.current(window.location.hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // 3) 当前主诗人与（取整后的）年份变化时写回 hash。
  //    播放过程中年份是浮点，这里取整后再比较，避免每帧都写地址栏。
  useEffect(() => {
    if (!inited.current) return;
    const raw = yearState.yearByPoet[state.primaryId];
    if (typeof raw !== 'number') return;
    const year = Math.round(raw);
    const next = `#${state.primaryId}/${year}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [state.primaryId, yearState.yearByPoet]);
}
