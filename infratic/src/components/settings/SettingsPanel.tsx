import { useEffect, useState } from 'react';
import type { AlertSettings, ServerConfig } from '@/types';

interface SettingsPanelProps {
  open: boolean;
  alerts: AlertSettings;
  servers: ServerConfig[];
  serverNotifications: Record<string, boolean>;
  error: string | null;
  onClose: () => void;
  onSaveAlerts: (settings: AlertSettings) => Promise<void>;
  onToggleServer: (serverId: string, enabled: boolean) => Promise<void>;
}

export const SettingsPanel = ({
  open,
  alerts,
  servers,
  serverNotifications,
  error,
  onClose,
  onSaveAlerts,
  onToggleServer
}: SettingsPanelProps): JSX.Element | null => {
  const [draft, setDraft] = useState(alerts);
  const [cpuInput, setCpuInput] = useState(String(alerts.cpuThresholdPercent));
  const [memoryInput, setMemoryInput] = useState(String(alerts.memoryThresholdPercent));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(alerts);
      setCpuInput(String(alerts.cpuThresholdPercent));
      setMemoryInput(String(alerts.memoryThresholdPercent));
    }
  }, [alerts, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60">
      <div className="flex h-full w-full max-w-md flex-col border-l border-bg-elevated bg-bg-secondary p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Settings</h2>
            <p className="text-xs text-text-secondary">Alerts and per-server notification controls.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-text-secondary hover:text-text-primary">
            Close
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="flex items-center justify-between rounded-lg border border-bg-elevated bg-bg-primary px-3 py-3 text-sm">
            <span>Enable desktop notifications</span>
            <input
              type="checkbox"
              checked={draft.notificationsEnabled}
              onChange={(event) => setDraft((current) => ({ ...current, notificationsEnabled: event.target.checked }))}
            />
          </label>

          <label className="block text-sm">
            CPU alert threshold (%)
            <input
              type="number"
              min={1}
              max={100}
              value={cpuInput}
              onChange={(event) => setCpuInput(event.target.value)}
              className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            Memory alert threshold (% of remote RAM)
            <input
              type="number"
              min={1}
              max={100}
              value={memoryInput}
              onChange={(event) => setMemoryInput(event.target.value)}
              className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
            />
          </label>

          <button
            type="button"
            disabled={saving}
            className="rounded-md bg-accent-blue px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
            onClick={async () => {
              setSaving(true);
              try {
                const nextCpu = Number.parseInt(cpuInput, 10);
                const nextMemory = Number.parseInt(memoryInput, 10);
                await onSaveAlerts({
                  ...draft,
                  cpuThresholdPercent: Number.isFinite(nextCpu) ? nextCpu : alerts.cpuThresholdPercent,
                  memoryThresholdPercent: Number.isFinite(nextMemory) ? nextMemory : alerts.memoryThresholdPercent
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving...' : 'Save alert settings'}
          </button>
        </div>

        <div className="mt-6 min-h-0 flex-1">
          <h3 className="mb-2 text-sm font-semibold">Per-server alerts</h3>
          <div className="space-y-2 overflow-y-auto">
            {servers.map((server) => {
              const enabled = serverNotifications[server.id] ?? true;
              return (
                <label
                  key={server.id}
                  className="flex items-center justify-between rounded-lg border border-bg-elevated bg-bg-primary px-3 py-3 text-sm"
                >
                  <div>
                    <div className="font-semibold">{server.name}</div>
                    <div className="text-xs text-text-secondary">
                      {server.host}:{server.port}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => {
                      void onToggleServer(server.id, event.target.checked);
                    }}
                  />
                </label>
              );
            })}
            {servers.length === 0 && <p className="text-sm text-text-muted">Add a server to configure alerts.</p>}
          </div>
        </div>

        {error && <p className="mt-4 text-xs text-accent-red">{error}</p>}
      </div>
    </div>
  );
};
