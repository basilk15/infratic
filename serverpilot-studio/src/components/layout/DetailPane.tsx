import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { HealthCheck, HealthCheckResult, ProcessMetrics, ServiceRecord } from '@/types';
import { HealthTab } from '@/components/health/HealthTab';
import { Sparkline } from '@/components/metrics/Sparkline';
import { LogViewer } from '@/components/logs/LogViewer';

interface DetailPaneProps {
  serverId: string | null;
  serverName?: string;
  service: ServiceRecord | null;
  metric?: ProcessMetrics;
  history: Array<{ t: number; cpu: number; mem: number }>;
  healthChecks?: HealthCheck[];
  healthResultsByCheck?: Record<string, HealthCheckResult[]>;
  onAddHealthCheck?: (config: { url: string; method?: string; expectedStatus?: number; timeoutMs?: number }) => Promise<void>;
  onRemoveHealthCheck?: (checkId: string) => Promise<void>;
  onToggleHealthCheck?: (checkId: string, enabled: boolean) => Promise<void>;
  onAction: (action: 'start' | 'stop' | 'restart') => Promise<{ success: boolean; message: string }>;
}

export const DetailPane = ({
  serverId,
  serverName,
  service,
  metric,
  history,
  healthChecks = [],
  healthResultsByCheck = {},
  onAddHealthCheck,
  onRemoveHealthCheck,
  onToggleHealthCheck,
  onAction
}: DetailPaneProps): JSX.Element => {
  const [activeTab, setActiveTab] = useState<'logs' | 'ports' | 'process' | 'health'>('logs');
  const [loadingAction, setLoadingAction] = useState<'start' | 'stop' | 'restart' | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [expandCmdline, setExpandCmdline] = useState(false);

  const cpuPoints = useMemo(() => history.map((sample) => ({ t: sample.t, value: sample.cpu })), [history]);
  const memPoints = useMemo(
    () => history.map((sample) => ({ t: sample.t, value: sample.mem / 1024 / 1024 })),
    [history]
  );

  return (
    <AnimatePresence>
      {service && serverId ? (
        <motion.aside
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 250, damping: 24 }}
          className="h-full w-[360px] border-l border-bg-elevated bg-bg-secondary p-4"
        >
          <h2 className="text-lg font-semibold text-text-primary">{service.displayName}</h2>
          <p className="text-xs text-text-secondary">
            PID {service.pid} • {service.manager} • {service.status}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Sparkline title="CPU %" color="#4f8ef7" points={cpuPoints} formatValue={(value) => `${value.toFixed(1)}%`} />
            <Sparkline
              title="Memory MB"
              color="#3ecf8e"
              points={memPoints}
              formatValue={(value) => `${value.toFixed(1)}MB`}
            />
          </div>

          <div className="mt-4 flex gap-2">
            {(['start', 'stop', 'restart'] as const).map((action) => (
              <button
                key={action}
                type="button"
                disabled={loadingAction !== null}
                className="rounded-md bg-bg-elevated px-3 py-1.5 text-xs font-semibold uppercase hover:bg-bg-tertiary disabled:opacity-50"
                onClick={async () => {
                  setLoadingAction(action);
                  try {
                    const result = await onAction(action);
                    setActionMessage(result.message);
                  } finally {
                    setLoadingAction(null);
                  }
                }}
              >
                {loadingAction === action ? '...' : action}
              </button>
            ))}
          </div>

          {actionMessage && <p className="mt-2 text-xs text-text-secondary">{actionMessage}</p>}

          <div className="mt-5 flex gap-2">
            {(['logs', 'health', 'ports', 'process'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`rounded-md px-2 py-1 text-xs uppercase ${
                  tab === activeTab ? 'bg-accent-blue text-bg-primary' : 'bg-bg-elevated text-text-secondary'
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="mt-3 h-[calc(100%-17rem)]">
            {activeTab === 'logs' && (
              <LogViewer
                serverId={serverId}
                serviceId={service.id}
                serverName={serverName ?? 'server'}
                serviceName={service.displayName}
              />
            )}

            {activeTab === 'ports' && (
              service.ports.length > 0 ? (
                <div className="overflow-auto rounded-md border border-bg-elevated">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-bg-tertiary text-text-secondary">
                      <tr>
                        <th className="px-2 py-2">Port</th>
                        <th className="px-2 py-2">Protocol</th>
                        <th className="px-2 py-2">Bind</th>
                        <th className="px-2 py-2">Access</th>
                      </tr>
                    </thead>
                    <tbody>
                      {service.ports.map((port) => (
                        <tr key={`${service.id}:${port.port}:${port.protocol}`} className="border-t border-bg-elevated">
                          <td className="px-2 py-2 font-mono">{port.port}</td>
                          <td className="px-2 py-2 uppercase">{port.protocol}</td>
                          <td className="px-2 py-2 font-mono">{port.bindAddress}</td>
                          <td className="px-2 py-2">{port.externallyAccessible ? 'Public' : 'Local'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-md border border-bg-elevated bg-bg-primary text-text-muted">
                  <div className="mb-2 text-2xl">◌</div>
                  <p className="text-sm">No listening ports detected</p>
                </div>
              )
            )}

            {activeTab === 'health' && (
              <HealthTab
                checks={healthChecks}
                resultsByCheck={healthResultsByCheck}
                onAdd={async (config) => {
                  if (onAddHealthCheck) {
                    await onAddHealthCheck(config);
                  }
                }}
                onRemove={async (checkId) => {
                  if (onRemoveHealthCheck) {
                    await onRemoveHealthCheck(checkId);
                  }
                }}
                onToggle={async (checkId, enabled) => {
                  if (onToggleHealthCheck) {
                    await onToggleHealthCheck(checkId, enabled);
                  }
                }}
              />
            )}

            {activeTab === 'process' && (
              <div className="space-y-2 rounded-md border border-bg-elevated bg-bg-primary p-3 text-xs">
                <p>
                  <span className="text-text-secondary">PID:</span> <span className="font-mono">{service.pid}</span>
                </p>
                <p>
                  <span className="text-text-secondary">Start Time:</span>{' '}
                  <span className="font-mono">{service.startTime}</span>
                </p>
                <p>
                  <span className="text-text-secondary">Parent PID:</span>{' '}
                  <span className="font-mono">{service.parentPid && service.parentPid > 0 ? service.parentPid : 'Unavailable'}</span>
                </p>
                <p>
                  <span className="text-text-secondary">Children:</span>{' '}
                  <span className="font-mono">
                    {service.children.length > 0 ? service.children.join(', ') : 'none'}
                  </span>
                </p>
                <div>
                  <p className="mb-1 text-text-secondary">Cmdline:</p>
                  <code className="block rounded bg-bg-tertiary p-2 text-[11px] text-text-primary">
                    {expandCmdline ? service.cmdline : `${service.cmdline.slice(0, 180)}${service.cmdline.length > 180 ? '…' : ''}`}
                  </code>
                  {service.cmdline.length > 180 && (
                    <button
                      type="button"
                      className="mt-1 text-[11px] text-accent-blue"
                      onClick={() => setExpandCmdline((prev) => !prev)}
                    >
                      {expandCmdline ? 'Collapse' : 'Expand'}
                    </button>
                  )}
                </div>

                {metric && (
                  <div className="rounded bg-bg-tertiary p-2 font-mono text-[11px] text-text-secondary">
                    CPU {metric.cpuPercent.toFixed(2)}% | RSS {(metric.memoryRss / 1024 / 1024).toFixed(2)}MB | VSZ{' '}
                    {(metric.memoryVirtual / 1024 / 1024).toFixed(2)}MB
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
};
