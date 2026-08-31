import { MapPin } from 'lucide-react';

import { AccessBadge } from '@/components/access-badge';
import { typeLabel, type Spot } from '@/lib/pet';
import { cn } from '@/lib/utils';

export interface SpotListItem extends Spot {
  image: string;
}

/**
 * 목록 한 줄. 이미지는 있을 때만(실측 96%) 보여주고, 없으면 자리만 두지 않는다 —
 * 깨진 이미지 아이콘이 뜨는 게 더 나쁘다.
 */
export function SpotCard({
  spot,
  selected,
  onClick,
}: {
  spot: SpotListItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card/60 hover:border-foreground/30',
      )}
    >
      {spot.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 다수 도메인, next/image 최적화 이득 적어 단순 img.
        <img
          src={spot.image}
          alt=""
          loading="lazy"
          className="size-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-lg">
          <MapPin className="text-muted-foreground size-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{spot.title}</span>
          <span className="text-muted-foreground shrink-0 text-xs">{typeLabel(spot.typeId)}</span>
        </div>
        <div className="text-muted-foreground mt-0.5 truncate text-xs">{spot.addr}</div>
        <div className="mt-1.5">
          <AccessBadge access={spot.access} />
        </div>
      </div>
    </button>
  );
}
