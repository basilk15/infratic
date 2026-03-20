import type { ConnectionStatus, HealthStatus, ProcessMetrics, ServiceRecord } from '@/types';
import { ServiceCard } from '@/components/services/ServiceCard';

interface MainCanvasProps {
  services: ServiceRecord[];
  selectedServiceId: string | null;
  liveMetrics: Record<string, ProcessMetrics>;
  healthStatuses?: Record<string, HealthStatus | null>;
  serverStatus: ConnectionStatus;
  isDiscovering: boolean;
  onSelectService: (id: string) => void;
}

export const MainCanvas = ({
  services,
  selectedServiceId,
  liveMetrics,
  healthStatuses,
  serverStatus,
  isDiscovering,
  onSelectService
}: MainCanvasProps): JSX.Element => {
  const isConnecting = serverStatus === 'connecting' || serverStatus === 'reconnecting';

  return (
    <main className="flex-1 overflow-y-auto bg-bg-primary p-4">
      <div className="space-y-3">
        {isConnecting && (
          <div className="flex items-center gap-3 rounded-lg border border-bg-elevated bg-bg-secondary p-4 text-sm text-text-secondary">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg-elevated border-t-accent-blue" />
            <span>Connecting to server. Service discovery will start automatically.</span>
          </div>
        )}

        {!isConnecting && isDiscovering && (
          <div className="flex items-center gap-3 rounded-lg border border-bg-elevated bg-bg-secondary p-4 text-sm text-text-secondary">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg-elevated border-t-accent-blue" />
            <span>Refreshing services...</span>
          </div>
        )}

        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            metric={liveMetrics[service.id]}
            healthStatus={healthStatuses?.[service.id]}
            selected={selectedServiceId === service.id}
            onClick={() => onSelectService(service.id)}
          />
        ))}

        {!isConnecting && !isDiscovering && services.length === 0 && (
          <p className="text-sm text-text-muted">No services discovered for this server.</p>
        )}
      </div>
    </main>
  );
};
