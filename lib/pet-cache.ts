import { fetchPetDetail, type PetDetailRaw } from './pet-api';

/**
 * detailPetTour2 런타임 폴백의 **1차 메모리 캐시**(모듈 스코프). 형제앱
 * `gofish/lib/fishing-cache.ts` 의 캐시+inflight 패턴을 지점 단위(keyed)로 옮긴 것.
 *
 * 목적은 쿼터 보호다. 같은 지점을 여러 사람이 열어도 업스트림은 TTL 당 한 번만 친다.
 *  - CDN 캐시(`s-maxage`)는 인스턴스 사이를 덮지만, 웜 인스턴스 안의 동시/반복 요청은
 *    이 메모리 캐시가 막는다. `inflight` 로 동시 요청까지 한 번으로 합친다.
 *  - **성공만 캐시한다.** null(레코드 없음=정보 없음)도 유효한 답이라 캐시하지만,
 *    쿼터 소진(코드 22)·타임아웃 같은 실패는 **절대 캐시하지 않는다** — 캐시하면 쿼터가
 *    회복돼도 계속 실패가 나간다. 실패는 예외로 그대로 던져 호출부가 no-store 로 응답한다.
 *
 * Vercel 함수 인스턴스는 언제든 새로 뜨므로 이 캐시는 최선의 추정이다. 교차 인스턴스
 * 지속성은 CDN 계층이 담당한다.
 */

/**
 * 반려동물 동반 조건은 거의 안 바뀐다(관광지 정책 단위). 그래서 TTL 을 길게 잡아도
 * 새 데이터를 놓칠 위험이 사실상 없고, 쿼터 압박만 줄어든다. 24시간으로 둔다 —
 * 인스턴스 수명보다 대개 길어, 웜 인스턴스가 사는 동안엔 지점당 업스트림 1콜로 고정된다.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

/** 한 인스턴스에서 무한정 커지지 않게 상한을 둔다. 넘으면 가장 오래된 키부터 버린다(삽입순). */
const MAX_ENTRIES = 3000;

/** 성공 결과만 담는다(값 또는 null). 실패는 여기 오지 않는다. */
const cache = new Map<string, { at: number; value: PetDetailRaw | null }>();

/** 진행 중 조회. 같은 지점에 동시에 여러 요청이 와도 업스트림은 한 번만 친다. */
const inflight = new Map<string, Promise<PetDetailRaw | null>>();

function readFresh(id: string): { hit: boolean; value: PetDetailRaw | null } {
  const entry = cache.get(id);
  if (entry && Date.now() - entry.at < TTL_MS) return { hit: true, value: entry.value };
  if (entry) cache.delete(id); // 만료분 청소
  return { hit: false, value: null };
}

function store(id: string, value: PetDetailRaw | null): void {
  cache.set(id, { at: Date.now(), value });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * 캐시를 거친 detail 조회. 실패는 캐시하지 않고 던진다.
 * `fromCache` 는 관측용(로그·헤더에 쓰지 않아도 됨).
 */
export async function getDetailCached(
  id: string,
): Promise<{ value: PetDetailRaw | null; fromCache: boolean }> {
  const fresh = readFresh(id);
  if (fresh.hit) return { value: fresh.value, fromCache: true };

  const pending = inflight.get(id);
  if (pending) return { value: await pending, fromCache: false };

  const p = fetchPetDetail(id)
    .then((value) => {
      store(id, value); // 성공만 저장(null 포함)
      return value;
    })
    .finally(() => {
      inflight.delete(id); // 실패든 성공이든 inflight 는 비운다(실패는 재시도 가능해야 한다)
    });

  inflight.set(id, p);
  return { value: await p, fromCache: false };
}
