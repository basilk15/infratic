import { useEffect, useMemo, useRef, useState } from 'react';
import { ipc } from '@/lib/ipc';

interface LogViewerProps {
  serverId: string;
  serviceId: string;
  serverName: string;
  serviceName: string;
}

export const LogViewer = ({ serverId, serviceId, serverName, serviceName }: LogViewerProps): JSX.Element => {
  const [lines, setLines] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [paused, setPaused] = useState(false);
  const [exporting, setExporting] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    setLines([]);
  }, [serverId, serviceId]);

  useEffect(() => {
    void ipc.logs.start(serverId, serviceId);
    const unsubscribe = ipc.logs.onLine((incomingServiceId, line) => {
      if (incomingServiceId !== serviceId) {
        return;
      }

      setLines((prev) => [...prev.slice(-499), line]);
    });

    return () => {
      unsubscribe();
      void ipc.logs.stop(serverId, serviceId);
    };
  }, [serverId, serviceId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !autoScrollRef.current) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [lines]);

  const filtered = useMemo(() => {
    if (!query) {
      return lines;
    }

    const normalized = query.toLowerCase();
    return lines.filter((line) => line.toLowerCase().includes(normalized));
  }, [lines, query]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search logs"
          className="flex-1 rounded-md border border-bg-elevated bg-bg-tertiary px-2 py-1 text-sm"
        />
        <button
          type="button"
          className="rounded-md bg-bg-elevated px-2 py-1 text-xs font-semibold hover:bg-bg-tertiary"
          onClick={async () => {
            if (paused) {
              await ipc.logs.resume(serverId, serviceId);
            } else {
              await ipc.logs.pause(serverId, serviceId);
            }
            setPaused((prev) => !prev);
          }}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          disabled={exporting || lines.length === 0}
          className="rounded-md bg-bg-elevated px-2 py-1 text-xs font-semibold hover:bg-bg-tertiary disabled:opacity-50"
          onClick={async () => {
            setExporting(true);
            try {
              await ipc.logs.export({
                serverName,
                serviceName,
                lines
              });
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? 'Exporting...' : 'Export'}
        </button>
      </div>

      <div
        ref={viewportRef}
        className="flex-1 overflow-auto rounded-md border border-bg-elevated bg-bg-primary p-3 font-mono text-xs leading-relaxed"
        onScroll={(event) => {
          const target = event.currentTarget;
          const threshold = 24;
          autoScrollRef.current = target.scrollTop + target.clientHeight >= target.scrollHeight - threshold;
        }}
      >
        {filtered.map((line, index) => (
          <div key={`${serviceId}:${index}`} className="whitespace-pre-wrap text-text-secondary">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
};
