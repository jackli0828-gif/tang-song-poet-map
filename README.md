# 唐宋词人时空轨迹图（Tang–Song Poet Map）

> 人 — 时间 — 地点 — 作品，一一对应。

一个**完全离线**的唐宋诗人词人时空轨迹可视化网站：内置中国矢量地图（不调用任何在线地图瓦片 / 地图 SDK），
以 d3-geo 投影自行渲染 SVG 底图，把 14 位唐宋大家的年谱节点连成轨迹，
沿时间轴播放时逐节点推进，并在右侧同步呈现「此地此际所作」的作品。

## 快速开始

```bash
npm install                 # 若索引异常：npm install --registry=https://registry.npmmirror.com
npm run dev                 # 开发服务器
npm run build               # tsc --noEmit + vite build
npm run typecheck           # 仅类型检查
```

## 功能

| 功能 | 说明 |
| --- | --- |
| 内置离线地图 | 省级边界 + 黄河 / 长江 / 渭水 / 汉水 / 大运河 + 古今都会标注；支持滚轮缩放、拖拽平移、双击复位 |
| 诗人名录 | 14 位（唐 8 家、宋 6 家），可按朝代筛选、关键词搜索；单击选中，勾选（≤3）进入对比模式 |
| 轨迹绘制 | 按年份顺序连线，带方向箭头；节点以「生 /游 /仕 /贬 /隐 /交 /卒」七类字形与颜色区分 |
| 时间轴播放 | 播放 / 暂停、0.5x—2x 变速、拖动或点击年份跳转、节点刻度精确定位；当前节点有脉冲动画，轨迹按进度「生长」 |
| 人—时—地—作品联动 | 右侧面板显示年号纪年、年龄、古称（今地）、事件描述与该地该时的作品（体裁、名句、全文、创作背景） |
| 作品总览 | 按创作时间倒序列出全部作品，点击条目反向定位回地图节点 |
| 多诗人对比 | 轨迹叠加；对照时间线展示「同一年，谁在哪里，写了什么」；可同步到同一年份 |
| 唐宋底图切换 | 唐（开元十五道）/ 宋（路制）两种淡设色示意底图 |

## 技术栈

- Vite + React 18 + TypeScript（strict）
- Tailwind CSS v3（宣纸 / 墨色 / 朱砂 主题，light only）
- d3-geo（Albers 等积圆锥投影 + 路径生成）
- 状态：React Context + useReducer（无 Redux）
- 动画：CSS animation + requestAnimationFrame（无重型动画库）

## 目录结构

```
src/
  main.tsx / App.tsx / index.css / types.ts
  data/
    china-geo.json      # 内置中国省级边界（含南海诸岛断续线）
    chinaGeo.ts         # 类型化封装 + 合规声明
    poets.ts            # 14 位诗人词人年谱与作品（核心数据）
    rivers.ts           # 黄河、长江等水系折线
    regions.ts          # 唐十五道 / 宋路制简化示意与古今都会
  components/
    MapCanvas.tsx  Timeline.tsx  PoetSidebar.tsx
    WorkPanel.tsx  WorksGallery.tsx  CompareView.tsx
    TopBar.tsx  Legend.tsx（EraSwitch 位于 TopBar.tsx）
  hooks/  useMapProjection.ts  useTimelinePlayer.ts
  utils/  geo.ts（投影/平滑/进度）  format.ts（年号纪年）
  store/  PoetContext.tsx
```

## 地图数据与合规

- 数据来源：**阿里云 DataV.GeoAtlas**
  `https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json`
  （依国家标准底图绘制）。
- 处理方式：Douglas-Peucker 抽稀（容差 0.02°）+ 坐标保留 3 位小数，体积约 200 KB，随包内置。
- 领土完整性：完整绘制中国台湾省、海南省、香港特别行政区、澳门特别行政区及**南海诸岛**（断续线）；
  不使用任何境外地图瓦片或在线地图 SDK，不裁剪、不割裂任何中国领土要素。
- 唐宋政区为**简化示意**：仅以「现代省级面 → 历史道 / 路」的归属映射做淡设色与标注，
  不追求精确疆界；唐之吐蕃、渤海，宋之辽、西夏、大理等以「邻蕃 / 羁縻」单独标注说明，
  中国版图完整呈现。

## 史实说明

年谱节点依据两《唐书》、《宋史》本传及学界通行年谱整理；
作品系年凡有异说者，均在 `background` 或 `note` 中标明「一说……」或注明「系年存疑」，不以一说冒充定论。
