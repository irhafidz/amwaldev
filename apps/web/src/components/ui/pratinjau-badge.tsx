import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './badge';

interface PratinjauBadgeProps {
  className?: string;
  label?: string;
}

/**
 * Mandatory marker for every Tier C scaffold. A screen showing this badge must
 * never pretend its data is live — see AI_RULES prohibition #8.
 */
export function PratinjauBadge({
  className,
  label = 'PRATINJAU',
}: PratinjauBadgeProps) {
  return (
    <Badge
      className={cn(
        'gap-1 border-amber-300 bg-amber-50 text-amber-700',
        className
      )}
      variant="outline"
    >
      <Eye aria-hidden="true" className="size-3" />
      {label}
    </Badge>
  );
}
