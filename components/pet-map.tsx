'use client';

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

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
  /**
   * 현위치 조회 실패 메시지. null 이면 표시 안 함.
   * 조용히 무시하지 않고 사용자에게 알린다(권한 거부·위치 불가·시간초과를 구분).
   */
  const [geoError, setGeoError] = useState<string | null>(null);

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
      // 기본 저작권(우하단)을 끄고 왼쪽에 다시 단다. 데스크톱 지도뷰에서 상세 패널이
      // 오른쪽 전체(top-3 bottom-3 right-3)를 덮어 우측 컨트롤을 가리기 때문이다.
      attributionControl: false,
      // CARTO 글리프 서버에 한글이 없어 라벨이 통째로 안 보인다. 브라우저 폰트로 그린다.
      localIdeographFontFamily: "'Noto Sans KR', sans-serif",
    });
    mapRef.current = map;
    // 줌·현위치·저작권을 모두 **왼쪽**에 둔다.
    // 왜: 상세 패널이 지도 오른쪽에 떠서(데스크톱 지도뷰) 우측 컨트롤과 겹친다 —
    // 사용자 제보처럼 패널 닫기(×)가 줌 +/− 와 붙어 보였다. 컨트롤을 없애면 줌·저작권을
    // 잃으므로, 패널이 안 가리는 왼쪽으로 옮겨 둘 다 보이고 누를 수 있게 한다.
    // 모바일은 상세가 하단 시트라 왼쪽/오른쪽 어느 쪽이든 안 겹치지만, 코너를 하나로 통일한다.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    /*
     * 현위치 버튼(◎). **사용자가 눌렀을 때만** 권한을 요청한다(자동 팝업 안 함 — 거부율↑·무례).
     * 성공 시 maplibre 가 위치 점 + **정확도 원**(showAccuracyCircle)을 그리고 그 주변으로
     * 이동한다 — 정확도가 낮으면 원이 크게 보여 "정확한 척"을 안 하게 된다. 위치는 브라우저
     * 안에서만 쓰고 **서버로 보내지 않는다**(개인정보). HTTPS 에서만 동작한다(프로덕션 OK).
     * timeout 을 줘야 code 3(시간초과)이 뜰 수 있다 — 안 주면 무한 대기한다.
     */
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 10000 },
      showAccuracyCircle: true,
      trackUserLocation: false,
    });
    map.addControl(geolocate, 'top-left');
    // 성공하면 이전 오류 메시지를 지운다.
    geolocate.on('geolocate', () => setGeoError(null));
    // 실패는 조용히 넘기지 않는다. code 1=거부, 2=위치 불가, 3=시간초과.
    geolocate.on('error', (e: GeolocationPositionError) => {
      setGeoError(
        e?.code === 1
          ? '위치 권한이 거부되었습니다. 브라우저 설정에서 허용할 수 있어요.'
          : e?.code === 3
            ? '위치 확인이 시간 초과됐습니다. 잠시 후 다시 시도해 주세요.'
            : '현재 위치를 확인할 수 없습니다.',
      );
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

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

      {/* 현위치 조회 실패 토스트. 앱은 계속 동작하고, 왜 안 됐는지만 담담하게 알린다. */}
      {geoError && (
        <div className="absolute inset-x-3 bottom-3 z-10 flex items-start gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
          <span className="flex-1 text-muted-foreground">{geoError}</span>
          <button
            type="button"
            onClick={() => setGeoError(null)}
            aria-label="닫기"
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
