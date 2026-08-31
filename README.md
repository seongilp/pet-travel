# 멍냥로드 — 반려동물 동반여행 지도

반려동물과 함께 갈 수 있는 전국 관광지·카페·숙소·쇼핑을 지도에서 찾는 앱.
**동반 유형(전구역/일부구역 동반 가능)으로 걸러 헛걸음을 줄이는 것**이 핵심 가치다.

한국관광공사 TourAPI `KorPetTourService2` 기반. Next.js 16 · TypeScript · Tailwind v4 · shadcn/ui · maplibre-gl v5.

## 데이터 품질 (실측)

수집 대상 `areaBasedList2` 는 **전 항목이 이미 "반려동물 동반 가능" 지점**이다. 실측 표본으로 잰 품질:

| 항목 | 값 |
|---|---|
| 전체 건수 | 9,686곳 |
| 좌표(mapx/mapy) | 100% WGS84·한국 내·결측 0 |
| firstimage | 96% |
| 동반 유형(`acmpyTypeCd`) | **100% 채움** (전구역 80% / 일부구역 20%) — 핵심 필터 |
| 동반 가능 반려동물(`acmpyPsblCpam`) | 30% |
| 준비물(`acmpyNeedMtr`) | 27% |
| 기타 안내(`etcAcmpyInfo`) | 29% |
| 대여/구매/비치 물품 | <6% (사실상 빈 필드) |

**결측은 결측으로 표시한다.** 동반 조건이 없는 지점은 "가능"도 "불가"도 아니라 **"정보 없음"**이다.

## 아키텍처

정적 번들 + 런타임 폴백 **하이브리드**.

- **리스트 전량(9,686곳)** → `data/pet-spots.json` 정적 번들. 지역·분류·검색 필터는 이 위에서 즉시 동작. 런타임 업스트림 0.
- **동반 유형·세부 조건(수집분)** → `data/pet-details.json`. 지도의 동반유형 필터가 이 부분집합에서 동작.
- **미수집 지점** → 상세를 열 때 `/api/spot/[id]` 가 `detailPetTour2` 를 **실시간 폴백**(backfill). 사용자가 여는 지점만 부르므로 일일 쿼터가 자연스럽게 분산된다.

### 왜 정적 번들인가 (캐시 근거)

관광 데이터는 실시간이 아니다. 지점의 위치·동반 정책은 분 단위로 바뀌지 않는다. 그래서:
- 리스트는 빌드 스냅샷으로 굳혀 런타임 업스트림을 없앤다 → 초당 요청제한·타임아웃·쿼터 소진이 이 경로에 **존재하지 않는다.**
- 실시간 폴백 경로만 `Cache-Control: s-maxage=86400, stale-while-revalidate=604800`(하루 캐시). **실패(쿼터·타임아웃)는 `no-store` 로 절대 캐시하지 않는다.**

### TourAPI 함정 (전부 실측)

1. **서비스키 인코딩** — `HORSE` 는 이미 %-인코딩된 Encoding 키(106자)다. `URLSearchParams`·axios params 는 한 번 더 인코딩해(`%2B`→`%252B`) 403 을 낸다. 쿼리스트링을 문자열로 직접 조립하고 verbatim 이어붙인다. (`lib/pet-api.ts`, `scripts/collect.mjs`)
2. **detail 초당 요청제한**(`returnReasonCode 23`) — 동시성을 올리면 대량 실패한다. 이걸 "결측"으로 착각하면 데이터 판정을 오판한다. 스로틀 필수.
3. **detail 일일 쿼터**(`returnReasonCode 22`) — dev 키는 하루 ~1천대. 9,686건 전량 detail 은 하루에 못 받는다. 그래서 backfill 을 며칠에 분산하는 하이브리드로 설계.
4. **전남·광주 통합 행정명** — addr1 이 `전남광주통합특별시 …` 로 온다. 2차 토큰(광주 5개 자치구 vs 전남 시/군)으로 갈라 시도를 판정하고, 표시 주소도 해석된 시도로 정정한다.

## 데이터 재수집 / backfill

```bash
export HORSE='<TourAPI Encoding 서비스키>'   # 값 출력 금지
node scripts/collect.mjs      # 리스트 전량 + detail(쿼터 한도까지, resumable)
node scripts/build-data.mjs   # data/*.json 재생성
git add data && git commit -m "chore: refresh pet data"
```

`collect.mjs` 는 resumable 이다. 일일 쿼터에 걸리면(코드 22) 그날치를 저장하고 멈춘다. 다음 날 다시 돌리면 이어받아 전량 커버리지에 수렴한다.

## 개발

```bash
npm install
npm run dev        # 정적 번들만 쓰므로 키 없이도 동작(런타임 폴백만 비활성)
npm run build && npm start
```

런타임 폴백까지 켜려면 `HORSE` 환경변수를 서버 시크릿으로 준다. **`NEXT_PUBLIC_` 금지** — 서버 전용이다.

## 배포

Vercel, 함수 리전 **`icn1`(서울)** 고정(`vercel.json`). `iad1` 이면 TourAPI 왕복이 태평양을 건너 타임아웃난다.
