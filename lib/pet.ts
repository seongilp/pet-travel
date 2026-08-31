/**
 * 반려동물 동반여행 도메인 모델. 클라이언트·서버 공용(순수 함수만).
 *
 * 데이터 출처: 한국관광공사 TourAPI `KorPetTourService2`.
 *  - `areaBasedList2` → 위치·이름·주소·분류(전 항목이 이미 "반려동물 동반 가능" 지점이다)
 *  - `detailPetTour2` → 동반 유형(전구역/일부구역)과 세부 조건
 *
 * 정적 번들(`data/pet-spots.json`, `data/pet-details.json`)에서 읽는다. 런타임에
 * 업스트림을 때리지 않으므로 초당 요청제한(returnReasonCode 23)·일일 쿼터에 걸리지
 * 않고, 응답 지연도 없다. 관광 데이터는 실시간이 아니라 이 설계가 맞다(근거는 README).
 */

/** 지도·목록에 뿌리는 경량 지점. 세부 조건은 별도 번들에서 필요할 때만 읽는다. */
export interface Spot {
  /** TourAPI contentid. 세부 조건 조회 키. */
  id: string;
  title: string;
  /** WGS84 경도(mapx). 실측 결측률 0%. */
  lon: number;
  /** WGS84 위도(mapy). */
  lat: number;
  addr: string;
  /** 광역시도(정규화된 짧은 이름). addr1 첫 토큰에서 파생 — 결측률 0%. */
  sido: string;
  /** 시군구. addr1 둘째 토큰. 없으면 빈 문자열. */
  sigungu: string;
  /** contenttypeid. 관광지/음식점/쇼핑 등. */
  typeId: string;
  /**
   * 동반 유형. **이 필드가 이 앱의 핵심 필터다.** 실측 결측률 0%.
   *  - 'all'  = 전구역 동반가능
   *  - 'part' = 일부구역 동반가능
   *  - 'unknown' = detailPetTour2 응답에 값이 없던 경우(안전상 단언하지 않음)
   */
  access: PetAccess;
  /** 대표 이미지 존재 여부(firstimage). 실측 96%. */
  hasImage: boolean;
}

export type PetAccess = 'all' | 'part' | 'unknown';

/**
 * detailPetTour2 세부 조건. **대부분 결측이다**(실측: 동반가능동물 30%, 준비물 27%,
 * 기타 29%, 나머지 목록류 <6%). 그래서 값이 없으면 "가능/불가"가 아니라 **"정보 없음"**
 * 으로 다뤄야 한다. 빈 문자열을 조건으로 단언하면 사용자가 헛걸음한다.
 */
export interface PetDetail {
  /** 동반 가능 반려동물(크기·종류 제한 등). 예: "20kg 미만" */
  acmpyPsblCpam?: string;
  /** 동반 시 필요사항·준비물. 예: "리드줄, 배변봉투" */
  acmpyNeedMtr?: string;
  /** 기타 동반 정보. */
  etcAcmpyInfo?: string;
  /** 관련 사고 위험 물질. */
  relaAcdntRiskMtr?: string;
  /** 관련 구비 시설. */
  relaPosesFclty?: string;
  /** 비치 물품. */
  relaFrnshPrdlst?: string;
  /** 구매 물품. */
  relaPurcPrdlst?: string;
  /** 대여 물품. */
  relaRntlPrdlst?: string;
}

/** detailPetTour2 의 acmpyTypeCd 문자열 → PetAccess. 빈 값·미상은 'unknown'(단언 금지). */
export function accessFromTypeCd(typeCd: string | undefined): PetAccess {
  const v = (typeCd ?? '').trim();
  if (v.includes('전구역')) return 'all';
  if (v.includes('일부구역')) return 'part';
  return 'unknown';
}

/**
 * 광역시도 정규화. addr1 첫 토큰("강원특별자치도")을 짧은 라벨("강원")로 줄인다.
 * 필터 칩과 지도 범례가 같은 짧은 이름을 쓰게 하려는 것. 매칭 안 되면 원문을 그대로 둔다.
 */
export function normalizeSido(raw: string): string {
  const first = raw.trim().split(/\s+/)[0] ?? '';
  const table: Record<string, string> = {
    서울특별시: '서울',
    부산광역시: '부산',
    대구광역시: '대구',
    인천광역시: '인천',
    광주광역시: '광주',
    대전광역시: '대전',
    울산광역시: '울산',
    세종특별자치시: '세종',
    경기도: '경기',
    강원도: '강원',
    강원특별자치도: '강원',
    충청북도: '충북',
    충청남도: '충남',
    전라북도: '전북',
    전북특별자치도: '전북',
    전라남도: '전남',
    경상북도: '경북',
    경상남도: '경남',
    제주특별자치도: '제주',
    제주도: '제주',
  };
  return table[first] ?? first;
}

/** 필터·지도에서 쓸 시도 표시 순서(수도권→영남→호남→충청→강원→제주). */
export const SIDO_ORDER = [
  '서울',
  '인천',
  '경기',
  '부산',
  '대구',
  '울산',
  '경북',
  '경남',
  '광주',
  '전북',
  '전남',
  '대전',
  '세종',
  '충북',
  '충남',
  '강원',
  '제주',
] as const;

/** contenttypeid → 사람이 읽는 분류명. TourAPI 표준 코드. */
export const CONTENT_TYPE: Record<string, string> = {
  '12': '관광지',
  '14': '문화시설',
  '15': '축제·공연',
  '25': '여행코스',
  '28': '레포츠',
  '32': '숙박',
  '38': '쇼핑',
  '39': '음식점',
};

export function typeLabel(typeId: string): string {
  return CONTENT_TYPE[typeId] ?? '기타';
}

/** 동반 유형 라벨·색. 지도 마커와 배지가 같은 출처를 쓰게 한 곳에 둔다. */
export interface AccessTone {
  label: string;
  /** 마커·배지 색(hex). */
  hex: string;
}

export function accessTone(access: PetAccess): AccessTone {
  switch (access) {
    case 'all':
      // 전구역 — 토스 블루 계열 초록빛 긍정. 안심하고 가도 되는 곳.
      return { label: '전구역 동반가능', hex: '#22c55e' };
    case 'part':
      // 일부구역 — 주의. 실내 불가 등 제약이 있을 수 있으니 상세 확인 유도.
      return { label: '일부구역 동반가능', hex: '#f59e0b' };
    default:
      // 정보 없음 — 회색. "가능"으로 오해되지 않게 중립색.
      return { label: '동반 조건 정보 없음', hex: '#94a3b8' };
  }
}

/** 세부 조건 중 값이 실제로 채워진 항목만 라벨과 함께 뽑는다. 빈 값은 버린다. */
export function filledConditions(detail: PetDetail | undefined): { label: string; value: string }[] {
  if (!detail) return [];
  const rows: { key: keyof PetDetail; label: string }[] = [
    { key: 'acmpyPsblCpam', label: '동반 가능 반려동물' },
    { key: 'acmpyNeedMtr', label: '필요사항·준비물' },
    { key: 'etcAcmpyInfo', label: '기타 안내' },
    { key: 'relaAcdntRiskMtr', label: '사고 위험 요소' },
    { key: 'relaPosesFclty', label: '구비 시설' },
    { key: 'relaFrnshPrdlst', label: '비치 물품' },
    { key: 'relaRntlPrdlst', label: '대여 물품' },
    { key: 'relaPurcPrdlst', label: '구매 물품' },
  ];
  return rows
    .map((r) => ({ label: r.label, value: (detail[r.key] ?? '').trim() }))
    .filter((r) => r.value !== '');
}
