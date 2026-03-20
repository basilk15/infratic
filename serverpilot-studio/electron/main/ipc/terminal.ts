import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { IPC_EVENTS } from '../utils/events';
import { logError } from '../utils/logger';
import type { IShellSession } from '../transport/transport.interface';
import type { AppIpcContext } from './context';

interface TerminalSession {
  serverId: string;
  channel: IShellSession;
}

export const registerTerminalIpc = (ctx: AppIpcContext): void => {
  const sessions = new Map<string, TerminalSession>();

  ipcMain.handle(IPC_EVENTS.terminal.create, async (_event, serverId: string): Promise<string> => {
    try {
      const channel = await ctx.transports.getTransport(serverId).shell();
      if (!channel) {
        throw new Error('Terminal unavailable. Connect to server first.');
      }

      const terminalId = uuidv4();
      sessions.set(terminalId, { serverId, channel });

      channel.on('data', (chunk: Buffer | string) => {
        const win = ctx.getMainWindow();
        if (win) {
          win.webContents.send(IPC_EVENTS.terminal.data, terminalId, chunk.toString());
        }
      });

      channel.on('close', () => {
        sessions.delete(terminalId);
      });

      return terminalId;
    } catch (err) {
      logError('ipc:terminal', 'create failed', err);
      throw new Error('Failed to create terminal');
    }
  });

  ipcMain.on(IPC_EVENTS.terminal.write, (_event, terminalId: string, data: string) => {
    try {
      const session = sessions.get(terminalId);
      session?.channel.write(data);
    } catch (err) {
      logError('ipc:terminal', 'write failed', err);
    }
  });

  ipcMain.on(
    IPC_EVENTS.terminal.resize,
    (_event, terminalId: string, cols: number, rows: number): void => {
      try {
        const session = sessions.get(terminalId);
        session?.channel.resize(cols, rows);
      } catch (err) {
        logError('ipc:terminal', 'resize failed', err);
      }
    }
  );

  ipcMain.on(IPC_EVENTS.terminal.close, (_event, terminalId: string): void => {
    try {
      const session = sessions.get(terminalId);
      if (!session) {
        return;
      }

      session.channel.close();
      sessions.delete(terminalId);
    } catch (err) {
      logError('ipc:terminal', 'close failed', err);
    }
  });
};
