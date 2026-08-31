import { accessTone, type PetAccess } from '@/lib/pet';

/**
 * 동반 유형 배지. 색은 `accessTone` 한 곳에서만 가져온다 — 지도 마커와 같은 출처라야
 * 범례가 거짓말을 안 한다.
 *
 * 'unknown'(정보 없음)을 절대 초록/긍정으로 칠하지 않는다. 회색 중립으로 두고 "정보 없음"
 * 이라고 그대로 쓴다. 잘못 "가능"으로 보이면 사용자가 반려동물을 데리고 헛걸음한다.
 */
export function AccessBadge({ access, className = '' }: { access: PetAccess; className?: string }) {
  const tone = accessTone(access);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={{ backgroundColor: `${tone.hex}22`, color: tone.hex }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: tone.hex }} />
      {tone.label}
    </span>
  );
}
