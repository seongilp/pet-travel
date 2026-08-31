/**
 * 정적 번들 로더. **서버 전용**(JSON 을 서버 번들에 넣고 필요한 만큼만 클라이언트로 넘긴다).
 *
 * 런타임 업스트림 호출이 없다 — data/pet-spots.json 은 빌드 시점에 굳은 스냅샷이다.
 * 그래서 초당 요청제한·일일 쿼터·타임아웃이 이 경로엔 존재하지 않는다. 데이터 갱신은
 * scripts/collect.mjs → scripts/build-data.mjs 재실행 후 커밋·재배포로 한다.
 */
import spotsBundle from '@/data/pet-spots.json';
import detailsBundle from '@/data/pet-details.json';

import type { PetDetail, Spot } from './pet';

interface RawSpot extends Spot {
  image: string;
}

interface Bundle {
  meta: { generatedAt: string; total: number; detailCount: number; withConditions: number };
  spots: RawSpot[];
}

const bundle = spotsBundle as unknown as Bundle;
const details = detailsBundle as unknown as Record<string, PetDetail>;

export function getMeta() {
  return bundle.meta;
}

/** 전 지점(이미지 URL 포함). 지도·목록에 넘긴다. */
export function getSpots(): RawSpot[] {
  return bundle.spots;
}

/** 세부 조건. 값이 있는 지점만 담겨 있다 — 없으면 undefined(=정보 없음). */
export function getDetail(id: string): PetDetail | undefined {
  return details[id];
}

export function getSpot(id: string): RawSpot | undefined {
  return bundle.spots.find((s) => s.id === id);
}
