'use client';

import { ExternalLink, MapPin, Navigation, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AccessBadge } from '@/components/access-badge';
import type { SpotListItem } from '@/components/spot-card';
import { accessTone, typeLabel, type PetAccess } from '@/lib/pet';

interface Condition {
  label: string;
  value: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; conditions: Condition[]; access: PetAccess; unavailable: boolean }
  | { status: 'error' };

/**
 * 지점 상세. 동반 세부 조건은 열었을 때 `/api/spot/[id]` 에서 받는다.
 *
 * **정직함이 이 화면의 전부다.** 조건이 안 오면(빈 배열) "가능"도 "불가"도 아니라
 * "세부 정보 없음"이라고만 쓴다. 조회가 실패하면 실패라고 쓴다 — 스켈레톤으로 안 멈춘다.
 */
export function SpotDetail({ spot, onClose }: { spot: SpotListItem; onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  // 부모가 spot.id 를 key 로 줘서 지점이 바뀌면 이 컴포넌트가 새로 마운트된다.
  // 그래서 초기 상태('loading')가 매 지점마다 자동으로 리셋되고, effect 안에서
  // 동기 setState 로 로딩을 다시 세울 필요가 없다(캐스케이드 렌더 방지).
  useEffect(() => {
    let alive = true;
    // 방어적으로 타임아웃을 건다.
    fetch(`/api/spot/${spot.id}`, { signal: AbortSignal.timeout(8000) })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((j) => {
        if (alive)
          setState({
            status: 'ok',
            conditions: j.conditions ?? [],
            access: (j.access as PetAccess) ?? spot.access,
            unavailable: Boolean(j.unavailable),
          });
      })
      .catch(() => {
        if (alive) setState({ status: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [spot.id, spot.access]);

  // 실시간 폴백이 동반유형을 정정했으면 그 값을 쓴다(번들에선 'unknown'이던 곳).
  const effectiveAccess = state.status === 'ok' ? state.access : spot.access;
  const tone = accessTone(effectiveAccess);
  // 카카오맵 길찾기(좌표). 반려동물 데리고 실제로 가야 하니 길찾기를 크게 둔다.
  const mapUrl = `https://map.kakao.com/link/to/${encodeURIComponent(spot.title)},${spot.lat},${spot.lon}`;
  const searchUrl = `https://map.kakao.com/link/search/${encodeURIComponent(spot.title)}`;

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-start gap-3 border-b p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-bold">{spot.title}</h2>
            <span className="text-muted-foreground shrink-0 text-xs">{typeLabel(spot.typeId)}</span>
          </div>
          <div className="text-muted-foreground mt-1 flex items-start gap-1 text-sm">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span>{spot.addr || '주소 정보 없음'}</span>
          </div>
          <div className="mt-2">
            <AccessBadge access={effectiveAccess} />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="text-muted-foreground hover:text-foreground shrink-0 rounded-lg p-1"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {spot.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spot.image}
            alt={spot.title}
            className="mb-4 aspect-video w-full rounded-xl object-cover"
          />
        )}

        {/* 동반 유형 설명 — 100% 채워진 핵심 필드. */}
        <div
          className="mb-4 rounded-xl border p-3 text-sm"
          style={{ borderColor: `${tone.hex}55`, backgroundColor: `${tone.hex}11` }}
        >
          {effectiveAccess === 'all' && '시설 전 구역에 반려동물과 함께 들어갈 수 있는 곳입니다.'}
          {effectiveAccess === 'part' &&
            '일부 구역만 동반 가능합니다. 실내 등 제한 구역이 있을 수 있으니 방문 전 확인하세요.'}
          {effectiveAccess === 'unknown' &&
            '이 지점의 동반 유형 정보가 아직 확인되지 않았습니다. 방문 전 시설에 직접 확인하세요.'}
        </div>

        <h3 className="text-muted-foreground mb-2 text-xs font-semibold">동반 세부 조건</h3>
        {state.status === 'loading' && (
          <div className="text-muted-foreground py-4 text-center text-sm">불러오는 중…</div>
        )}
        {state.status === 'error' && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm">
            세부 조건을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}
        {/* 일시적 실패(쿼터·타임아웃) — "없음"과 명확히 구분한다. */}
        {state.status === 'ok' && state.unavailable && (
          <div className="border-border bg-muted/40 text-muted-foreground rounded-xl border p-3 text-sm">
            동반 세부 정보를 <b>지금 불러올 수 없습니다</b>(일시적). 잠시 후 다시 시도하면
            표시될 수 있습니다.
          </div>
        )}
        {state.status === 'ok' && !state.unavailable && state.conditions.length === 0 && (
          <div className="border-border bg-muted/40 text-muted-foreground rounded-xl border p-3 text-sm">
            등록된 세부 조건(동반 가능 반려동물·준비물 등)이 <b>없습니다</b>. 정보가 없다는
            뜻이며, 동반 불가라는 의미는 아닙니다. 방문 전 시설에 확인하세요.
          </div>
        )}
        {state.status === 'ok' && state.conditions.length > 0 && (
          <dl className="divide-border divide-y">
            {state.conditions.map((c) => (
              <div key={c.label} className="grid grid-cols-[7rem_1fr] gap-2 py-2.5 text-sm">
                <dt className="text-muted-foreground">{c.label}</dt>
                <dd className="whitespace-pre-wrap">{c.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-5 flex gap-2">
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary text-primary-foreground flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium"
          >
            <Navigation className="size-4" /> 길찾기
          </a>
          <a
            href={searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-foreground flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium"
          >
            <ExternalLink className="size-4" /> 지도에서 보기
          </a>
        </div>
      </div>
    </div>
  );
}
