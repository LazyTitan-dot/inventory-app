import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Shared decorative disclosure. The parent link/button owns the accessible name. */
export function NavigationChevron({ direction = 'forward', size = 18, strokeWidth = 2, className }: {
  direction?: 'forward' | 'back';
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Icon = direction === 'back' ? ChevronLeft : ChevronRight;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" data-navigation-chevron={direction} />;
}
