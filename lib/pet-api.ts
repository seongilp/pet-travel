/**
 * 한국관광공사 TourAPI `KorPetTourService2` 런타임 클라이언트. **서버 전용.**
 *
 * 대부분의 데이터는 정적 번들에서 오지만(lib/pet-data.ts), 번들에 아직 수집 안 된 지점의
 * 세부 조건은 사용자가 상세를 열 때 여기서 실시간으로 받아 채운다(backfill). 사용자가
 * 실제로 여는 지점만 부르므로 일일 쿼터를 자연스럽게 며칠에 분산한다.
 *
 * ── 키 인코딩 함정 (형제앱 gofish/lib/fishing-api.ts 에서 그대로 가져온 것) ──
 * 서비스키는 이미 %-인코딩된 Encoding 키다. `URLSearchParams`·axios params 객체는 이걸
 * 한 번 더 인코딩해(`%2B`→`%252B`) SERVICE_KEY_IS_NOT_REGISTERED(403)를 낸다.
 * 그래서 쿼리스트링을 **문자열로 직접 조립**하고 serviceKey 는 verbatim 으로 이어붙인다.
 *
 * ── 쿼터 함정 (이 앱에서 실측) ──
 *  - returnReasonCode 22 = 일일 요청제한 초과. 실패이므로 **캐시하지 않는다.**
 *  - returnReasonCode 23 = 초당 요청제한 초과. 마찬가지로 일시적 실패.
 */

const ENDPOINT = 'https://apis.data.go.kr/B551011/KorPetTourService2/detailPetTour2';

export interface PetDetailRaw {
  acmpyTypeCd?: string;
  acmpyPsblCpam?: string;
  acmpyNeedMtr?: string;
  etcAcmpyInfo?: string;
  relaAcdntRiskMtr?: string;
  relaPosesFclty?: string;
  relaFrnshPrdlst?: string;
  relaPurcPrdlst?: string;
  relaRntlPrdlst?: string;
}

export class PetApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PetApiFailure';
  }
}

function serviceKey(): string {
  const key = process.env.HORSE?.trim();
  if (!key) throw new PetApiFailure('NO_KEY', 'HORSE(TourAPI 서비스키)가 설정되지 않았습니다.');
  // Encoding 키(%포함)는 그대로, Decoding 키만 한 번 인코딩한다.
  return key.includes('%') ? key : encodeURIComponent(key);
}

function itemsOf(json: unknown): PetDetailRaw[] {
  const body = (json as { response?: { body?: { items?: unknown } } })?.response?.body?.items;
  if (!body || body === '') return [];
  const item = (body as { item?: unknown }).item;
  if (Array.isArray(item)) return item as PetDetailRaw[];
  return item ? [item as PetDetailRaw] : [];
}

/**
 * 한 지점의 세부 동반 조건을 실시간 조회. 성공 시 원본 필드 객체, 없으면 null.
 * 쿼터·타임아웃 등 일시적 실패는 예외로 던진다(호출부에서 "정보 없음"이 아니라 "실패"로 구분).
 */
export async function fetchPetDetail(contentId: string): Promise<PetDetailRaw | null> {
  const url =
    `${ENDPOINT}?serviceKey=${serviceKey()}` +
    `&MobileOS=ETC&MobileApp=pettravel&_type=json&contentId=${encodeURIComponent(contentId)}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    // 업스트림 지연에 스레드가 물리지 않게 상한을 건다.
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // 인증 오류는 _type=json 을 줘도 XML 로 떨어진다.
    const code = /<returnReasonCode>([^<]*)</.exec(text)?.[1] ?? 'NON_JSON';
    throw new PetApiFailure(code, `응답 해석 실패: ${text.slice(0, 120)}`);
  }

  const cmm = (json as { OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnReasonCode?: string; errMsg?: string } } })
    ?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (cmm?.returnReasonCode) {
    // 22=일일제한, 23=초당제한 등 — 전부 일시적 실패로 전달.
    throw new PetApiFailure(cmm.returnReasonCode, cmm.errMsg ?? '요청 제한');
  }

  return itemsOf(json)[0] ?? null;
}
