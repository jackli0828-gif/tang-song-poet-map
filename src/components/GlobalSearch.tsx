import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../store/PoetContext';
import { searchAll, type PlaceHit, type PoetHit, type WorkHit } from '../utils/search';
import { formatEra } from '../utils/format';

type Hit = PoetHit | WorkHit | PlaceHit;

/** 把命中的关键词标成朱砂底 */
function Highlight({ text, kw }: { text: string; kw: string }): JSX.Element {
  if (!kw) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx = text.indexOf(kw);
  let n = 0;
  while (idx >= 0 && n < 30) {
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <span key={`m${n}`} className="rounded-[2px] bg-cinnabar/20 text-cinnabar">
        {kw}
      </span>,
    );
    cursor = idx + kw.length;
    idx = text.indexOf(kw, cursor);
    n += 1;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/**
 * 迭代 9 · 全局四维检索框
 * 输入任一关键词 → 同时命中「诗人 / 作品 / 地点」三组；
 * 回车或点击后：切换到对应诗人、跳到对应年份与地点、展开该作品全文，
 * 直接把「人-时间-地点-作品」四维串起来。
 */
export default function GlobalSearch(): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const kw = state.search.trim();

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [expandedPlace, setExpandedPlace] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const result = useMemo(() => searchAll(kw), [kw]);

  // 扁平化，供键盘 ↑↓ 导航
  const flat = useMemo<Hit[]>(
    () => [...result.poets, ...result.works, ...result.places],
    [result],
  );

  useEffect(() => {
    setActive(0);
    setExpandedPlace(null);
  }, [kw]);

  // 点击外部关闭
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const close = (): void => {
    setOpen(false);
    inputRef.current?.blur();
  };

  const goPoet = (id: string): void => {
    dispatch({ type: 'SELECT_POET', id });
    dispatch({ type: 'SET_VIEW', view: 'map' });
    close();
  };

  const goWork = (hit: WorkHit): void => {
    // 顺序要紧：先换诗人（会重置年份），再定位节点，最后展开全文
    dispatch({ type: 'SELECT_POET', id: hit.poet.id });
    dispatch({
      type: 'SET_NODE',
      poetId: hit.poet.id,
      nodeId: hit.node.id,
      year: hit.node.year,
    });
    dispatch({ type: 'ENSURE_WORK_EXPANDED', workId: hit.work.id });
    dispatch({ type: 'SET_VIEW', view: 'map' });
    close();
  };

  const goPlace = (hit: PlaceHit): void => {
    dispatch({ type: 'FOCUS_POINT', lng: hit.lng, lat: hit.lat });
  };

  const runHit = (hit: Hit): void => {
    if (hit.kind === 'poet') goPoet(hit.poet.id);
    else if (hit.kind === 'work') goWork(hit);
    else {
      // 地点：先在地图上聚焦，再展开「谁到过这里」
      goPlace(hit);
      const key = `${hit.place}|${hit.modernPlace}`;
      setExpandedPlace((cur) => (cur === key ? null : key));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = flat[active];
      if (hit) runHit(hit);
    }
  };

  const showPanel = open && kw.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        value={state.search}
        onChange={(e) => {
          dispatch({ type: 'SET_SEARCH', search: e.target.value });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="检索诗人 / 作品 / 地名"
        aria-label="全局检索：诗人、作品、地名"
        className="h-8 w-52 rounded-sm border border-ink-4/45 bg-paper px-2.5 text-[12.5px] text-ink placeholder:text-ink-4 focus:border-cinnabar focus:outline-none"
      />
      {state.search ? (
        <button
          type="button"
          aria-label="清空检索"
          title="清空检索"
          onClick={() => {
            dispatch({ type: 'SET_SEARCH', search: '' });
            inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-4 transition hover:text-cinnabar"
        >
          ✕
        </button>
      ) : null}

      {showPanel ? (
        <div className="absolute left-0 top-[34px] z-40 max-h-[68vh] w-[420px] overflow-y-auto rounded-sm border border-ink-3/50 bg-paper shadow-popup">
          {flat.length === 0 ? (
            <p className="px-3 py-4 text-center text-[12.5px] text-ink-4">
              没有匹配的诗人、作品或地名。试试「赤壁」「长安」「明月」。
            </p>
          ) : (
            <>
              {result.poets.length > 0 ? (
                <Group title="诗人">
                  {result.poets.map((hit) => {
                    const i = flat.indexOf(hit);
                    return (
                      <Row
                        key={`p-${hit.poet.id}`}
                        active={i === active}
                        onEnter={() => setActive(i)}
                        onClick={() => goPoet(hit.poet.id)}
                      >
                        <span className="text-[14.5px] text-ink">
                          <Highlight text={hit.poet.name} kw={kw} />
                        </span>
                        <span className="ml-2 text-[12px] text-ink-3">
                          {hit.poet.dynasty} · {hit.poet.birthYear}—{hit.poet.deathYear}
                          {hit.poet.pseudonym ? ` · 号${hit.poet.pseudonym}` : ''}
                        </span>
                      </Row>
                    );
                  })}
                </Group>
              ) : null}

              {result.works.length > 0 ? (
                <Group title={`作品（${result.works.length}）`}>
                  {result.works.map((hit) => {
                    const i = flat.indexOf(hit);
                    return (
                      <Row
                        key={`w-${hit.work.id}`}
                        active={i === active}
                        onEnter={() => setActive(i)}
                        onClick={() => goWork(hit)}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-kai text-[14.5px] text-ink">
                            《<Highlight text={hit.work.title} kw={kw} />》
                          </span>
                          <span className="shrink-0 text-[11.5px] text-ink-4">
                            {hit.work.genre} · {hit.work.year}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-ink-3">
                          {hit.poet.name} · {hit.node.place}（今
                          <Highlight text={hit.node.modernPlace} kw={kw} />
                          ） · {formatEra(hit.work.year)}
                        </div>
                      </Row>
                    );
                  })}
                </Group>
              ) : null}

              {result.places.length > 0 ? (
                <Group title="地点">
                  {result.places.map((hit) => {
                    const i = flat.indexOf(hit);
                    const key = `${hit.place}|${hit.modernPlace}`;
                    const expanded = expandedPlace === key;
                    return (
                      <div key={`pl-${key}`}>
                        <Row
                          active={i === active}
                          onEnter={() => setActive(i)}
                          onClick={() => {
                            goPlace(hit);
                            setExpandedPlace((cur) => (cur === key ? null : key));
                          }}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[14.5px] text-ink">
                              <Highlight text={hit.place} kw={kw} />
                            </span>
                            <span className="shrink-0 text-[11.5px] text-ink-4">
                              {hit.poets.length} 人到过 · {hit.workCount} 篇
                            </span>
                          </div>
                          <div className="mt-0.5 text-[12px] text-ink-3">
                            今<Highlight text={hit.modernPlace} kw={kw} />
                            <span className="ml-1.5 text-ink-4">{expanded ? '▲ 收起' : '▼ 谁到过这里'}</span>
                          </div>
                        </Row>
                        {expanded ? (
                          <div className="border-t border-ink-4/25 bg-paper-2/60 px-3 py-2">
                            <div className="flex flex-wrap gap-1.5">
                              {hit.poets.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    goPoet(p.id);
                                    goPlace(hit);
                                  }}
                                  className="rounded-sm border border-ink-4/45 px-2 py-0.5 text-[12px] text-ink-2 transition hover:border-cinnabar/60 hover:text-cinnabar"
                                >
                                  {p.name}
                                  <span className="ml-1 text-[11px] text-ink-4">{p.dynasty}</span>
                                </button>
                              ))}
                            </div>
                            <p className="mt-1.5 text-[11.5px] text-ink-4">
                              点击诗人可切换视角并聚焦到该地。
                            </p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </Group>
              ) : null}

              <div className="border-t border-ink-4/30 px-3 py-1.5 text-[11px] text-ink-4">
                ↑↓ 选择 · Enter 跳转 · Esc 关闭　|　共 {result.total} 条匹配
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="border-b border-ink-4/25 last:border-b-0">
      <div className="bg-paper-2/70 px-3 py-1 text-[11.5px] tracking-[0.12em] text-cinnabar">{title}</div>
      {children}
    </div>
  );
}

function Row({
  active,
  onEnter,
  onClick,
  children,
}: {
  active: boolean;
  onEnter: () => void;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onMouseEnter={onEnter}
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left transition ${
        active ? 'bg-paper-3' : 'hover:bg-paper-2/60'
      }`}
    >
      {children}
    </button>
  );
}
