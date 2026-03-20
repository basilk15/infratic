import { useEffect, useMemo, useState } from 'react';
import type { DeployCommand, DeployRun } from '@/types';

interface DeployPanelProps {
  open: boolean;
  commands: DeployCommand[];
  historyByCommand: Record<string, DeployRun[]>;
  running: boolean;
  displayRunId: string | null;
  activeCommandId: string | null;
  output: string;
  error: string | null;
  onClose: () => void;
  onAdd: (config: { name: string; command: string; workingDir?: string; timeoutMs?: number }) => Promise<void>;
  onRemove: (commandId: string) => Promise<void>;
  onRun: (commandId: string) => Promise<void>;
  onCancel: () => Promise<void>;
}

export const DeployPanel = ({
  open,
  commands,
  historyByCommand,
  running,
  displayRunId,
  activeCommandId,
  output,
  error,
  onClose,
  onAdd,
  onRemove,
  onRun,
  onCancel
}: DeployPanelProps): JSX.Element | null => {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(120000);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) {
      setStartedAt(null);
      setElapsed(0);
      return;
    }
    if (!startedAt) {
      setStartedAt(Date.now());
    }
  }, [running, startedAt]);

  useEffect(() => {
    if (!running || !startedAt) {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 500);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);

  const activeCommand = useMemo(() => commands.find((item) => item.id === activeCommandId) ?? null, [activeCommandId, commands]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-bg-elevated bg-bg-secondary p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Deploy</h2>
            <p className="text-xs text-text-secondary">Run named deploy commands over the active SSH connection.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-text-secondary hover:text-text-primary">
            Close
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-bg-elevated bg-bg-primary p-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Deploy name" className="rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm" />
            <input value={workingDir} onChange={(event) => setWorkingDir(event.target.value)} placeholder="Working directory (optional)" className="rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm" />
          </div>
          <textarea value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npm run deploy" className="mt-2 min-h-[90px] w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm" />
          <div className="mt-2 flex items-center gap-2">
            <input type="number" value={timeoutMs} onChange={(event) => setTimeoutMs(Number.parseInt(event.target.value, 10) || 120000)} className="w-40 rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm" />
            <button
              type="button"
              className="rounded-md bg-accent-blue px-3 py-2 text-sm font-semibold hover:opacity-90"
              onClick={async () => {
                const nextName = name.trim();
                const nextCommand = command.trim();
                if (!nextName || !nextCommand) {
                  return;
                }
                await onAdd({ name: nextName, command: nextCommand, workingDir: workingDir.trim() || undefined, timeoutMs });
                setName('');
                setCommand('');
                setWorkingDir('');
              }}
            >
              Add command
            </button>
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-auto space-y-3">
          {commands.map((item) => (
            <div key={item.id} className="rounded-lg border border-bg-elevated bg-bg-primary p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-text-primary">{item.name}</p>
                  <p className="text-xs text-text-secondary">{item.command}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={running} className="rounded-md bg-accent-blue px-3 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={() => void onRun(item.id)}>
                    Run
                  </button>
                  <button type="button" className="rounded-md bg-bg-elevated px-3 py-1.5 text-xs" onClick={() => void onRemove(item.id)}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-xs text-text-secondary">
                {(historyByCommand[item.id] ?? []).map((run) => (
                  <div key={run.id}>
                    {new Date(run.startedAt).toLocaleString()} • {run.status} • {typeof run.exitCode === 'number' ? `exit ${run.exitCode}` : 'no exit code'}
                  </div>
                ))}
                {(historyByCommand[item.id] ?? []).length === 0 && <div>No runs yet.</div>}
              </div>
            </div>
          ))}
          {commands.length === 0 && <p className="text-sm text-text-muted">No deploy commands configured.</p>}
        </div>

        <div className="mt-4 rounded-lg border border-bg-elevated bg-bg-primary p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{running ? `Running ${activeCommand?.name ?? 'deploy'}` : displayRunId ? 'Last deploy output' : 'Deploy output'}</span>
            {running && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-secondary">Elapsed {(elapsed / 1000).toFixed(1)}s</span>
                <button type="button" className="rounded-md bg-accent-red px-3 py-1.5 text-xs font-semibold" onClick={() => void onCancel()}>
                  Cancel
                </button>
              </div>
            )}
          </div>
          <pre className="h-48 overflow-auto rounded-md bg-bg-tertiary p-3 text-xs text-text-secondary whitespace-pre-wrap">
            {displayRunId ? output || 'Waiting for output...' : 'No deploy output yet.'}
          </pre>
          {error && <p className="mt-2 text-xs text-accent-red">{error}</p>}
        </div>
      </div>
    </div>
  );
};
