import { useMemo } from 'react';
import {
  geoConicEqualArea,
  geoPath,
  type GeoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from 'd3-geo';
import { chinaGeo, type ChinaFeatureCollection, type ProvinceProps } from '../data/chinaGeo';
import type { Feature, Geometry } from 'geojson';

export interface MapProjection {
  projection: GeoProjection;
  path: GeoPath;
  /** 生成某个省/区域要素的 SVG path */
  featurePath: (feature: Feature<Geometry, ProvinceProps>) => string;
  /** 生成整个 FeatureCollection 的 SVG path */
  collectionPath: (collection: ChinaFeatureCollection) => string;
  /** 经纬度 → 屏幕坐标（投影后，未含缩放平移） */
  project: (lng: number, lat: number) => [number, number];
  /**
   * 整幅地图在「未缩放平移」时的屏幕包围盒 [[x0,y0],[x1,y1]]。
   * 用于给平移加边界约束，防止地图被拖出视口。
   */
  contentBounds: [[number, number], [number, number]];
}

/**
 * 构建适合中国版图的 Albers 等积圆锥投影，并自适应容器尺寸。
 * 中央经线 105°E，双标准纬线 25°N / 47°N（中国制图常用参数）。
 */
export function useMapProjection(width: number, height: number, padding = 20): MapProjection {
  return useMemo(() => {
    const w = Math.max(240, width);
    const h = Math.max(240, height);
    const projection = geoConicEqualArea()
      .parallels([25, 47])
      .rotate([-105, 0])
      .fitExtent(
        [
          [padding, padding],
          [w - padding, h - padding],
        ],
        chinaGeo as unknown as GeoPermissibleObjects,
      );
    const path = geoPath(projection);

    const featurePath = (feature: Feature<Geometry, ProvinceProps>): string =>
      path(feature as unknown as GeoPermissibleObjects) ?? '';

    const collectionPath = (collection: ChinaFeatureCollection): string =>
      path(collection as unknown as GeoPermissibleObjects) ?? '';

    const project = (lng: number, lat: number): [number, number] => {
      const p = projection([lng, lat]);
      return p ? [p[0], p[1]] : [0, 0];
    };

    // 整幅地图的屏幕包围盒（必须在 fitExtent 之后计算）
    const bounds = path.bounds(chinaGeo as unknown as GeoPermissibleObjects);
    const contentBounds: [[number, number], [number, number]] = [
      [bounds[0][0], bounds[0][1]],
      [bounds[1][0], bounds[1][1]],
    ];

    return { projection, path, featurePath, collectionPath, project, contentBounds };
  }, [width, height, padding]);
}
