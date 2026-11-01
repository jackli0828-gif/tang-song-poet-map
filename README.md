# 唐宋词人时空轨迹图（Tang–Song Poet Map）

> 人 — 时间 — 地点 — 作品，一一对应。

**在线地址：<https://jackli0828-gif.github.io/tang-song-poet-map/>**

推送 `main` 即由 GitHub Actions 自动构建并发布（`.github/workflows/deploy.yml`）。
注意：GitHub Pages 免费账户**不支持私有仓库**，本仓库须保持 public 才能部署。

一个**完全离线**的唐宋诗人词人时空轨迹可视化网站：内置中国矢量地图（不调用任何在线地图瓦片 / 地图 SDK），
以 d3-geo 投影自行渲染 SVG 底图，把 474 位唐宋诗人词人的 1636 个年谱节点连成轨迹，
沿时间轴播放时逐节点推进，并在右侧同步呈现「此地此际所作」的作品（基础语料 847 篇，
并入辞典补录后共 2066 篇）。

## 快速开始

```bash
npm install                 # 若索引异常：npm install --registry=https://registry.npmmirror.com
npm run dev                 # 开发服务器
npm run build               # 入口检查 → tsc --noEmit → vite build
npm run typecheck           # 仅类型检查
npm run check:data          # 数据体检（id 唯一 / 生卒自洽 / 坐标 / 引用 / 名句与全文一致）
npm run check:entry         # 构建入口守卫
npm run check:meta          # 名录索引是否与诗人数据同步（改了 poets*.ts 就要跑 gen:meta）
npm run check:geo           # 地图打包数据是否与源 GeoJSON 同步
npm run gen:meta            # 重新生成 src/data/poets-meta.ts
npm run gen:geo             # 重新生成 src/data/china-geo.packed.json
npm run verify              # 以上全部跑一遍（提交前建议执行）
```

> **⚠️ 构建入口约定**：`index.html` 里的 `<script type="module">` 必须指向 `/src/main.tsx`，
> **不能**指向 `./assets/index-*.js`。一旦指向产物，vite 会把旧 bundle 当入口重新打包，
> `src/` 下的改动全部不进入产物，而且构建不报错、部署也显示成功（历史上曾因此丢失 319 位诗人）。
> `npm run build` 会自动执行 `scripts/check-entry.mjs` 拦截这种情况，根目录也不再存放预构建产物。

## 功能

| 功能 | 说明 |
| --- | --- |
| 内置离线地图 | 省级边界 + 黄河 / 长江 / 渭水 / 汉水 / 大运河 + 古今都会标注；支持滚轮缩放、拖拽平移、双击复位 |
| 诗人名录 | 474 位（唐 182 家、宋 292 家），可按朝代筛选、关键词搜索；单击选中，勾选（≤3）进入对比模式 |
| 轨迹绘制 | 按年份顺序连线，带方向箭头；节点以「生 /游 /仕 /贬 /隐 /交 /卒」七类字形与颜色区分 |
| 时间轴播放 | 播放 / 暂停、0.5x—2x 变速、拖动或点击年份跳转、节点刻度精确定位；当前节点有脉冲动画，轨迹按进度「生长」 |
| 人—时—地—作品联动 | 右侧面板显示年号纪年、年龄、古称（今地）、事件描述与该地该时的作品（体裁、名句、全文、创作背景） |
| 作品总览 | 按创作时间倒序列出全部作品，点击条目反向定位回地图节点 |
| 多诗人对比 | 轨迹叠加；对照时间线展示「同一年，谁在哪里，写了什么」；可同步到同一年份 |
| 唐宋底图切换 | 唐（开元十五道）/ 宋（路制）两种淡设色示意底图 |

## 技术栈

- Vite + React 18 + TypeScript（strict）
- Tailwind CSS v3（宣纸 / 墨色 / 朱砂 主题，明暗两套）
- d3-geo（Albers 等积圆锥投影 + 路径生成）
- 状态：React Context + useReducer（无 Redux），年份切片单独成 context 避免播放时全量重渲染
- 动画：CSS animation + requestAnimationFrame（无重型动画库）

## 数据两级加载

诗人详情（年谱节点 + 作品全文 + 小传）约 3.4 MB 源码 / **264 KB gzip**，是产物的绝对大头。
若与业务代码打在同一 chunk，等于「下载 400 KB 才能看到界面」，且任何 UI 改动都会让用户
把 264 KB 数据重下一次。因此拆成两级：

| 级别 | 文件 | 体积（gzip） | 加载方式 | 用途 |
| --- | --- | --- | --- | --- |
| 一级 · 名录索引 | `src/data/poets-meta.ts` | 12.4 KB | 同步，随主包 | 姓名 / 字号 / 籍贯 / 生卒 / 节点数 / 作品数 —— 名录、筛选、按名检索、顶栏统计 |
| 二级 · 年谱详情 | `src/data/poets.ts` | 263 KB | 动态 `import()` | 年谱节点、作品全文、小传 |
| 附 · 辞典补录 | `works-add` / `work-plink` | 249 KB | 动态 `import()` | 141 位已收录作者的 1219 篇补充作品 |

结果：首屏关键路径 **412 KB → 152 KB gzip**（-63%），界面先出来，年谱随后到。

约定（改代码时务必遵守）：

1. `src/data/poetStore.ts` 是唯一门面，**不得静态 import `./poets`**，否则拆分失效。
2. `poets-meta.ts` 由 `npm run gen:meta` 生成，**不要手改**；改了 `poets*.ts` 必须重跑，否则 `check:meta` 会失败。
3. 依赖年谱的组件必须挂在 `BootGate`（`src/components/BootGate.tsx`）之后 —— 它负责等数据、显示载入页与失败重试。
   这样下游组件永远拿到完整数据，不必各自处理 null。
4. 名录索引刻意不含 `brief`（小传）：474 条约 130 KB，会把索引撑大一倍。
   按小传关键词检索在详情载入后自动补上（见 `useFilteredPoets`），功能不丢。

## 目录结构

```
src/
  main.tsx / App.tsx / index.css / types.ts
  data/
    china-geo.packed.json  # 量化 + base36 编码后的地图数据（由 gen-geo 生成）
    chinaGeo.ts         # 解包 + 类型化封装 + 合规声明
    poets-meta.ts       # 名录索引（由 gen-poets-meta 生成，勿手改）
    poetStore.ts        # 两级数据门面：ensurePoetsLoaded / getPoets / 统计 / 补录
    poets.ts            # 474 位诗人词人年谱与作品（二级，动态加载）
    poets-t1..t4 / s1..s4 / x1.ts   # 年谱数据分片
    works-add.ts / work-plink.ts    # 辞典补录语料（异步分块）
    rivers.ts           # 黄河、长江等水系折线
    regions.ts          # 唐十五道 / 宋路制简化示意与古今都会
  components/
    BootGate.tsx        # 首屏闸门：载入页 / 失败重试
    MapCanvas.tsx  Timeline.tsx  PoetSidebar.tsx
    WorkPanel.tsx  WorksGallery.tsx  CompareView.tsx
    TopBar.tsx  Legend.tsx（EraSwitch 位于 TopBar.tsx）
  hooks/  useMapProjection.ts  useTimelinePlayer.ts  usePoetData.ts
  utils/  geo.ts（投影/平滑/进度）  format.ts（年号纪年）  search.ts（四维检索）
  store/  PoetContext.tsx
scripts/  check-entry.mjs  data-check.ts  gen-geo.mjs  gen-poets-meta.mjs
```

## 地图数据与合规

- 数据来源：**阿里云 DataV.GeoAtlas**
  `https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json`
  （依国家标准底图绘制）。
- 处理方式：Douglas-Peucker 抽稀（容差 0.02°）+ 坐标保留 3 位小数 + 坐标 ×1000 取整、
  环内增量、base36 编码，源文件约 202 KB → 打包后 **77.6 KB**（gzip 37 KB），随包内置。
  `npm run gen:geo` 生成、`npm run check:geo` 逐点校验（当前 11980 个点，误差 0）。
- 领土完整性：完整绘制中国台湾省、海南省、香港特别行政区、澳门特别行政区及**南海诸岛**（断续线）；
  不使用任何境外地图瓦片或在线地图 SDK，不裁剪、不割裂任何中国领土要素。
- 唐宋政区为**简化示意**：仅以「现代省级面 → 历史道 / 路」的归属映射做淡设色与标注，
  不追求精确疆界；唐之吐蕃、渤海，宋之辽、西夏、大理等以「邻蕃 / 羁縻」单独标注说明，
  中国版图完整呈现。

## 史实说明

年谱节点依据两《唐书》、《宋史》本传及学界通行年谱整理；
作品系年凡有异说者，均在 `background` 或 `note` 中标明「一说……」或注明「系年存疑」，不以一说冒充定论。
