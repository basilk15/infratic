import { ipcMain } from 'electron';
import type { DeployCommand, DeployRun } from '../../../src/types';
import { IPC_EVENTS } from '../utils/events';
import { logError } from '../utils/logger';
import type { AppIpcContext } from './context';

export const registerDeployIpc = (ctx: AppIpcContext): void => {
  ipcMain.handle(IPC_EVENTS.deploy.list, async (_event, serverId: string): Promise<DeployCommand[]> => {
    try {
      return ctx.deployManager.list(serverId);
    } catch (err) {
      logError('ipc:deploy', 'list failed', err);
      throw new Error('Failed to load deploy commands');
    }
  });

  ipcMain.handle(
    IPC_EVENTS.deploy.add,
    async (
      _event,
      serverId: string,
      config: { name: string; command: string; workingDir?: string; timeoutMs?: number }
    ): Promise<DeployCommand> => {
      try {
        return ctx.deployManager.add(serverId, config);
      } catch (err) {
        logError('ipc:deploy', 'add failed', err);
        throw new Error(err instanceof Error ? err.message : 'Failed to add deploy command');
      }
    }
  );

  ipcMain.handle(IPC_EVENTS.deploy.remove, async (_event, commandId: string): Promise<void> => {
    try {
      ctx.deployManager.remove(commandId);
    } catch (err) {
      logError('ipc:deploy', 'remove failed', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to remove deploy command');
    }
  });

  ipcMain.handle(IPC_EVENTS.deploy.run, async (_event, serverId: string, commandId: string): Promise<string> => {
    try {
      return ctx.deployManager.run(serverId, commandId);
    } catch (err) {
      logError('ipc:deploy', 'run failed', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to run deploy command');
    }
  });

  ipcMain.handle(IPC_EVENTS.deploy.cancel, async (_event, serverId: string): Promise<void> => {
    try {
      ctx.deployManager.cancel(serverId);
    } catch (err) {
      logError('ipc:deploy', 'cancel failed', err);
      throw new Error('Failed to cancel deploy command');
    }
  });

  ipcMain.handle(IPC_EVENTS.deploy.getHistory, async (_event, commandId: string): Promise<DeployRun[]> => {
    try {
      return ctx.deployManager.getHistory(commandId);
    } catch (err) {
      logError('ipc:deploy', 'getHistory failed', err);
      throw new Error('Failed to load deploy history');
    }
  });
};
