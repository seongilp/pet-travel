import { NextResponse } from 'next/server';

import { accessFromTypeCd, filledConditions, type PetAccess, type PetDetail } from '@/lib/pet';
import { fetchPetDetail } from '@/lib/pet-api';
import { getDetail, getSpot } from '@/lib/pet-data';

/**
 * 한 지점의 세부 동반 조건.
 *
 * 1순위: 정적 번들(수집 완료분) — 업스트림 호출 없음, 하루 캐시.
 * 2순위: 번들에 없으면 detailPetTour2 **실시간 폴백**(backfill). 사용자가 여는 지점만
 *        부르므로 일일 쿼터가 자연스럽게 분산된다.
 *
 * 상태 구분이 이 앱의 정직함이다:
 *  - conditions=[] & unavailable=false → 세부 정보가 정말 **없음**(동반 불가 아님)
 *  - unavailable=true                  → 지금 **불러오지 못함**(쿼터·타임아웃). 실패는 캐시 안 함.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const spot = getSpot(id);
  if (!spot) {
    return NextResponse.json({ error: '지점을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 1순위: 번들.
  // 동반유형(spot.access)이 이미 있으면 그 지점의 detail 은 수집이 끝난 것이다. 세부 조건이
  // 번들에 없으면 그건 "아직 못 받음"이 아니라 "정말 조건이 없음"이므로 실시간 호출을 하지
  // 않는다(불필요한 쿼터 소모 방지). 조건 번들은 값이 있는 지점만 담기 때문에 없을 수 있다.
  if (spot.access !== 'unknown') {
    const bundled = getDetail(id);
    return NextResponse.json(
      { conditions: filledConditions(bundled), access: spot.access, unavailable: false, source: 'bundle' },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  }

  // 2순위: 동반유형조차 아직 수집 안 된 지점 → 실시간 폴백(backfill).
  try {
    const raw = await fetchPetDetail(id);
    // raw 가 null 이면 응답은 정상인데 세부 레코드가 없는 것 = 정보 없음.
    const detail: PetDetail = {
      acmpyPsblCpam: raw?.acmpyPsblCpam,
      acmpyNeedMtr: raw?.acmpyNeedMtr,
      etcAcmpyInfo: raw?.etcAcmpyInfo,
      relaAcdntRiskMtr: raw?.relaAcdntRiskMtr,
      relaPosesFclty: raw?.relaPosesFclty,
      relaFrnshPrdlst: raw?.relaFrnshPrdlst,
      relaPurcPrdlst: raw?.relaPurcPrdlst,
      relaRntlPrdlst: raw?.relaRntlPrdlst,
    };
    // 실시간으로 받은 동반유형으로 배지를 정정할 수 있으면 정정한다(번들에선 'unknown'이던 곳).
    const access: PetAccess =
      spot.access !== 'unknown' ? spot.access : accessFromTypeCd(raw?.acmpyTypeCd);

    return NextResponse.json(
      { conditions: filledConditions(detail), access, unavailable: false, source: 'live' },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  } catch {
    // 쿼터·타임아웃 등 일시적 실패 — "없음"으로 떨어뜨리지 말고 "불러오지 못함"으로,
    // 그리고 **캐시하지 않는다**(다음 요청은 쿼터가 회복됐을 수 있다).
    return NextResponse.json(
      { conditions: [], access: spot.access, unavailable: true, source: 'live' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
