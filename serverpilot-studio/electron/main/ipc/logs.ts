import { dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import type { ServiceRecord } from '../../../src/types';
import type { ICommandStream } from '../transport/transport.interface';
import { IPC_EVENTS } from '../utils/events';
import { buildLogExportFilename } from '../utils/log-export';
import { logError } from '../utils/logger';
import type { AppIpcContext } from './context';

interface LogStreamEntry {
  stream: ICommandStream;
  paused: boolean;
  lines: string[];
  partial: string;
}

const ANSI_REGEX = /\u001b\[[0-9;]*m/g;

const stripAnsi = (line: string): string => line.replace(ANSI_REGEX, '');

const toKey = (serverId: string, serviceId: string): string => `${serverId}:${serviceId}`;

const buildCommand = (service: ServiceRecord): string => {
  if (service.manager === 'systemd') {
    return `journalctl -u ${service.name} -f -n 200 --no-pager`;
  }

  if (service.manager === 'pm2') {
    return `pm2 logs ${service.name} --raw --lines 200`;
  }

  return `tail -f /proc/${service.pid}/fd/1 2>/dev/null || echo "Unable to tail process stdout. Provide explicit log path."`;
};

export const registerLogsIpc = (ctx: AppIpcContext): void => {
  const streams = new Map<string, LogStreamEntry>();

  const emitLine = (serviceId: string, line: string): void => {
    const win = ctx.getMainWindow();
    if (win) {
      win.webContents.send(IPC_EVENTS.logs.line, serviceId, line);
    }
  };

  const pushLine = (entry: LogStreamEntry, line: string): void => {
    entry.lines.push(line);
    if (entry.lines.length > 500) {
      entry.lines.splice(0, entry.lines.length - 500);
    }
  };

  ipcMain.handle(IPC_EVENTS.logs.start, async (_event, serverId: string, serviceId: string): Promise<void> => {
    try {
      const key = toKey(serverId, serviceId);
      if (streams.has(key)) {
        const existing = streams.get(key);
        if (existing) {
          for (const line of existing.lines) {
            emitLine(serviceId, line);
          }
        }
        return;
      }

      const service = ctx.serviceCache.get(serverId)?.get(serviceId);
      if (!service) {
        throw new Error('Service not found. Run discovery first.');
      }

      const stream = ctx.transports.getTransport(serverId).stream(buildCommand(service));
      const entry: LogStreamEntry = {
        stream,
        paused: false,
        lines: [],
        partial: ''
      };

      stream.on('data', (chunk: string) => {
        const raw = `${entry.partial}${chunk}`;
        const lines = raw.split('\n');
        entry.partial = lines.pop() ?? '';

        for (const line of lines) {
          const sanitized = stripAnsi(line);
          pushLine(entry, sanitized);
          if (!entry.paused) {
            emitLine(serviceId, sanitized);
          }
        }
      });

      stream.on('error', (err: Error) => {
        const message = `log stream error: ${err.message}`;
        pushLine(entry, message);
        if (!entry.paused) {
          emitLine(serviceId, message);
        }
      });

      streams.set(key, entry);
    } catch (err) {
      logError('ipc:logs', 'start failed', err);
      throw new Error('Failed to start log stream');
    }
  });

  ipcMain.handle(IPC_EVENTS.logs.stop, async (_event, serverId: string, serviceId: string): Promise<void> => {
    try {
      const key = toKey(serverId, serviceId);
      const entry = streams.get(key);
      if (!entry) {
        return;
      }

      entry.stream.close();
      streams.delete(key);
    } catch (err) {
      logError('ipc:logs', 'stop failed', err);
      throw new Error('Failed to stop log stream');
    }
  });

  ipcMain.handle(IPC_EVENTS.logs.pause, async (_event, serverId: string, serviceId: string): Promise<void> => {
    try {
      const entry = streams.get(toKey(serverId, serviceId));
      if (entry) {
        entry.paused = true;
      }
    } catch (err) {
      logError('ipc:logs', 'pause failed', err);
      throw new Error('Failed to pause log stream');
    }
  });

  ipcMain.handle(IPC_EVENTS.logs.resume, async (_event, serverId: string, serviceId: string): Promise<void> => {
    try {
      const entry = streams.get(toKey(serverId, serviceId));
      if (!entry) {
        return;
      }

      entry.paused = false;
      for (const line of entry.lines) {
        emitLine(serviceId, line);
      }
    } catch (err) {
      logError('ipc:logs', 'resume failed', err);
      throw new Error('Failed to resume log stream');
    }
  });

  ipcMain.handle(
    IPC_EVENTS.logs.export,
    async (
      _event,
      payload: { serverName: string; serviceName: string; lines: string[] }
    ): Promise<{ canceled: boolean; filePath?: string }> => {
      try {
        const win = ctx.getMainWindow();
        const options = {
          title: 'Export logs',
          defaultPath: buildLogExportFilename(payload.serverName, payload.serviceName),
          filters: [
            { name: 'Log files', extensions: ['log', 'txt'] },
            { name: 'All files', extensions: ['*'] }
          ]
        };
        const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);

        if (result.canceled || !result.filePath) {
          return { canceled: true };
        }

        await writeFile(result.filePath, payload.lines.join('\n'), 'utf8');
        return {
          canceled: false,
          filePath: result.filePath
        };
      } catch (err) {
        logError('ipc:logs', 'export failed', err);
        throw new Error('Failed to export logs');
      }
    }
  );
};
