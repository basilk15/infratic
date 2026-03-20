import { ipcMain } from 'electron';
import type { AlertSettings, ServerAlertSettings } from '../../../src/types';
import { IPC_EVENTS } from '../utils/events';
import { logError } from '../utils/logger';
import type { AppIpcContext } from './context';

export interface SettingsPayload {
  alerts: AlertSettings;
  servers: ServerAlertSettings[];
  onboardingCompleted: boolean;
}

const clampThreshold = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 80;
  }

  return Math.min(100, Math.max(1, Math.round(value)));
};

export const registerSettingsIpc = (ctx: AppIpcContext): void => {
  ipcMain.handle(IPC_EVENTS.settings.get, async (): Promise<SettingsPayload> => {
    try {
      return {
        alerts: ctx.db.getAlertSettings(),
        servers: ctx.db.listServerAlertSettings(),
        onboardingCompleted: ctx.db.getOnboardingCompleted()
      };
    } catch (err) {
      logError('ipc:settings', 'get failed', err);
      throw new Error('Failed to load settings');
    }
  });

  ipcMain.handle(IPC_EVENTS.settings.updateAlerts, async (_event, input: AlertSettings): Promise<AlertSettings> => {
    try {
      const next = ctx.db.setAlertSettings({
        notificationsEnabled: Boolean(input.notificationsEnabled),
        cpuThresholdPercent: clampThreshold(input.cpuThresholdPercent),
        memoryThresholdPercent: clampThreshold(input.memoryThresholdPercent)
      });
      return next;
    } catch (err) {
      logError('ipc:settings', 'updateAlerts failed', err);
      throw new Error('Failed to update alert settings');
    }
  });

  ipcMain.handle(
    IPC_EVENTS.settings.setServerNotifications,
    async (_event, serverId: string, enabled: boolean): Promise<ServerAlertSettings> => {
      try {
        return ctx.db.setServerNotificationsEnabled(serverId, enabled);
      } catch (err) {
        logError('ipc:settings', 'setServerNotifications failed', err);
        throw new Error('Failed to update server notification settings');
      }
    }
  );
};
