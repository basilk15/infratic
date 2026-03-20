import clsx from 'clsx';
import type { ConnectionStatus, ServerConfig } from '@/types';

interface ServerCardProps {
  server: ServerConfig;
  status: ConnectionStatus;
  deploying?: boolean;
  selected: boolean;
  onSelect: () => void;
  onConnectToggle: () => void;
}

const statusColorMap: Record<ConnectionStatus, string> = {
  disconnected: 'bg-text-muted',
  connecting: 'bg-accent-yellow animate-pulse-fast',
  connected: 'bg-accent-green animate-pulse',
  degraded: 'bg-accent-yellow',
  reconnecting: 'bg-accent-yellow animate-pulse',
  failed: 'bg-accent-red'
};

export const ServerCard = ({
  server,
  status,
  deploying,
  selected,
  onSelect,
  onConnectToggle
}: ServerCardProps): JSX.Element => {
  const isLocal = server.serverType === 'local';

  return (
    <div
      className={clsx(
        'rounded-lg border p-3 transition-colors',
        selected ? 'border-accent-blue bg-bg-tertiary' : 'border-bg-elevated bg-bg-secondary hover:bg-bg-tertiary'
      )}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-semibold uppercase text-text-secondary">
              {isLocal ? 'PC' : 'SSH'}
            </span>
            <p className="truncate font-semibold text-text-primary">{server.name || server.host}</p>
          </div>
          <span className={clsx('h-2.5 w-2.5 rounded-full', statusColorMap[status])} />
        </div>
        <p className="mt-1 truncate text-xs text-text-secondary">
          {isLocal ? `${server.host} • ${server.username || 'local user'}` : `${server.host}:${server.port} • ${server.username}`}
        </p>
        {deploying && <p className="mt-1 text-[11px] uppercase text-accent-blue">Deploy running</p>}
      </button>

      <button
        type="button"
        onClick={onConnectToggle}
        disabled={isLocal}
        className="mt-3 w-full rounded-md bg-bg-elevated px-2 py-1 text-xs font-semibold text-text-primary hover:bg-bg-tertiary"
      >
        {isLocal ? 'Local' : status === 'connected' ? 'Disconnect' : status === 'connecting' ? 'Connecting...' : 'Connect'}
      </button>
    </div>
  );
};
