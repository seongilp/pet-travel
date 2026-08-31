import { PetBrowser } from '@/components/pet-browser';
import { getMeta, getSpots } from '@/lib/pet-data';

/**
 * 앱 본체. 정적 번들을 서버에서 읽어 클라이언트로 넘긴다.
 *
 * 데이터가 정적이라 이 페이지는 사실상 정적 렌더된다 — 런타임 업스트림이 없어
 * 빌드 후엔 실패할 fetch 자체가 없다. 갱신은 번들 재생성 + 재배포로 한다.
 */
export default function MapPage() {
  const spots = getSpots();
  const meta = getMeta();
  return <PetBrowser spots={spots} generatedAt={meta.generatedAt} />;
}
