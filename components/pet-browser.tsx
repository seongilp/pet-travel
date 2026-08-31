'use client';

import { List, Map as MapIcon, PawPrint, Search, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';

import { BottomSheet, SNAP_RATIO, type SheetSnap } from '@/components/bottom-sheet';
import { SpotCard, type SpotListItem } from '@/components/spot-card';
import { SpotDetail } from '@/components/spot-detail';
import { Skeleton } from '@/components/ui/skeleton';
import {
  accessTone,
  CONTENT_TYPE,
  SIDO_ORDER,
  typeLabel,
  type PetAccess,
} from '@/lib/pet';
import { useIsCompact } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/*
 * maplibre 는 무겁고 window 에 의존한다. ssr:false 로 지연 로딩한다.
 * (v5 를 쓴다 — v6 는 Turbopack 에서 워커 로딩이 조용히 실패한다.)
 */
const PetMap = dynamic(() => import('@/components/pet-map').then((m) => m.PetMap), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-xl" />,
});

/** 목록에 한 번에 그리는 최대 개수. 9천개를 통째로 그리면 스크롤이 버벅인다. */
const LIST_LIMIT = 120;

type View = 'list' | 'map';

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-visible:ring-ring shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card/60 text-muted-foreground hover:text-foreground hover:border-foreground/30',
      )}
    >
      {children}
    </button>
  );
}

export function PetBrowser({ spots, generatedAt }: { spots: SpotListItem[]; generatedAt: string }) {
  const [sido, setSido] = useState('');
  const [typeId, setTypeId] = useState('');
  const [access, setAccess] = useState<PetAccess | ''>('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');

  const isCompact = useIsCompact();
  const deferredQuery = useDeferredValue(query);

  // 어떤 시도가 데이터에 실제로 있는지 — 없는 칩을 만들지 않는다.
  const availableSido = useMemo(() => {
    const set = new Set(spots.map((s) => s.sido));
    return SIDO_ORDER.filter((s) => set.has(s));
  }, [spots]);

  const availableTypes = useMemo(() => {
    const set = new Set(spots.map((s) => s.typeId));
    return Object.keys(CONTENT_TYPE).filter((t) => set.has(t));
  }, [spots]);

  // 필터 적용. 지도와 목록이 **같은 결과**를 쓴다(어긋나면 안 된다).
  const filtered = useMemo(() => {
    const q = deferredQuery.trim();
    return spots.filter((s) => {
      if (sido && s.sido !== sido) return false;
      if (typeId && s.typeId !== typeId) return false;
      if (access && s.access !== access) return false;
      if (q && !s.title.includes(q) && !s.addr.includes(q)) return false;
      return true;
    });
  }, [spots, sido, typeId, access, deferredQuery]);

  const visible = filtered.slice(0, LIST_LIMIT);
  const selectedSpot = useMemo(
    () => spots.find((s) => s.id === selectedId) ?? null,
    [spots, selectedId],
  );

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setSheetSnap('half');
  }, []);
  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setSheetSnap('peek');
  }, []);

  /*
   * Esc 로 상세를 닫는다(모달·패널 표준 동작). 데스크톱 패널·모바일 시트 공통.
   *
   * 리스너는 상세가 열렸을 때만 붙이고 닫히면 뗀다 — 항상 붙여 두면 다른 Esc 소비처와
   * 경쟁한다. 입력창에 포커스가 있을 땐 가로채지 않는다: 검색창의 Esc 는 그 자리에서
   * 검색어를 지우는 게 자연스럽고(아래 input 의 onKeyDown), 패널을 닫아버리면 방금 친
   * 검색을 잃는다. ipyang/shortcuts 의 isTyping 가드와 같은 기준이다.
   */
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      const typing =
        t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable;
      if (typing) return;
      closeDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, closeDetail]);

  const hasFilter = Boolean(sido || typeId || access || query.trim());
  const resetFilters = useCallback(() => {
    setSido('');
    setTypeId('');
    setAccess('');
    setQuery('');
  }, []);

  const genDate = generatedAt.slice(0, 10);

  return (
    <div className="mx-auto flex h-dvh max-w-6xl flex-col">
      {/* 헤더 */}
      <header className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <PawPrint className="text-primary size-5" />
          <div>
            <h1 className="text-base leading-tight font-bold">멍냥로드</h1>
            <p className="text-muted-foreground text-[11px] leading-tight">
              반려동물 동반여행 지도 · {spots.length.toLocaleString()}곳
            </p>
          </div>
        </div>
        {/* 보기 전환 — 모바일 우선이라 목록이 기본. */}
        <div className="border-border bg-card/60 flex rounded-full border p-0.5">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium',
              view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            <List className="size-3.5" /> 목록
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            aria-pressed={view === 'map'}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium',
              view === 'map' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            <MapIcon className="size-3.5" /> 지도
          </button>
        </div>
      </header>

      {/* 필터 영역 */}
      <div className="border-border space-y-2 border-b px-4 py-2.5">
        {/* 검색 */}
        <div className="border-border bg-card/60 flex items-center gap-2 rounded-full border px-3 py-1.5">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // 검색창에서 Esc 는 검색어만 지운다(패널 닫기는 위 window 리스너가 타이핑 중엔 건드리지 않음).
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
            placeholder="장소·주소 검색"
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="검색어 지우기">
              <X className="text-muted-foreground size-4" />
            </button>
          )}
        </div>

        {/* 동반 유형 — 핵심 필터라 맨 위, 색을 칩에 얹는다. */}
        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          <Chip active={access === ''} onClick={() => setAccess('')}>
            전체
          </Chip>
          {(['all', 'part', 'unknown'] as PetAccess[]).map((a) => (
            <Chip key={a} active={access === a} onClick={() => setAccess(access === a ? '' : a)}>
              <span
                className="mr-1 inline-block size-1.5 rounded-full align-middle"
                style={{ backgroundColor: accessTone(a).hex }}
              />
              {accessTone(a).label}
            </Chip>
          ))}
        </div>

        {/* 지역 */}
        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          <Chip active={sido === ''} onClick={() => setSido('')}>
            전국
          </Chip>
          {availableSido.map((s) => (
            <Chip key={s} active={sido === s} onClick={() => setSido(sido === s ? '' : s)}>
              {s}
            </Chip>
          ))}
        </div>

        {/* 분류 */}
        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          <Chip active={typeId === ''} onClick={() => setTypeId('')}>
            모든 분류
          </Chip>
          {availableTypes.map((t) => (
            <Chip key={t} active={typeId === t} onClick={() => setTypeId(typeId === t ? '' : t)}>
              {typeLabel(t)}
            </Chip>
          ))}
        </div>

        {/* 결과 요약 */}
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>
            <b className="text-foreground">{filtered.length.toLocaleString()}</b>곳
            {filtered.length > LIST_LIMIT && view === 'list' && (
              <span> · 목록 상위 {LIST_LIMIT}곳 표시(지도는 전부)</span>
            )}
          </span>
          {hasFilter && (
            <button type="button" onClick={resetFilters} className="hover:text-foreground underline">
              필터 초기화
            </button>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="relative min-h-0 flex-1">
        {view === 'list' ? (
          <div className="flex h-full">
            {/* 목록 */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filtered.length === 0 ? (
                <EmptyState onReset={resetFilters} />
              ) : (
                <div className="space-y-2">
                  {visible.map((s) => (
                    <SpotCard
                      key={s.id}
                      spot={s}
                      selected={s.id === selectedId}
                      onClick={() => select(s.id)}
                    />
                  ))}
                  {filtered.length > LIST_LIMIT && (
                    <p className="text-muted-foreground py-3 text-center text-xs">
                      더 좁히려면 지역·분류·검색으로 필터하세요.
                    </p>
                  )}
                </div>
              )}
            </div>
            {/* 데스크톱: 우측 상세 패널 */}
            {!isCompact && selectedSpot && (
              <aside className="border-border bg-card w-96 shrink-0 border-l">
                <SpotDetail key={selectedSpot.id} spot={selectedSpot} onClose={closeDetail} />
              </aside>
            )}
          </div>
        ) : (
          <div className="relative size-full">
            <PetMap
              spots={filtered}
              selectedId={selectedId}
              onSelect={select}
              bottomInsetRatio={isCompact && selectedSpot ? SNAP_RATIO[sheetSnap] : 0}
            />
            {/* 데스크톱: 지도 위 우측 상세 패널 */}
            {!isCompact && selectedSpot && (
              <aside className="border-border bg-card absolute top-3 right-3 bottom-3 w-96 overflow-hidden rounded-2xl border shadow-xl">
                <SpotDetail key={selectedSpot.id} spot={selectedSpot} onClose={closeDetail} />
              </aside>
            )}
          </div>
        )}

        {/* 모바일: 바텀시트 상세(목록·지도 공통) */}
        {isCompact && selectedSpot && (
          <BottomSheet
            snap={sheetSnap}
            onSnapChange={setSheetSnap}
            onDismiss={closeDetail}
          >
            <SpotDetail key={selectedSpot.id} spot={selectedSpot} onClose={closeDetail} />
          </BottomSheet>
        )}
      </div>

      {/* 출처·갱신 고지 */}
      <footer className="border-border text-muted-foreground border-t px-4 py-1.5 text-center text-[10px]">
        한국관광공사 TourAPI · 데이터 수집 {genDate} · 동반 조건은 방문 전 시설 확인 권장
      </footer>
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
      <PawPrint className="text-muted-foreground/40 size-10" />
      <p className="text-muted-foreground text-sm">조건에 맞는 동반 지점이 없습니다.</p>
      <button
        type="button"
        onClick={onReset}
        className="border-border rounded-full border px-4 py-1.5 text-xs"
      >
        필터 초기화
      </button>
    </div>
  );
}
