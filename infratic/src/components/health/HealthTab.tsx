import { useMemo, useState } from 'react';
import type { HealthCheck, HealthCheckResult } from '@/types';
import { Sparkline } from '@/components/metrics/Sparkline';

interface HealthTabProps {
  checks: HealthCheck[];
  resultsByCheck: Record<string, HealthCheckResult[]>;
  onAdd: (config: { url: string; method?: string; expectedStatus?: number; timeoutMs?: number }) => Promise<void>;
  onRemove: (checkId: string) => Promise<void>;
  onToggle: (checkId: string, enabled: boolean) => Promise<void>;
}

const badgeClasses: Record<string, string> = {
  healthy: 'bg-accent-green/20 text-accent-green',
  degraded: 'bg-accent-yellow/20 text-accent-yellow',
  down: 'bg-accent-red/20 text-accent-red',
  unknown: 'bg-bg-elevated text-text-secondary'
};

export const HealthTab = ({ checks, resultsByCheck, onAdd, onRemove, onToggle }: HealthTabProps): JSX.Element => {
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [expectedStatus, setExpectedStatus] = useState(200);
  const [timeoutMs, setTimeoutMs] = useState(5000);

  const sortedChecks = useMemo(() => checks, [checks]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-md border border-bg-elevated bg-bg-primary p-3">
        <div className="grid grid-cols-1 gap-2">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/health"
            className="rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <select value={method} onChange={(event) => setMethod(event.target.value)} className="rounded-md border border-bg-elevated bg-bg-tertiary px-2 py-2 text-sm">
              <option value="GET">GET</option>
              <option value="HEAD">HEAD</option>
            </select>
            <input
              type="number"
              value={expectedStatus}
              onChange={(event) => setExpectedStatus(Number.parseInt(event.target.value, 10) || 200)}
              className="rounded-md border border-bg-elevated bg-bg-tertiary px-2 py-2 text-sm"
            />
            <input
              type="number"
              value={timeoutMs}
              onChange={(event) => setTimeoutMs(Number.parseInt(event.target.value, 10) || 5000)}
              className="rounded-md border border-bg-elevated bg-bg-tertiary px-2 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            className="rounded-md bg-accent-blue px-3 py-2 text-sm font-semibold hover:opacity-90"
            onClick={async () => {
              const nextUrl = url.trim();
              if (!nextUrl) {
                return;
              }
              await onAdd({ url: nextUrl, method, expectedStatus, timeoutMs });
              setUrl('');
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-auto">
        {sortedChecks.map((check) => {
          const results = resultsByCheck[check.id] ?? [];
          const latest = results[results.length - 1] ?? check.latestResult;
          const points = results
            .filter((result) => typeof result.responseTimeMs === 'number')
            .map((result) => ({ t: result.checkedAt, value: result.responseTimeMs ?? 0 }));

          return (
            <div key={check.id} className="rounded-md border border-bg-elevated bg-bg-primary p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text-primary">{check.url}</div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {check.method} expected {check.expectedStatus} timeout {check.timeoutMs}ms
                  </div>
                </div>
                <span className={`rounded px-2 py-1 text-[11px] uppercase ${badgeClasses[latest?.status ?? 'unknown']}`}>
                  {latest?.status ?? 'unknown'}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-secondary">
                <div>Response: {typeof latest?.responseTimeMs === 'number' ? `${latest.responseTimeMs}ms` : '--'}</div>
                <div>Checked: {latest ? new Date(latest.checkedAt).toLocaleTimeString() : '--'}</div>
              </div>

              <div className="mt-3">
                <Sparkline title="Response ms" color="#f7b84f" points={points} formatValue={(value) => `${value.toFixed(0)}ms`} />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input type="checkbox" checked={check.enabled} onChange={(event) => void onToggle(check.id, event.target.checked)} />
                  Enabled
                </label>
                <button type="button" className="text-xs text-accent-red" onClick={() => void onRemove(check.id)}>
                  Remove
                </button>
              </div>
            </div>
          );
        })}
        {sortedChecks.length === 0 && <p className="text-sm text-text-muted">No health checks configured.</p>}
      </div>
    </div>
  );
};
