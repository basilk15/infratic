import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { HealthCheck, HealthCheckResult } from '../../../src/types';
import { IPC_EVENTS } from '../utils/events';
import { logError } from '../utils/logger';
import type { AppIpcContext } from './context';

export const registerHealthChecksIpc = (ctx: AppIpcContext): void => {
  ipcMain.handle(IPC_EVENTS.healthChecks.list, async (_event, serverId: string, serviceKey: string, legacyServiceId?: string): Promise<HealthCheck[]> => {
    try {
      if (legacyServiceId) {
        ctx.db.migrateLegacyHealthChecks(serverId, legacyServiceId, serviceKey);
      }
      return ctx.healthMonitor.list(serverId, serviceKey);
    } catch (err) {
      logError('ipc:healthChecks', 'list failed', err);
      throw new Error('Failed to load health checks');
    }
  });

  ipcMain.handle(
    IPC_EVENTS.healthChecks.add,
    async (
      _event,
      serverId: string,
      serviceKey: string,
      config: { url: string; method?: string; expectedStatus?: number; timeoutMs?: number }
    ): Promise<HealthCheck> => {
      try {
        return ctx.healthMonitor.add({
          id: uuidv4(),
          serverId,
          serviceKey,
          url: config.url.trim(),
          method: config.method?.trim().toUpperCase() || 'GET',
          expectedStatus: config.expectedStatus ?? 200,
          timeoutMs: config.timeoutMs ?? 5000,
          enabled: true,
          createdAt: Date.now()
        });
      } catch (err) {
        logError('ipc:healthChecks', 'add failed', err);
        throw new Error('Failed to add health check');
      }
    }
  );

  ipcMain.handle(IPC_EVENTS.healthChecks.remove, async (_event, checkId: string): Promise<void> => {
    try {
      ctx.healthMonitor.remove(checkId);
    } catch (err) {
      logError('ipc:healthChecks', 'remove failed', err);
      throw new Error('Failed to remove health check');
    }
  });

  ipcMain.handle(IPC_EVENTS.healthChecks.getResults, async (_event, checkId: string): Promise<HealthCheckResult[]> => {
    try {
      return ctx.healthMonitor.getResults(checkId);
    } catch (err) {
      logError('ipc:healthChecks', 'getResults failed', err);
      throw new Error('Failed to load health check results');
    }
  });

  ipcMain.handle(IPC_EVENTS.healthChecks.toggle, async (_event, checkId: string, enabled: boolean): Promise<void> => {
    try {
      ctx.healthMonitor.toggle(checkId, enabled);
    } catch (err) {
      logError('ipc:healthChecks', 'toggle failed', err);
      throw new Error('Failed to update health check');
    }
  });
};
