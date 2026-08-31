import type { Metadata, Viewport } from 'next';
import { Noto_Sans_KR } from 'next/font/google';

import './globals.css';

const notoSansKr = Noto_Sans_KR({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: '멍냥로드 — 반려동물 동반여행 지도',
  description:
    '반려동물과 함께 갈 수 있는 전국 관광지·카페·숙소를 지도에서 찾습니다. 전구역/일부구역 동반 가능 여부로 걸러 헛걸음을 줄이세요. 한국관광공사 TourAPI 기반.',
};

export const viewport: Viewport = {
  themeColor: '#0b0f19',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`dark ${notoSansKr.variable} antialiased`} suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-dvh">{children}</body>
    </html>
  );
}
