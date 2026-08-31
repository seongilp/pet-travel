import { ArrowRight, MapPin, PawPrint, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';

import { accessTone } from '@/lib/pet';
import { getMeta, getSpots } from '@/lib/pet-data';

/**
 * 랜딩. 실제 데이터에서 통계를 뽑아 보여준다 — 숫자를 하드코딩하면 데이터가 바뀔 때
 * 거짓말이 된다. 동반 유형 분포는 이 앱의 핵심 가치(조건 필터)를 한눈에 설명한다.
 */
export default function Landing() {
  const spots = getSpots();
  const meta = getMeta();

  const byAccess = spots.reduce(
    (a, s) => ((a[s.access] = (a[s.access] || 0) + 1), a),
    {} as Record<string, number>,
  );
  const sidoCount = new Set(spots.map((s) => s.sido)).size;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-6">
      {/* 히어로 */}
      <section className="flex flex-1 flex-col justify-center py-16">
        <div className="bg-primary/10 text-primary mb-6 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
          <PawPrint className="size-3.5" /> 반려동물 동반여행
        </div>
        <h1 className="text-4xl leading-tight font-bold tracking-tight">
          우리 아이랑
          <br />
          어디 갈까?
        </h1>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed">
          반려동물과 함께 갈 수 있는 전국{' '}
          <b className="text-foreground">{meta.total.toLocaleString()}곳</b>을 지도에서 찾아보세요.
          <br />
          <b className="text-foreground">전구역·일부구역 동반 가능</b> 여부로 걸러 헛걸음을
          줄입니다.
        </p>

        <Link
          href="/map"
          className="bg-primary text-primary-foreground mt-8 flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold"
        >
          지도에서 찾아보기 <ArrowRight className="size-5" />
        </Link>

        {/* 동반 유형 분포 — 핵심 필터를 미리 설명 */}
        <div className="mt-8 grid grid-cols-3 gap-2">
          {(['all', 'part', 'unknown'] as const).map((a) => (
            <div key={a} className="border-border bg-card/60 rounded-2xl border p-3 text-center">
              <div className="text-xl font-bold" style={{ color: accessTone(a).hex }}>
                {(byAccess[a] ?? 0).toLocaleString()}
              </div>
              <div className="text-muted-foreground mt-0.5 text-[11px] leading-tight">
                {a === 'all' ? '전구역' : a === 'part' ? '일부구역' : '정보 없음'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 특징 */}
      <section className="space-y-3 pb-10">
        <Feature
          icon={<SlidersHorizontal className="size-5" />}
          title="동반 조건으로 거르기"
          desc="전구역 동반 가능한 곳만 보거나, 지역·분류(관광지·카페·숙소 등)로 좁혀서 찾습니다."
        />
        <Feature
          icon={<MapPin className="size-5" />}
          title="지도에서 한눈에"
          desc="전국 지점을 지도에 묶어 보여주고, 확대하면 개별 장소로 풀립니다. 길찾기까지 바로."
        />
        <Feature
          icon={<PawPrint className="size-5" />}
          title="정직한 정보"
          desc="동반 조건이 없는 곳은 '가능'이 아니라 '정보 없음'으로 표기합니다. 방문 전 확인을 권합니다."
        />
      </section>

      <footer className="text-muted-foreground border-border border-t py-4 text-center text-[11px]">
        데이터: 한국관광공사 TourAPI · {sidoCount}개 시도 · 수집 {meta.generatedAt.slice(0, 10)}
      </footer>
    </main>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="border-border bg-card/60 flex gap-3 rounded-2xl border p-4">
      <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
