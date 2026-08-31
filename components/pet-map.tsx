'use client';

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

import { accessTone, type Spot } from '@/lib/pet';

import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * 전국 반려동물 동반 지점 지도.
 *
 * 형제앱 gofish 의 spot-map 은 49개 점이라 전부 개별 마커로 찍었지만, 이 앱은 9천여
 * 지점이라 그대로 찍으면 라벨이 서로 뭉개지고 팬/줌이 버벅인다. 그래서 maplibre 내장
 * **클러스터링**을 쓴다 — 줌아웃에서는 묶음(개수), 확대하면 개별 점으로 풀린다.
 *
 * 목록과 **같은 필터 결과**(`spots`)를 받는다. 지도가 스스로 필터링하면 목록과 어긋난다.
 * 마커 색은 `accessTone` 한 곳에서만 가져온다 — 지도만 따로 팔레트를 두면 범례가 거짓말이 된다.
 */

/** 키가 필요 없는 CARTO 다크 베이스맵. gofish 에서 연안 타일 200 확인된 것. */
const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/** 남한 전역 bbox. 여백은 fitBounds 의 padding 으로만 준다. */
const KOREA_BOUNDS: [[number, number], [number, number]] = [
  [125.9, 33.1],
  [129.6, 38.6],
];

const FIT_PADDING = { top: 24, right: 24, bottom: 48, left: 24 };
const SOURCE = 'spots';

function toGeoJson(spots: Spot[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: spots.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: {
        id: s.id,
        title: s.title,
        access: s.access,
        // 색을 피처에 미리 넣는다. 지도 안 match 로 다시 매핑하면 배지 색과 갈라진다.
        color: accessTone(s.access).hex,
      },
    })),
  };
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function PetMap({
  spots,
  selectedId,
  onSelect,
  bottomInsetRatio = 0,
}: {
  spots: Spot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 아래에서부터 바텀시트가 덮는 높이 비율(0~1). 선택 지점을 보이는 쪽으로 옮길 때 쓴다. */
  bottomInsetRatio?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const spotsRef = useRef(spots);
  const bottomInsetRef = useRef(bottomInsetRatio);

  useEffect(() => void (onSelectRef.current = onSelect), [onSelect]);
  useEffect(() => void (spotsRef.current = spots), [spots]);
  useEffect(() => void (bottomInsetRef.current = bottomInsetRatio), [bottomInsetRatio]);

  /* 지도 생성 — 한 번만. */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds: KOREA_BOUNDS,
      fitBoundsOptions: { padding: FIT_PADDING },
      minZoom: 4,
      maxZoom: 16,
      attributionControl: { compact: true },
      // CARTO 글리프 서버에 한글이 없어 라벨이 통째로 안 보인다. 브라우저 폰트로 그린다.
      localIdeographFontFamily: "'Noto Sans KR', sans-serif",
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right');

    map.on('load', () => {
      map.addSource(SOURCE, {
        type: 'geojson',
        data: toGeoJson(spotsRef.current),
        cluster: true,
        // 확대할수록 잘게 풀린다. 14 이상에서는 개별 점.
        clusterMaxZoom: 13,
        // 픽셀 반경. 작으면 겹침이 남고, 크면 서로 먼 점이 한 묶음으로 뭉친다. 도시 밀도 기준 50.
        clusterRadius: 50,
      });

      // 클러스터 원 — 개수에 따라 크기·색 단계.
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#3b82f6', 25, '#2563eb', 100, '#1d4ed8',
          ],
          'circle-radius': ['step', ['get', 'point_count'], 16, 25, 22, 100, 30],
          'circle-opacity': 0.85,
          'circle-stroke-color': '#0b0f19',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: SOURCE,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });

      // 선택 강조 — 개별 점 아래에 흰 테두리.
      map.addLayer({
        id: 'spot-selected',
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 11,
          'circle-color': 'transparent',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });

      // 개별 점 — 동반 유형 색.
      map.addLayer({
        id: 'spot-point',
        type: 'circle',
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 8],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.9,
          'circle-stroke-color': '#0b0f19',
          'circle-stroke-width': 1.5,
        },
      });

      // 충분히 확대됐을 때만 이름 라벨(줌아웃에서 9천개 라벨은 무의미).
      map.addLayer({
        id: 'spot-label',
        type: 'symbol',
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        minzoom: 12,
        layout: {
          'text-field': ['get', 'title'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-max-width': 8,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#e5e7eb',
          'text-halo-color': '#0b0f19',
          'text-halo-width': 1.2,
        },
      });

      loadedRef.current = true;
      map.getSource<maplibregl.GeoJSONSource>(SOURCE)?.setData(toGeoJson(spotsRef.current));
    });

    // 클러스터 클릭 → 그 클러스터가 풀리는 줌으로 확대.
    map.on('click', 'clusters', async (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
      const clusterId = f?.properties?.cluster_id;
      if (clusterId == null) return;
      const src = map.getSource<maplibregl.GeoJSONSource>(SOURCE);
      const zoom = await src?.getClusterExpansionZoom(clusterId);
      const geom = f.geometry as GeoJSON.Point;
      map.easeTo({ center: geom.coordinates as [number, number], zoom: (zoom ?? map.getZoom()) + 0.2 });
    });

    map.on('click', 'spot-point', (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) onSelectRef.current(id);
    });
    map.on('click', 'spot-label', (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) onSelectRef.current(id);
    });

    for (const layer of ['clusters', 'spot-point', 'spot-label']) {
      map.on('mouseenter', layer, () => void (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => void (map.getCanvas().style.cursor = ''));
    }

    // 컨테이너가 0x0 일 때 생성되면 줌이 굳는다. 실제 크기를 얻은 뒤 한 번 더 맞춘다.
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 1 || box.height < 1) return;
      map.resize();
      if (fittedRef.current) return;
      fittedRef.current = true;
      map.fitBounds(KOREA_BOUNDS, { padding: FIT_PADDING, duration: 0 });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      fittedRef.current = false;
    };
  }, []);

  /* 필터 결과가 바뀌면 소스를 갈아 끼운다. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.getSource<maplibregl.GeoJSONSource>(SOURCE)?.setData(spots.length ? toGeoJson(spots) : EMPTY);
  }, [spots]);

  /* 선택 강조 + 화면으로 끌어오기. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.setFilter('spot-selected', ['==', ['get', 'id'], selectedId ?? '']);
    if (!selectedId) return;
    const hit = spotsRef.current.find((s) => s.id === selectedId);
    if (!hit) return;

    const el = map.getContainer();
    const visibleBottom = el.clientHeight * (1 - bottomInsetRef.current);
    const margin = 44;
    if (visibleBottom < margin * 3) return;
    const p = map.project([hit.lon, hit.lat]);
    const visible =
      p.x >= margin && p.x <= el.clientWidth - margin && p.y >= margin && p.y <= visibleBottom - margin;
    // 선택 지점이 안 보이면 가운데로. 줌이 낮아 클러스터에 묻혀 있으면 최소 12까지 확대해 점을 드러낸다.
    const targetZoom = Math.max(map.getZoom(), 12);
    if (visible && map.getZoom() >= 12) return;
    map.easeTo({ center: [hit.lon, hit.lat], zoom: targetZoom, duration: 500 });
  }, [selectedId]);

  return (
    <div className="relative size-full">
      {/* maplibre-gl.css 가 position:relative 를 걸어 inset-0 을 이긴다. 크기는 size-full 로 직접 준다. */}
      <div ref={containerRef} className="size-full" />
    </div>
  );
}
