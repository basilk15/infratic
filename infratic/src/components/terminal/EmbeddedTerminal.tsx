import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { ipc } from '@/lib/ipc';

interface EmbeddedTerminalProps {
  serverId: string | null;
  visible: boolean;
  onClose: () => void;
}

export const EmbeddedTerminal = ({ serverId, visible, onClose }: EmbeddedTerminalProps): JSX.Element | null => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const [height, setHeight] = useState(300);

  useEffect(() => {
    if (!visible || !serverId || !mountRef.current) {
      return;
    }

    const terminal = new Terminal({
      theme: {
        background: '#0f1117',
        foreground: '#e8eaf0'
      },
      convertEol: true,
      cursorBlink: true
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(mountRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    let unsubscribeData = () => {
      return;
    };

    void ipc.terminal
      .create(serverId)
      .then((terminalId) => {
        terminalIdRef.current = terminalId;
        unsubscribeData = ipc.terminal.onData((incomingTerminalId, data) => {
          if (incomingTerminalId === terminalId) {
            terminal.write(data);
          }
        });

        terminal.onData((data) => {
          if (terminalIdRef.current) {
            ipc.terminal.write(terminalIdRef.current, data);
          }
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to create terminal';
        terminal.writeln(`\r\n[error] ${message}\r\n`);
      });

    const handleResize = (): void => {
      fitAddon.fit();
      if (terminalIdRef.current) {
        ipc.terminal.resize(terminalIdRef.current, terminal.cols, terminal.rows);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      unsubscribeData();
      if (terminalIdRef.current) {
        ipc.terminal.close(terminalIdRef.current);
      }
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      terminalIdRef.current = null;
    };
  }, [visible, serverId]);

  useEffect(() => {
    if (!visible || !fitRef.current || !terminalRef.current) {
      return;
    }

    fitRef.current.fit();
    if (terminalIdRef.current) {
      ipc.terminal.resize(terminalIdRef.current, terminalRef.current.cols, terminalRef.current.rows);
    }
  }, [height, visible]);

  if (!visible) {
    return null;
  }

  return (
    <div className="border-t border-bg-elevated bg-bg-secondary" style={{ height }}>
      <div
        className="h-2 cursor-row-resize bg-bg-elevated"
        onMouseDown={(downEvent) => {
          downEvent.preventDefault();
          const startY = downEvent.clientY;
          const startHeight = height;

          const handleMove = (moveEvent: MouseEvent): void => {
            const delta = startY - moveEvent.clientY;
            setHeight(Math.min(500, Math.max(220, startHeight + delta)));
          };

          const handleUp = (): void => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
          };

          window.addEventListener('mousemove', handleMove);
          window.addEventListener('mouseup', handleUp);
        }}
      />

      <div className="flex h-9 items-center justify-between border-b border-bg-elevated px-3 text-xs">
        <span className="font-semibold text-text-secondary">Terminal</span>
        <button type="button" onClick={onClose} className="text-text-secondary hover:text-text-primary">
          Close
        </button>
      </div>
      <div ref={mountRef} className="h-[calc(100%-2.75rem)] w-full" />
    </div>
  );
};
