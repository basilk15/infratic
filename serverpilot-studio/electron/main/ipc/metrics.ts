import { ipcMain } from 'electron';
import type { ProcessMetrics } from '../../../src/types';
import { ProcMetricsReader } from '../metrics/proc-reader';
import { IPC_EVENTS } from '../utils/events';
import { logError } from '../utils/logger';
import type { AppIpcContext } from './context';

export const registerMetricsIpc = (ctx: AppIpcContext): void => {
  ipcMain.handle(IPC_EVENTS.metrics.start, async (_event, serverId: string, pids: number[]): Promise<void> => {
    try {
      const existing = ctx.metricsReaders.get(serverId);
      if (existing) {
        existing.setPids(pids);
        return;
      }

      const reader = new ProcMetricsReader(ctx.transports.getTransport(serverId), serverId, pids);
      reader.on('metrics', (metrics: ProcessMetrics[]) => {
        const window = ctx.getMainWindow();
        if (window) {
          window.webContents.send(IPC_EVENTS.metrics.update, metrics);
        }

        void ctx.alertManager.evaluateMetrics(ctx.db.getServer(serverId), metrics);

        ctx.db.insertMetricSamples(
          metrics.map((metric) => ({
            serverId,
            pid: metric.pid,
            serviceId: metric.serviceId,
            cpuPercent: metric.cpuPercent,
            memoryRss: metric.memoryRss,
            timestamp: metric.timestamp
          }))
        );
      });

      reader.start(2000);
      ctx.metricsReaders.set(serverId, reader);
    } catch (err) {
      logError('ipc:metrics', 'startPolling failed', err);
      throw new Error('Failed to start metrics polling');
    }
  });

  ipcMain.handle(IPC_EVENTS.metrics.stop, async (_event, serverId: string): Promise<void> => {
    try {
      const reader = ctx.metricsReaders.get(serverId);
      if (reader) {
        reader.stop();
        ctx.metricsReaders.delete(serverId);
      }
    } catch (err) {
      logError('ipc:metrics', 'stopPolling failed', err);
      throw new Error('Failed to stop metrics polling');
    }
  });
};
