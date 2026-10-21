import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useAppDispatch, useAppState, yearOf } from '../store/PoetContext';
import { useMapProjection, type MapProjection } from '../hooks/useMapProjection';
import { dashLineFeatures, provinceFeatures } from '../data/chinaGeo';
import { RIVERS } from '../data/rivers';
import MapWorkPopup from './MapWorkPopup';
import PlaceVisitorsPanel from './PlaceVisitorsPanel';
import { citiesOfDynasty } from '../data/cities';
import { placeDetailAt, visitorNamesAt } from '../utils/search';
import {
  SONG_PROVINCE_TO_REGION,
  SONG_REGIONS,
  TANG_PROVINCE_TO_REGION,
  TANG_REGIONS,
  type HistoricalRegion,
} from '../data/regions';
import { EVENT_COLOR, EVENT_GLYPH, type EraKey, type LifeNode, type Poet } from '../types';
import {
  DEFAULT_TRANSFORM,
  MAX_SCALE,
  MIN_SCALE,
  activeNodeIndex,
  angleOf,
  arrowPoints,
  clamp,
  clampTranslate,
  declutter,
  growthPath,
  isHubNode,
  nodeRadius,
  spreadPoints,
  progressAt,
  smoothPath,
  zoomAt,
  type Point,
  type ViewTransform,
} from '../utils/geo';

/** 默认省域填充（未被政区覆盖时） */
const DEFAULT_FILL = '#EFE7D6';

/* ============================================================
 * 底图层：省级边界 + 南海断续线 + 河流
 * 该组件被 memo 包裹，仅在投影尺寸或朝代底图变化时重算，
 * 避免时间轴播放（60fps）时反复生成上万点的 path。
 * provinceFeatures / dashLineFeatures 为模块级缓存（chinaGeo），多组件共享。
 * ============================================================ */
interface MapShapesProps {
  mp: MapProjection;
  era: EraKey;
}

const MapShapes = memo(function MapShapes({ mp, era }: MapShapesProps): JSX.Element {
  const regionMap = era === 'tang' ? TANG_PROVINCE_TO_REGION : SONG_PROVINCE_TO_REGION;

  const provinces = useMemo(
    () =>
      provinceFeatures.map((f) => ({
        id: String(f.properties.adcode),
        name: f.properties.name,
        d: mp.featurePath(f),
        fill: regionMap[f.properties.name]?.fill ?? DEFAULT_FILL,
      })),
    [mp, regionMap],
  );

  const dashLines = useMemo(() => dashLineFeatures.map((f) => mp.featurePath(f)), [mp]);

  const rivers = useMemo(
    () =>
      RIVERS.map((r) => {
        const pts: Point[] = r.points.map(([lng, lat]) => {
          const [x, y] = mp.project(lng, lat);
          return { x, y };
        });
        return { id: r.id, name: r.name, color: r.color, width: r.width, d: smoothPath(pts) };
      }),
    [mp],
  );

  return (
    <g>
      {provinces.map((p) => (
        <path
          key={p.id}
          d={p.d}
          fill={p.fill}
          stroke="#8B8175"
          strokeWidth={0.55}
          strokeOpacity={0.75}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        >
          <title>{p.name}</title>
        </path>
      ))}

      {dashLines.map((d, i) => (
        <path
          key={`dash-${i}`}
          d={d}
          fill="none"
          stroke="#7C736A"
          strokeWidth={1.4}
          strokeDasharray="7 5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        >
          <title>南海诸岛</title>
        </path>
      ))}

      {rivers.map((r) => (
        <path
          key={r.id}
          d={r.d}
          fill="none"
          stroke={r.color}
          strokeWidth={r.width}
          strokeOpacity={0.72}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        >
          <title>{r.name}</title>
        </path>
      ))}
    </g>
  );
});

/* ============================================================
 * 标注层：历史政区名 + 古今都会
 * ============================================================ */
interface MapLabelsProps {
  mp: MapProjection;
  era: EraKey;
  /** 迭代 6：主诗人所属朝代，决定展示唐 / 宋哪一套「时代都会」 */
  dynasty: '唐' | '宋';
  k: number;
  /** 迭代 11：点击城市标注 → 打开「地点访客」面板（可选带入城市古称 / 今地作标题覆盖） */
  onPickPlace: (lng: number, lat: number, label?: string, modernLabel?: string) => void;
}

const MapLabels = memo(function MapLabels({ mp, era, dynasty, k, onPickPlace }: MapLabelsProps): JSX.Element {
  const regions = useMemo<Array<HistoricalRegion & { x: number; y: number }>>(() => {
    const list = era === 'tang' ? TANG_REGIONS : SONG_REGIONS;
    return list.map((r) => {
      const [x, y] = mp.project(r.lng, r.lat);
      return { ...r, x, y };
    });
  }, [mp, era]);

  // 迭代 6：时代都会随诗人朝代切换（唐诗人看唐都会，宋词人看宋都会）
  const cities = useMemo(
    () =>
      citiesOfDynasty(dynasty).map((c) => {
        const [x, y] = mp.project(c.lng, c.lat);
        return { ...c, x, y };
      }),
    [mp, dynasty],
  );

  // 迭代 7：地名整体放大（政区名 11→13.5，都会 9.5→12.5），提升可读性
  const regionFont = 13.5 / k;
  const cityFont = 12.5 / k;

  /**
   * 迭代 8 · 标注分级与避让（LOD + declutter）
   * 字号放大后，31—37 座都会的**双行**标注在 1× 下必定互相压盖。
   * 两级策略：
   * 1) 按缩放分级：缩得越小，只保留越重要的城市（都城 → 重镇 → 全部）；
   * 2) 贪心避让：按重要度依次放置，与已放置标注过近的直接跳过
   *    （点了还在，只是本轮不画文字，放大后自然露出）。
   */
  const cityLod = useMemo(() => {
    const maxRank = k < 1.6 ? 1 : k < 2.6 ? 2 : 3;
    // 阈值按屏幕像素折算到未缩放坐标；双行标注较高，故纵向留得更宽
    const minDist = 34 / k;
    // 都城（rank 1）必须始终可见——它们是最关键的空间锚点。
    // 都城彼此的间距要求放宽到近乎「只剔除完全重合」（如长安与洛阳、汴京与西京洛阳、
    // 南京应天、北京大名本就相近），确保不会因避让把最重要的城丢掉；
    // 真正需要避让的是密集的一般州府。
    const capDist = 8 / k;
    const capitals = cities.filter((c) => c.rank === 1);
    const kept = declutter(capitals, capDist);
    // 其余按重要度依次补位，需与所有已放置标注（含都城）保持完整间距
    const optional = cities
      .filter((c) => c.rank > 1 && c.rank <= maxRank)
      .sort((a, b) => a.rank - b.rank);
    for (const c of optional) {
      if (kept.every((k2) => Math.hypot(k2.x - c.x, k2.y - c.y) >= minDist)) kept.push(c);
    }
    return new Set(kept.map((c) => c.name));
  }, [cities, k]);

  // 政区名同样做一次轻量避让，避免小比例下道/路名互相叠字
  const regionKept = useMemo(() => {
    const kept = declutter(regions, 30 / k);
    return new Set(kept.map((r) => r.id));
  }, [regions, k]);

  // 今地副行仅在放大到一定程度后显示，进一步降低小比例下的视觉噪声
  const showModern = k >= 1.8;

  return (
    <g>
      {regions.map((r) => {
        const visible = regionKept.has(r.id);
        return (
          <g key={r.id}>
            <text
              x={r.x}
              y={r.y}
              textAnchor="middle"
              fontSize={regionFont}
              fill="#6E665B"
              fillOpacity={visible ? 0.9 : 0}
              style={{ fontFamily: 'inherit', letterSpacing: '0.08em', pointerEvents: 'none' }}
            >
              {r.name}
            </text>
            {r.note ? <title>{`${r.name}（${r.capital}）：${r.note}`}</title> : null}
          </g>
        );
      })}
      {/* 迭代 6：时代都会，古今双行标注（古称 + 今地）；迭代 8 加分级与避让；迭代 11 可点击 */}
      {cities.map((c) => {
        const withText = cityLod.has(c.name);
        const names = visitorNamesAt(c.lng, c.lat);
        return (
          <g
            key={`city-${c.name}`}
            style={{ cursor: 'pointer' }}
            onClick={() => onPickPlace(c.lng, c.lat, c.name, c.modern)}
            // 点击城市不触发地图拖拽
            onPointerDown={(e) => e.stopPropagation()}
            role="button"
            aria-label={`${c.name}（今${c.modern}），点击查看到过此地的诗人${
              names.length > 0 ? `：${names.join('、')}` : ''
            }`}
          >
            {/* 透明大圆：扩大点击热区，便于点中细小的城市锚点 */}
            <circle cx={c.x} cy={c.y} r={Math.max(9 / k, 3)} fill="transparent" stroke="none" />
            <circle
              cx={c.x}
              cy={c.y}
              r={(c.rank === 1 ? 2.4 : 1.6) / k}
              fill={c.rank === 1 ? '#A83232' : '#6E665B'}
              fillOpacity={c.rank === 1 ? 0.9 : 0.7}
            />
            {/* 第一行：古称 */}
            <text
              x={c.x + 4 / k}
              y={c.y - 1.5 / k}
              fontSize={cityFont}
              fill={c.rank === 1 ? '#A83232' : '#4A443C'}
              fillOpacity={withText ? 1 : 0}
              style={{ fontFamily: 'inherit', pointerEvents: 'none' }}
            >
              {c.name}
            </text>
            {/* 第二行：今地（小字、浅色，构成「古今双列」） */}
            {showModern ? (
              <text
                x={c.x + 4 / k}
                y={c.y + 7 / k}
                fontSize={cityFont * 0.84}
                fill="#8A8275"
                fillOpacity={withText ? 0.95 : 0}
                style={{ fontFamily: 'inherit', pointerEvents: 'none' }}
              >
                今{c.modern}
              </text>
            ) : null}
            {/* 迭代 11：城市提示补上「本图收录的诗人里，谁到过这里」（改用坐标归并，修正古称不一致） */}
            <title>
              {`${c.name}（今${c.modern}）${c.note ? `：${c.note}` : ''}${
                names.length > 0 ? `\n到过此地：${names.join('、')}` : '\n暂无收录诗人到访'
              }`}
            </title>
          </g>
        );
      })}
    </g>
  );
});

/* ============================================================
 * 单条诗人轨迹（含节点）
 *
 * 性能要点（迭代 1 · D）：
 * - 「未走过虚线」整段生成一次（useMemo，依赖诗人 + 投影）；
 * - 「已生长」路径每帧更新 d（段数少，O(段数) 成本低）；
 * - 箭头等离散派生只在 Math.floor(progress*段数) 变化时重算；
 * - 底图/标注层已由 memo 的 MapShapes / MapLabels 隔离，
 *   播放每帧只重渲染本层与主组件的年份展示位。
 * ============================================================ */
interface PoetTrackProps {
  poet: Poet;
  year: number;
  /** 迭代 5：由 TrackLayer 统一做过防重叠松弛后的屏幕点（不再在此处自行投影） */
  pts: Point[];
  k: number;
  dim: boolean;
  onPickNode: (poetId: string, node: LifeNode) => void;
  onNodeHover: (poet: Poet, node: LifeNode | null, e: React.MouseEvent | null) => void;
}

function PoetTrack({ poet, year, pts, k, dim, onPickNode, onNodeHover }: PoetTrackProps): JSX.Element {
  const { progress } = progressAt(poet.nodes, year);
  const activeIdx = activeNodeIndex(poet.nodes, year);

  // 全轨迹虚线（预示）：整段生成一次，不随播放变化
  const fullPath = useMemo(() => smoothPath(pts, 0.45), [pts]);

  // 已走过的轨迹：随时间生长（每帧 d 变化，但段数少、成本低）
  const grownPath = useMemo(() => growthPath(pts, progress, 0.45), [pts, progress]);

  // 已完成段上的方向箭头：仅在「已完成的整段数」变化时重算（整数门控，避免逐帧重排）
  const arrows = useMemo(() => {
    const out: { key: string; p: string; size: number }[] = [];
    const total = pts.length - 1;
    const pos = clamp(progress, 0, 1) * total;
    const done = Math.floor(pos);
    for (let i = 0; i < done; i++) {
      const mid: Point = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
      out.push({
        key: `${poet.id}-a${i}`,
        p: arrowPoints(mid, angleOf(pts[i], pts[i + 1]), 4.6 / k),
        size: 4.6 / k,
      });
    }
    return out;
  }, [pts, progress, poet.id, k]);

  // 悬停预览（迭代 1 · A.2）：透传给外层统一渲染 tooltip
  const handleEnter = useCallback(
    (node: LifeNode): React.MouseEventHandler => (e) => onNodeHover(poet, node, e),
    [onNodeHover, poet],
  );
  const handleLeave = useCallback(() => onNodeHover(poet, null, null), [onNodeHover, poet]);

  return (
    <g opacity={dim ? 0.82 : 1}>
      {/* 未走过的轨迹：虚线预示（整段缓存，仅一次生成） */}
      {fullPath ? (
        <path
          d={fullPath}
          fill="none"
          stroke={poet.avatarColor}
          strokeOpacity={0.16}
          strokeWidth={1.4}
          strokeDasharray="4 5"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}

      {/* 已走过的轨迹：随时间生长（每帧 d 变化，但段数少、成本低） */}
      {grownPath ? (
        <path
          d={grownPath}
          fill="none"
          stroke={poet.avatarColor}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: 'drop-shadow(0 1px 1px rgba(43,39,36,0.25))' }}
        />
      ) : null}

      {arrows.map((a) => (
        <polygon key={a.key} points={a.p} fill={poet.avatarColor} fillOpacity={0.85} />
      ))}

      {poet.nodes.map((node, i) => {
        const p = pts[i];
        const visited = i <= activeIdx;
        const isActive = i === activeIdx;
        const color = EVENT_COLOR[node.eventType];
        // 迭代 9 · 轮次 2：节点半径按「此地留下多少作品」加权，
        // 一眼就能看出哪些地方是这位诗人的创作重镇（如黄州之于苏轼）。
        const workCount = node.works.length;
        const isHub = isHubNode(workCount); // 创作重镇：额外的朱砂外环
        const r = nodeRadius(workCount, isActive) / k;
        return (
          <g
            key={node.id}
            transform={`translate(${p.x},${p.y})`}
            style={{ cursor: 'pointer' }}
            onClick={() => onPickNode(poet.id, node)}
            onMouseEnter={handleEnter(node)}
            onMouseMove={handleEnter(node)}
            onMouseLeave={handleLeave}
            // 迭代 3 · 键盘可达性：节点可 Tab 聚焦，Enter / 空格 等价于点击定位
            tabIndex={0}
            role="button"
            aria-label={`${poet.name} ${node.year}年 ${node.place}（今${node.modernPlace}），该地作品 ${node.works.length} 篇`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPickNode(poet.id, node);
              }
            }}
          >
            {/* 放大命中热区（迭代 1 · A.1）：透明大圆，扩大点击/拖拽命中范围 */}
            <circle r={Math.max(r * 1.8, 14 / k)} fill="transparent" stroke="none" />
            {/* 当前节点：朱砂脉冲光圈（A.3），与时间轴当前节点联动 */}
            {isActive ? (
              <circle
                className="ripple-ring"
                r={r}
                fill="none"
                stroke="#B03A2E"
                strokeWidth={1.6 / k}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              />
            ) : null}
            <circle
              r={r}
              fill={visited ? color : '#F5EFE1'}
              fillOpacity={visited ? 0.95 : 0.9}
              stroke={visited ? color : '#9A9186'}
              strokeWidth={1.4 / k}
            />
            {/* 迭代 9：创作重镇（此地 ≥3 篇）加一圈朱砂细环，与主圆形成「双环」 */}
            {isHub ? (
              <circle
                r={r + 3.2 / k}
                fill="none"
                stroke="#A83232"
                strokeOpacity={visited ? 0.85 : 0.4}
                strokeWidth={1.1 / k}
                strokeDasharray={`${2.2 / k} ${1.8 / k}`}
              />
            ) : null}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={(isActive ? 11 : 8.8) / k}
              fill={visited ? '#F5EFE1' : '#6E665B'}
              style={{ fontFamily: 'inherit', pointerEvents: 'none', userSelect: 'none' }}
            >
              {EVENT_GLYPH[node.eventType]}
            </text>
            {isActive ? (
              <text
                y={-13 / k}
                textAnchor="middle"
                fontSize={13.5 / k}
                fill="#2B2724"
                style={{ fontFamily: 'inherit', paintOrder: 'stroke', stroke: '#F5EFE1', strokeWidth: 3 / k }}
              >
                {/* 迭代 9：活跃节点标签补上「几篇作品」，把地点与作品数直接绑在一起 */}
                {`${node.year} · ${node.place}${workCount > 0 ? ` · ${workCount}篇` : ''}`}
              </text>
            ) : null}
            <title>
              {`${poet.name}｜${node.year}年（${node.era ?? ''}）｜${node.place}（${node.modernPlace}）\n${
                node.event
              }\n${workCount > 0 ? `此地留下 ${workCount} 篇：${node.works
                .slice(0, 3)
                .map((w) => w.title)
                .join('、')}${workCount > 3 ? ' 等' : ''}` : '此地未见系年作品'}`}
            </title>
          </g>
        );
      })}
    </g>
  );
}

/** 轨迹层：仅轨迹 + 节点，随年份高频更新；底图/标注层已被 memo 隔离 */
interface TrackLayerProps {
  poets: Poet[];
  years: number[];
  mp: MapProjection;
  k: number;
  onPickNode: (poetId: string, node: LifeNode) => void;
  onNodeHover: (poet: Poet, node: LifeNode | null, e: React.MouseEvent | null) => void;
  /** 迭代 5：是否显示「同地同时」的交游连线 */
  showLinks: boolean;
}

/* ============================================================
 * 交游连线层（迭代 5）
 * 从年谱数据推导「同一地点、时间相近」的交游关系：
 * 任意两位（可见）诗人，若各自有一个节点落在同一古地名、且年份相差 ≤3 年，
 * 即视为一次可能的交游/唱和，以虚线弧相连。
 * 连线随时间推进逐步显现——只有当双方都已「走到」该年份时才绘制，
 * 因此播放过程中能看到交游关系一条条浮现。
 * ============================================================ */
interface Link {
  key: string;
  d: string;
  mx: number;
  my: number;
  label: string;
}

function useSociableLinks(poets: Poet[], years: number[], mp: MapProjection, enabled: boolean): Link[] {
  return useMemo(() => {
    if (!enabled || poets.length < 2) return [];
    const out: Link[] = [];
    for (let a = 0; a < poets.length; a++) {
      for (let b = a + 1; b < poets.length; b++) {
        const pa = poets[a];
        const pb = poets[b];
        const ya = years[a] ?? pa.birthYear;
        const yb = years[b] ?? pb.birthYear;
        for (const na of pa.nodes) {
          // 双方都已到达该节点才连线（随时间推进逐步显现）
          if (na.year > ya) continue;
          for (const nb of pb.nodes) {
            if (nb.year > yb) continue;
            if (na.place !== nb.place) continue; // 同一古地名
            if (Math.abs(na.year - nb.year) > 3) continue; // 时间相近
            const [ax, ay] = mp.project(na.lng, na.lat);
            const [bx, by] = mp.project(nb.lng, nb.lat);
            // 用二次贝塞尔画一条轻微外凸的弧，避免与轨迹直线混淆
            const cx = (ax + bx) / 2 - (by - ay) * 0.16;
            const cy = (ay + by) / 2 + (bx - ax) * 0.16;
            out.push({
              key: `${na.id}~${nb.id}`,
              d: `M${ax.toFixed(2)},${ay.toFixed(2)}Q${cx.toFixed(2)},${cy.toFixed(2)} ${bx.toFixed(2)},${by.toFixed(2)}`,
              mx: (ax + bx) / 2 - (by - ay) * 0.16,
              my: (ay + by) / 2 + (bx - ax) * 0.16,
              label: `${na.place} ${Math.min(na.year, nb.year)}`,
            });
          }
        }
      }
    }
    return out;
  }, [poets, years, mp, enabled]);
}

function TrackLayer({ poets, years, mp, k, onPickNode, onNodeHover, showLinks }: TrackLayerProps): JSX.Element {
  /**
   * 迭代 5 · 节点防重叠：
   * 先把「所有可见诗人的全部节点」投影成点，统一做一次互斥松弛，
   * 再按原顺序切分回每位诗人。这样既解决同一诗人多次到访同一地的重合，
   * 也解决多位诗人同处一城（如李白杜甫同在长安/洛阳）时的互相压盖。
   * 偏移仅用于绘制，不写回数据。
   */
  const perPoetPts = useMemo<Point[][]>(() => {
    const raw: Point[] = [];
    for (const p of poets) {
      for (const n of p.nodes) {
        const [x, y] = mp.project(n.lng, n.lat);
        raw.push({ x, y });
      }
    }
    const spread = spreadPoints(raw, 15 / k);
    const out: Point[][] = [];
    let cursor = 0;
    for (const p of poets) {
      out.push(spread.slice(cursor, cursor + p.nodes.length));
      cursor += p.nodes.length;
    }
    return out;
  }, [poets, mp, k]);

  const links = useSociableLinks(poets, years, mp, showLinks);

  return (
    <g>
      {/* 迭代 5：交游连线（画在轨迹之下，避免遮挡节点） */}
      {links.map((l) => (
        <g key={l.key}>
          <path
            d={l.d}
            fill="none"
            stroke="#B28A3C"
            strokeOpacity={0.5}
            strokeWidth={1.3}
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={l.mx}
            y={l.my}
            textAnchor="middle"
            fontSize={10.5 / k}
            fill="#8A6A22"
            opacity={0.85}
            style={{ fontFamily: 'inherit', pointerEvents: 'none', paintOrder: 'stroke', stroke: '#F5EFE1', strokeWidth: 3 / k }}
          >
            {l.label}
          </text>
        </g>
      ))}

      {poets.map((poet, pi) => (
        <PoetTrack
          key={poet.id}
          poet={poet}
          year={years[pi] ?? poet.birthYear}
          pts={perPoetPts[pi] ?? []}
          k={k}
          dim={poets.length > 1}
          onPickNode={onPickNode}
          onNodeHover={onNodeHover}
        />
      ))}
    </g>
  );
}

/* ============================================================
 * 地图主组件
 * ============================================================ */
export default function MapCanvas(): JSX.Element {
  const state = useAppState();
  const { selectedPoets, primaryPoet } = useApp();
  const dispatch = useAppDispatch();

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 900, h: 620 });
  const [transform, setTransform] = useState<ViewTransform>(DEFAULT_TRANSFORM);
  // 飞行动画开关（迭代 1 · A.1）：true 时内层 <g> 启用 240ms transform 过渡
  const [animating, setAnimating] = useState(false);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 悬停预览（迭代 1 · A.2）：受控 state，容器内坐标
  const [hoverInfo, setHoverInfo] = useState<{
    poet: Poet;
    node: LifeNode;
    x: number;
    y: number;
  } | null>(null);

  const mp = useMapProjection(size.w, size.h, 22);

  // 容器尺寸自适应
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = (): void => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(280, rect.width), h: Math.max(280, rect.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 把任意变换夹紧到「地图始终可见」的范围（防拖出视口） */
  const clampView = useCallback(
    (t: ViewTransform): ViewTransform => clampTranslate(t, mp.contentBounds, size.w, size.h),
    [mp.contentBounds, size.w, size.h],
  );

  // 尺寸变化后，已存在的平移可能越界，需重新夹紧
  useEffect(() => {
    setTransform((t) => clampTranslate(t, mp.contentBounds, size.w, size.h));
  }, [mp.contentBounds, size.w, size.h]);

  // 滚轮缩放（需 passive:false 才能 preventDefault）
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      setAnimating(false); // 用户手动缩放时立即打断飞行动画
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0016);
      setTransform((t) => clampView(zoomAt(t, px, py, factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clampView]);

  /* 移动端 · 双指捏合缩放 + 单指拖拽（迭代 17）
   * 设计原则：
   *  - 单一指针：按下→拖拽平移（与旧行为一致）
   *  - 双指同时按下：取消拖拽，记录捏合起点（两指中点 + 起点距离），
   *    在 move 时按距离比放大 k，并让中点保持视觉位置不变（避免捏合时画面跳）。
   *  - 任一指抬起：若仍有 1 指保留，则把剩余那根作为新的拖拽起点（无缝继续）。
   * 使用 PointerEvent API（兼容 touch 与 mouse），不依赖浏览器 pinch-zoom 原生事件，
   * 保证跨设备一致。
   */
  const activePointerIds = useRef<number[]>([]);
  // 双指捏合起始：两指中点（屏幕坐标）+ 起点距离 + 当时的变换（k/offset）
  const pinchStart = useRef<{
    x: number;
    y: number;
    dist0: number;
    k0: number;
    tx0: number;
    ty0: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): void => {
      if (e.button !== 0) return;
      activePointerIds.current.push(e.pointerId);
      const active = activePointerIds.current;
      if (active.length === 2) {
        // 双指按下：取消单指拖拽，等 move 时记录捏合起点
        pinchStart.current = null;
      } else if (active.length === 1) {
        dragRef.current = {
          x: e.clientX,
          y: e.clientY,
          tx: transform.x,
          ty: transform.y,
        };
      }
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [transform.x, transform.y],
  );

  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  // 双指 move：需要追踪两根指的位置；存到 ref 以便从 e.target 获取
  const pointerPositions = useRef<Map<number, { x: number; y: number }>>(new Map());

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): void => {
      pointerPositions.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const activeIds = activePointerIds.current;
      if (activeIds.length >= 2) {
        // 双指捏合
        setAnimating(false);
        const positions: { x: number; y: number }[] = [];
        for (const pid of activeIds) {
          const p = pointerPositions.current.get(pid);
          if (p) positions.push(p);
        }
        if (positions.length < 2) return;
        const midX = (positions[0].x + positions[1].x) / 2;
        const midY = (positions[0].y + positions[1].y) / 2;
        const distNow = Math.hypot(positions[0].x - positions[1].x, positions[0].y - positions[1].y);

        // 第一次双指 move 时初始化 pinchStart（记录当时的变换 + 中点 + 距离）
        if (!pinchStart.current) {
          pinchStart.current = {
            x: midX,
            y: midY,
            dist0: distNow,
            k0: transform.k,
            tx0: transform.x,
            ty0: transform.y,
          };
          return;
        }

        const { k0, dist0, x: sx, y: sy, tx0, ty0 } = pinchStart.current;
        const ratio = distNow / (dist0 || 1);
        const kNew = clamp(k0 * ratio, MIN_SCALE, MAX_SCALE);
        // 基于捏合起点（k0 / tx0 / ty0）计算「起点中点对应的地图坐标」，
        // 再按新 kNew 把当前中点放回该地图点 → 视觉平滑不跳。
        const mapX = (sx - tx0) / k0;
        const mapY = (sy - ty0) / k0;
        const newOffsetX = midX - mapX * kNew;
        const newOffsetY = midY - mapY * kNew;
        setTransform(clampView({ k: kNew, x: newOffsetX, y: newOffsetY }));
        return;
      }

      // 单指拖拽
      const d = dragRef.current;
      if (!d) return;
      setAnimating(false);
      const next: ViewTransform = {
        k: transform.k,
        x: d.tx + (e.clientX - d.x),
        y: d.ty + (e.clientY - d.y),
      };
      setTransform(clampView(next));
    },
    [clampView, transform.k, transform.x, transform.y],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): void => {
      activePointerIds.current = activePointerIds.current.filter((pid) => pid !== e.pointerId);
      const remaining = activePointerIds.current.length;
      pointerPositions.current.delete(e.pointerId);
      if (remaining === 0) {
        dragRef.current = null;
        pinchStart.current = null;
      } else if (remaining === 1) {
        // 双指→单指：把剩下的指作为新的拖拽起点，避免跳变
        const pid = activePointerIds.current[0];
        const p = pointerPositions.current.get(pid);
        if (p) {
          dragRef.current = {
            x: p.x,
            y: p.y,
            tx: transform.x,
            ty: transform.y,
          };
        }
        pinchStart.current = null;
      }
    },
    [transform.x, transform.y],
  );

  const zoomBy = useCallback(
    (factor: number): void => {
      setAnimating(false);
      setTransform((t) => clampView(zoomAt(t, size.w / 2, size.h / 2, factor)));
    },
    [clampView, size.w, size.h],
  );

  const resetView = useCallback((): void => {
    // 复位也走平滑过渡
    setAnimating(true);
    setTransform(clampView(DEFAULT_TRANSFORM));
  }, [clampView]);

  /**
   * 平滑飞行到某经纬度点（迭代 1 · A.1 / B.1）：
   * 计算把目标点放到视口中央、2.2 倍缩放所需的变换，
   * 再用 240ms CSS transform 过渡平滑过去（用户拖拽/缩放会打断）。
   */
  const flyTo = useCallback(
    (lng: number, lat: number): void => {
      const [cx, cy] = mp.project(lng, lat);
      const k = 2.2;
      const target: ViewTransform = { k, x: size.w / 2 - cx * k, y: size.h / 2 - cy * k };
      setAnimating(true);
      // 动画结束（260ms）后关闭过渡，避免后续帧拖影
      if (animTimer.current) clearTimeout(animTimer.current);
      animTimer.current = setTimeout(() => setAnimating(false), 260);
      setTransform(clampView(target));
    },
    [mp, size.w, size.h, clampView],
  );

  /**
   * 保持当前缩放级别，把某经纬度点平滑平移到视口中央（迭代 4 · 自动跟随）。
   * 与 flyTo 的区别：不改变 k，避免播放过程中镜头忽远忽近。
   */
  const panTo = useCallback(
    (lng: number, lat: number): void => {
      const [cx, cy] = mp.project(lng, lat);
      const k = transform.k;
      const target: ViewTransform = { k, x: size.w / 2 - cx * k, y: size.h / 2 - cy * k };
      setAnimating(true);
      if (animTimer.current) clearTimeout(animTimer.current);
      animTimer.current = setTimeout(() => setAnimating(false), 260);
      setTransform(clampView(target));
    },
    [mp, size.w, size.h, transform.k, clampView],
  );

  /**
   * 迭代 5 · 导出当前地图为 PNG：
   * 把 SVG 序列化 → 转成 data URL → 用 canvas 以 2 倍分辨率绘制 → 触发下载。
   * 说明：SVG 内的文字使用系统字体，导出图与屏幕显示基本一致；
   *      外层的 HTML 浮层（tooltip、缩放按钮）不属于 SVG，不会被导出。
   */
  const exportPng = useCallback((): void => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(size.w));
    clone.setAttribute('height', String(size.h));
    const xml = new XMLSerializer().serializeToString(clone);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    const img = new Image();
    img.onload = (): void => {
      const scale = 2; // 2 倍分辨率，保证导出图清晰
      const canvas = document.createElement('canvas');
      canvas.width = size.w * scale;
      canvas.height = size.h * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#F5EFE1';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement('a');
      const year = Math.round(yearOf(state, primaryPoet.id));
      a.download = `${primaryPoet.name}_${year}年_行迹图.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  }, [size.w, size.h, state, primaryPoet]);

  /**
   * 迭代 6：响应「聚焦请求」（点击时代都会列表时派发），
   * 依赖只取 token，保证同一城市被重复点击时也能再次飞过去。
   */
  const focusToken = state.focus?.token;
  useEffect(() => {
    if (!state.focus || !focusToken) return;
    flyTo(state.focus.lng, state.focus.lat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken]);

  /** 迭代 11：点击城市标注 → 打开「地点访客」面板（dispatch 稳定，便于 MapLabels 的 memo） */
  const onPickPlace = useCallback(
    (lng: number, lat: number, label?: string, modernLabel?: string): void => {
      dispatch({ type: 'OPEN_PLACE', lng, lat, label, modernLabel });
    },
    [dispatch],
  );

  /**
   * 迭代 11：响应「地点访客」聚焦请求（点击城市 / 节点浮层时派发），
   * 依赖只取 token，保证同一地点被重复点击时也能再次飞过去。
   */
  const placeToken = state.placeDetail?.token;
  useEffect(() => {
    if (!state.placeDetail || !placeToken) return;
    flyTo(state.placeDetail.lng, state.placeDetail.lat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeToken]);

  /** 迭代 11：被点地点的访客详情（坐标归并） */
  const placeDetail = useMemo(
    () => (state.placeDetail ? placeDetailAt(state.placeDetail.lng, state.placeDetail.lat) : null),
    [state.placeDetail],
  );

  /**
   * 迭代 6 · 地图作品浮层：
   * 锁定节点（点击节点 / 作品墙定位）后，把作品就地呈现在该节点旁。
   * 位置由「节点投影坐标 × 当前变换」换算，并做边界收敛避免浮层被裁掉。
   * 迭代 13：浮层弹出后固定在视口内，不随地图缩放/平移移动；
   * 用户可拖拽浮层到任意位置；切换节点时重新计算初始位置。
   */
  const [popupDrag, setPopupDrag] = useState<{ left: number; top: number } | null>(null);
  const popupDragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);

  const popup = useMemo(() => {
    const lockedId = state.lockedNodeByPoet[primaryPoet.id];
    if (!lockedId) return null;
    const i = primaryPoet.nodes.findIndex((n) => n.id === lockedId);
    const node = primaryPoet.nodes[i];
    if (!node) return null;

    // 迭代 13：已拖拽过则保持拖拽位置（不随地图变换移动）
    if (popupDrag) {
      return {
        node,
        index: i,
        left: popupDrag.left,
        top: popupDrag.top,
        placement: 'down' as 'up' | 'down',
      };
    }

    const [px, py] = mp.project(node.lng, node.lat);
    const sx = px * transform.k + transform.x;
    const sy = py * transform.k + transform.y;

    const W = 340;
    const H = 400; // 浮层大致高度，用于判断向上还是向下弹
    // 默认画在节点右下方；若下方空间不足则翻到上方；左右超出则贴边收敛
    const placeUp = sy + 24 + H > size.h && sy - H - 24 >= 0;
    const left = Math.min(Math.max(sx + 18, 8), Math.max(size.w - W - 8, 8));
    const top = placeUp ? Math.max(sy - H - 18, 8) : Math.min(sy + 18, Math.max(size.h - 120, 8));

    return {
      node,
      index: i,
      left,
      top,
      placement: (placeUp ? 'up' : 'down') as 'up' | 'down',
    };
  }, [state.lockedNodeByPoet, primaryPoet, mp, transform, size, popupDrag]);

  /** 迭代 13：浮层拖拽起点（由 MapWorkPopup 的 header onPointerDown 触发） */
  const onPopupDragStart = useCallback(
    (e: React.PointerEvent, currentLeft: number, currentTop: number): void => {
      popupDragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: currentLeft, startTop: currentTop };
      setPopupDrag({ left: currentLeft, top: currentTop });
    },
    [],
  );

  /** 迭代 13：浮层拖拽中 */
  const onPopupDragMove = useCallback(
    (e: React.PointerEvent): void => {
      const d = popupDragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const w = 340;
      const newLeft = Math.min(Math.max(d.startLeft + dx, 0), Math.max(size.w - w, 0));
      const newTop = Math.min(Math.max(d.startTop + dy, 0), Math.max(size.h - 80, 0));
      setPopupDrag({ left: newLeft, top: newTop });
    },
    [size],
  );

  /** 迭代 13：浮层拖拽结束 */
  const onPopupDragEnd = useCallback((): void => {
    popupDragRef.current = null;
  }, []);

  /** 迭代 13：切换节点时重置拖拽位置（让浮层回到新节点的投影位置） */
  const prevLockedId = useRef<string | null>(null);
  useEffect(() => {
    const lockedId = state.lockedNodeByPoet[primaryPoet.id];
    if (lockedId !== prevLockedId.current) {
      prevLockedId.current = lockedId;
      setPopupDrag(null);
    }
  }, [state.lockedNodeByPoet, primaryPoet.id]);

  /** 节点点击：定位 + 平滑飞行 + 右面板自动展开该地最新作品（迭代 1 · A.1 / B.2） */
  const onPickNode = useCallback(
    (poetId: string, node: LifeNode): void => {
      dispatch({ type: 'SET_NODE', poetId, nodeId: node.id, year: node.year });
      flyTo(node.lng, node.lat);
      // 右面板同步展开该节点「最新一篇」作品（并入 expandedWorkIds）
      if (node.works.length > 0) {
        const latest = node.works[node.works.length - 1];
        dispatch({ type: 'ENSURE_WORK_EXPANDED', workId: latest.id });
      }
      setHoverInfo(null); // 点击后清除悬停预览
    },
    [dispatch, flyTo],
  );

  /** 悬停预览回调（迭代 1 · A.2）：由轨迹层上报，换算为容器内坐标并防出界 */
  const onNodeHover = useCallback(
    (poet: Poet, node: LifeNode | null, e: React.MouseEvent | null): void => {
      if (!node || !e || !wrapRef.current) {
        setHoverInfo(null);
        return;
      }
      const rect = wrapRef.current.getBoundingClientRect();
      setHoverInfo({
        poet,
        node,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [],
  );

  /**
   * 迭代 4 · 自动跟随的目标：主诗人「当前到达的节点」。
   * 仅在「正在播放 + 已开启跟随」时给出目标，否则为 undefined（不干预用户视角）。
   */
  const followTarget = useMemo(() => {
    if (!state.playing || !state.followPlay) return undefined;
    const main = primaryPoet;
    const i = activeNodeIndex(main.nodes, yearOf(state, main.id));
    const n: LifeNode | undefined = main.nodes[i];
    return n ? { id: n.id, lng: n.lng, lat: n.lat } : undefined;
  }, [state, primaryPoet]);

  /**
   * 迭代 4 · 播放自动跟随：
   * 推进到新节点时，若该节点已移出视口（留 60px 边距），则保持缩放级别把它平滑归中，
   * 避免「人已走出画面」却看不见。仅在「播放中 + 开启跟随」时有目标，手动操作不受干预。
   * 依赖只取节点 id：平移自身不会再次触发，避免循环。
   * 迭代 15 · 修复「轨迹完成后闪退」：
   * 跟随判定必须使用「当前实时变换」，而不能闭包捕获 effect 建立时的旧 transform。
   * 否则：播放中某帧跟随 panTo 后 transform 已更新，但闭包仍持有旧值，
   * 下一节点再次判定时会基于过期坐标误判「出界」→ 反复 panTo → 画面剧烈跳动。
   * 现在通过 transformRef 读取最新变换，保证每次判定都基于实时视口。
   */
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const followNodeId = followTarget?.id;
  const followLng = followTarget?.lng;
  const followLat = followTarget?.lat;
  useEffect(() => {
    if (!followNodeId || followLng === undefined || followLat === undefined) return;
    const t = transformRef.current;
    const [cx, cy] = mp.project(followLng, followLat);
    const sx = cx * t.k + t.x;
    const sy = cy * t.k + t.y;
    const margin = 60;
    const outside = sx < margin || sx > size.w - margin || sy < margin || sy > size.h - margin;
    if (outside) panTo(followLng, followLat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followNodeId]);

  // 迭代 1 · C.2：对比模式下可独立开关某位诗人的轨迹（隐藏者不绘制，但仍参与对照计算）
  const visiblePoets = useMemo(
    () => selectedPoets.filter((p) => !state.hiddenPoetIds.includes(p.id)),
    [selectedPoets, state.hiddenPoetIds],
  );

  const years = useMemo(
    () => visiblePoets.map((p) => yearOf(state, p.id)),
    [visiblePoets, state],
  );

  /** 悬停预览 tooltip 内容（迭代 1 · A.2）：诗人 · 年份 · 古称（今地） · 该地作品数 */
  const hoverTip = hoverInfo
    ? {
        x: Math.min(hoverInfo.x + 16, Math.max(size.w - 230, 0)),
        y: Math.min(hoverInfo.y + 16, Math.max(size.h - 96, 0)),
        lines: [
          `${hoverInfo.poet.name} · ${hoverInfo.node.year} 年`,
          `${hoverInfo.node.place}（今 ${hoverInfo.node.modernPlace}）`,
          `该地作品 ${hoverInfo.node.works.length} 篇`,
        ],
        color: hoverInfo.poet.avatarColor,
      }
    : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="map-surface absolute inset-0"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={resetView}
      >
        <defs>
          <filter id="paper-noise" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="n" />
            <feColorMatrix in="n" type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.055" />
            </feComponentTransfer>
          </filter>
        </defs>

        <rect x={0} y={0} width={size.w} height={size.h} fill="#F5EFE1" />
        <rect x={0} y={0} width={size.w} height={size.h} filter="url(#paper-noise)" opacity={0.55} />

        <g
          style={animating ? { transition: 'transform 240ms ease-out' } : undefined}
          transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
        >
          <MapShapes mp={mp} era={state.era} />
          <MapLabels mp={mp} era={state.era} dynasty={primaryPoet.dynasty} k={transform.k} onPickPlace={onPickPlace} />
          <TrackLayer
            poets={visiblePoets}
            years={years}
            mp={mp}
            k={transform.k}
            onPickNode={onPickNode}
            onNodeHover={onNodeHover}
            showLinks={state.showLinks}
          />
        </g>
      </svg>

      {/* 悬停预览 tooltip（迭代 1 · A.2）：水墨配色（宣纸底/墨字/朱砂作品数），跟随鼠标且不出界 */}
      {hoverTip ? (
        <div
          className="pointer-events-none absolute z-20 max-w-[230px] rounded-sm border border-ink-4/40 bg-paper/95 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-2 shadow-sm"
          style={{ left: hoverTip.x, top: hoverTip.y }}
        >
          <div className="flex items-baseline gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full align-middle"
              style={{ background: hoverTip.color }}
            />
            <span className="font-kai text-[13px] text-ink">{hoverTip.lines[0]}</span>
          </div>
          <div className="mt-0.5 text-ink-3">{hoverTip.lines[1]}</div>
          <div className="mt-0.5 text-cinnabar">{hoverTip.lines[2]}</div>
        </div>
      ) : null}

      {/* 迭代 6：作品就地呈现在地图上（点击足迹节点后弹出） */}
      {popup ? (
        <MapWorkPopup
          poet={primaryPoet}
          node={popup.node}
          left={popup.left}
          top={popup.top}
          placement={popup.placement}
          year={yearOf(state, primaryPoet.id)}
          hasPrev={popup.index > 0}
          hasNext={popup.index < primaryPoet.nodes.length - 1}
          onClose={() => dispatch({ type: 'CLEAR_NODE', poetId: primaryPoet.id })}
          onPrev={() => {
            const prev = primaryPoet.nodes[popup.index - 1];
            if (prev) onPickNode(primaryPoet.id, prev);
          }}
          onNext={() => {
            const next = primaryPoet.nodes[popup.index + 1];
            if (next) onPickNode(primaryPoet.id, next);
          }}
          onDragStart={(e, l, t) => onPopupDragStart(e, l, t)}
          onDragMove={(e) => onPopupDragMove(e)}
          onDragEnd={() => onPopupDragEnd()}
        />
      ) : null}

      {/* 迭代 11：地点访客面板（点击城市标注或节点浮层里的「查看此地来过的人」后弹出） */}
      {placeDetail ? (
        <PlaceVisitorsPanel
          detail={placeDetail}
          overrideName={state.placeDetail?.label}
          overrideModern={state.placeDetail?.modernLabel}
          onClose={() => dispatch({ type: 'CLOSE_PLACE' })}
          onSelectPoet={(poetId) => {
            dispatch({ type: 'SELECT_POET', id: poetId });
            dispatch({ type: 'CLOSE_PLACE' });
          }}
        />
      ) : null}

      {/* 缩放控制 */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        {/* 迭代 12：地图全屏 / 退出全屏（全屏后仍保留本控件与时间轴的播放按钮） */}
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_FULLSCREEN', value: !state.mapFullscreen })}
          className={`flex h-8 items-center justify-center rounded border shadow-sm transition ${
            state.mapFullscreen
              ? 'border-cinnabar bg-cinnabar px-2 text-paper hover:bg-cinnabar/90'
              : 'w-8 border-ink-4/50 bg-paper/85 text-ink-2 hover:bg-paper-2'
          }`}
          title={
            state.mapFullscreen
              ? '退出全屏（也可按 Esc）'
              : '地图全屏：隐藏名录与右栏，保留播放 / 年份 / 缩放等主要操作'
          }
        >
          {state.mapFullscreen ? '✕ 退出' : '⛶'}
        </button>
        {/* 迭代 12：背景音乐入口。全屏模式下顶栏被隐藏，这里保留一个开关，
            与顶栏按钮同读 state.bgmOn，两者状态天然同步。 */}
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_BGM' })}
          className={`flex h-8 w-8 items-center justify-center rounded border shadow-sm transition ${
            state.bgmOn
              ? 'border-cinnabar/60 bg-cinnabar/15 text-cinnabar hover:bg-cinnabar/25'
              : 'border-ink-4/50 bg-paper/85 text-ink-2 hover:bg-paper-2'
          }`}
          title={state.bgmOn ? '关闭背景音乐（古琴风）' : '开启背景音乐（古琴风）'}
        >
          <span className={state.bgmOn ? '' : 'line-through opacity-60'}>♪</span>
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1.45)}
          className="h-8 w-8 rounded border border-ink-4/50 bg-paper/85 text-ink-2 shadow-sm transition hover:bg-paper-2"
          title="放大"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.45)}
          className="h-8 w-8 rounded border border-ink-4/50 bg-paper/85 text-ink-2 shadow-sm transition hover:bg-paper-2"
          title="缩小"
        >
          －
        </button>
        <button
          type="button"
          onClick={resetView}
          className="h-8 w-8 rounded border border-ink-4/50 bg-paper/85 text-ink-2 shadow-sm transition hover:bg-paper-2"
          title="复位（也可双击地图）"
        >
          ⌾
        </button>
        {/* 迭代 5：导出当前行迹图为 PNG */}
        <button
          type="button"
          onClick={exportPng}
          className="h-8 w-8 rounded border border-ink-4/50 bg-paper/85 text-ink-2 shadow-sm transition hover:bg-paper-2"
          title="导出当前行迹图为 PNG（2 倍分辨率）"
        >
          ⤓
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-ink-4">
        滚轮缩放 · 拖拽平移 · 双击复位 · 点击节点定位 · 点击城市查访客 · 悬停预览 · 当前缩放 {transform.k.toFixed(1)}×（
        {MIN_SCALE}–{MAX_SCALE}）
      </div>
    </div>
  );
}
