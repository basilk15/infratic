import clsx from 'clsx';
import type { ServiceStatus } from '@/types';

interface StatusIndicatorProps {
  status: ServiceStatus | 'starting' | 'stopping';
}

export const StatusIndicator = ({ status }: StatusIndicatorProps): JSX.Element => {
  const className = clsx('h-2.5 w-2.5 rounded-full', {
    'bg-accent-green animate-pulse': status === 'running',
    'bg-accent-red': status === 'failed',
    'bg-text-muted': status === 'stopped' || status === 'unknown',
    'bg-accent-yellow animate-pulse-fast': status === 'starting' || status === 'stopping'
  });

  return <span className={className} aria-label={`status-${status}`} />;
};
