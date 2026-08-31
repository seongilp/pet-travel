/**
 * 수집 원본(pet-raw.json)을 앱이 쓰는 두 정적 번들로 변환한다.
 *
 *  - data/pet-spots.json   : 지도·목록용 경량 배열(전 지점). 클라이언트로 통째 전송된다.
 *  - data/pet-details.json  : 세부 조건. **값이 하나라도 있는 지점만** 담아 크기를 줄인다.
 *
 * 왜 정적 번들인가: 관광 데이터는 실시간이 아니고, detailPetTour2 는 초당 요청제한이
 * 빡세서(returnReasonCode 23) 런타임에 지점마다 때리면 느리고 쿼터를 태운다. 한 번
 * 수집해 번들로 굳히면 런타임 업스트림이 0 이라 실패할 것도, 캐시할 것도 없다.
 *
 * 재수집: HORSE 키를 넣고 `node scripts/collect.mjs && node scripts/build-data.mjs` 후 커밋.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = process.env.RAW_PATH ?? join(__dirname, 'pet-raw.json');
const DATA_DIR = join(__dirname, '..', 'data');

/** addr1 첫 토큰 → 짧은 시도명. lib/pet.ts 의 normalizeSido 와 동일 규칙(빌드 타임 복제). */
const SIDO = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천',
  광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종',
  경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북',
  충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남',
  경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주', 제주도: '제주',
};

/** 광주 5개 자치구. TourAPI 가 전남·광주를 "전남광주통합특별시"로 묶어 주므로 2차 토큰으로 가른다. */
const GWANGJU_GU = new Set(['동구', '서구', '남구', '북구', '광산구']);

function resolveSido(first, second) {
  // TourAPI 실측 함정: 전남·광주 주소가 "전남광주통합특별시 …" 한 이름으로 온다.
  // 2차 토큰이 광주 자치구면 광주, 아니면(순천시·여수시·강진군 등) 전남으로 가른다.
  if (first === '전남광주통합특별시') {
    return GWANGJU_GU.has(second) ? '광주' : '전남';
  }
  return SIDO[first] ?? first;
}

function accessOf(typeCd) {
  const v = (typeCd ?? '').trim();
  if (v.includes('전구역')) return 'all';
  if (v.includes('일부구역')) return 'part';
  return 'unknown'; // 빈 값·미상 — "가능"으로 단언하지 않는다
}

const raw = JSON.parse(readFileSync(RAW, 'utf8'));
const details = raw.details ?? {};

const spots = [];
const detailOut = {};
let coordDropped = 0;

for (const s of raw.list) {
  const lon = parseFloat(s.mapx);
  const lat = parseFloat(s.mapy);
  // 좌표 없는 지점은 지도에 못 찍는다 — 조용히 (0,0) 에 찍지 말고 버린다(실측상 0건이지만 방어).
  if (!isFinite(lon) || !isFinite(lat) || lon === 0 || lat === 0) {
    coordDropped++;
    continue;
  }
  const rawAddr = (s.addr1 ?? '').trim();
  const tokens = rawAddr.split(/\s+/);
  const sidoRaw = tokens[0] ?? '';
  const sido = resolveSido(sidoRaw, tokens[1] ?? '');
  // TourAPI 가 전남·광주를 "전남광주통합특별시" 한 이름으로 주는데, 이건 아직 시행 전
  // 행정명이라 화면에 그대로 두면 혼란스럽다. 표시 주소의 첫 토큰만 해석된 시도로 바꾼다
  // (장흥군은 전남, 광산구는 광주 — 실제와 어긋나지 않는다). 원 데이터 좌표·이름은 그대로.
  const addr =
    sidoRaw === '전남광주통합특별시' ? rawAddr.replace(sidoRaw, sido) : rawAddr;
  const d = details[s.contentid] ?? {};

  spots.push({
    id: s.contentid,
    title: (s.title ?? '').trim(),
    lon: Math.round(lon * 1e6) / 1e6,
    lat: Math.round(lat * 1e6) / 1e6,
    addr,
    sido,
    sigungu: tokens[1] ?? '',
    typeId: s.contenttypeid ?? '',
    access: accessOf(d.acmpyTypeCd),
    hasImage: Boolean(s.firstimage),
    // 대표 이미지 URL(https). 목록 썸네일·상세에 쓴다.
    image: s.firstimage || '',
  });

  // 세부 조건: 값이 하나라도 있으면만 담는다.
  const cond = {};
  for (const k of ['acmpyPsblCpam', 'acmpyNeedMtr', 'etcAcmpyInfo', 'relaAcdntRiskMtr',
    'relaPosesFclty', 'relaFrnshPrdlst', 'relaPurcPrdlst', 'relaRntlPrdlst']) {
    const val = (d[k] ?? '').trim();
    if (val) cond[k] = val;
  }
  if (Object.keys(cond).length) detailOut[s.contentid] = cond;
}

const meta = {
  generatedAt: new Date().toISOString(),
  total: spots.length,
  detailCount: Object.keys(details).length,
  withConditions: Object.keys(detailOut).length,
};

writeFileSync(join(DATA_DIR, 'pet-spots.json'), JSON.stringify({ meta, spots }));
writeFileSync(join(DATA_DIR, 'pet-details.json'), JSON.stringify(detailOut));

// 요약 통계
const byAccess = spots.reduce((a, s) => ((a[s.access] = (a[s.access] || 0) + 1), a), {});
const bySido = spots.reduce((a, s) => ((a[s.sido] = (a[s.sido] || 0) + 1), a), {});
console.log('spots:', spots.length, '| 좌표버림:', coordDropped);
console.log('access:', JSON.stringify(byAccess));
console.log('조건있는지점:', meta.withConditions, `(${(meta.withConditions / spots.length * 100).toFixed(1)}%)`);
console.log('sido:', JSON.stringify(bySido));
