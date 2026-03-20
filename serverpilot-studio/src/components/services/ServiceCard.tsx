import clsx from 'clsx';
import type { HealthStatus, ProcessMetrics, ServiceRecord } from '@/types';
import { PortBadge } from './PortBadge';
import { StatusIndicator } from './StatusIndicator';

interface ServiceCardProps {
  service: ServiceRecord;
  metric?: ProcessMetrics;
  healthStatus?: HealthStatus | null;
  selected: boolean;
  onClick: () => void;
}

const healthColorMap: Record<HealthStatus, string> = {
  healthy: 'bg-accent-green',
  degraded: 'bg-accent-yellow',
  down: 'bg-accent-red',
  unknown: 'bg-text-muted'
};

export const ServiceCard = ({ service, metric, healthStatus, selected, onClick }: ServiceCardProps): JSX.Element => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full rounded-xl border px-4 py-3 text-left transition-colors',
        'border-bg-elevated bg-bg-secondary hover:bg-bg-elevated',
        selected && 'border-accent-blue bg-bg-tertiary'
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusIndicator status={service.status} />
          <div>
            <p className="font-semibold text-text-primary">{service.displayName}</p>
            <div className="mt-1 flex items-center gap-2">
              {healthStatus && <span className={clsx('h-2.5 w-2.5 rounded-full', healthColorMap[healthStatus])} title={`Health: ${healthStatus}`} />}
              <span className="rounded bg-bg-elevated px-2 py-0.5 text-[11px] uppercase text-text-secondary">
                {service.manager}
              </span>
              <span className="rounded bg-bg-elevated px-2 py-0.5 text-[11px] uppercase text-text-secondary">
                {service.name}
              </span>
            </div>
          </div>
        </div>

        <div className="text-right font-mono text-xs text-text-secondary">
          <div>CPU {metric ? `${metric.cpuPercent.toFixed(1)}%` : '--'}</div>
          <div>MEM {metric ? `${(metric.memoryRss / 1024 / 1024).toFixed(1)}MB` : '--'}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {service.ports.map((port) => (
          <PortBadge key={`${service.id}:${port.port}:${port.protocol}`} port={port} />
        ))}
        {service.ports.length === 0 && <span className="text-xs text-text-muted">No listening ports detected</span>}
      </div>
    </button>
  );
};
