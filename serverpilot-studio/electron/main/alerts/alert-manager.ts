import { EventEmitter } from 'node:events';
import { Notification } from 'electron';
import type { AppAlertEvent, ProcessMetrics, ServerConfig, ServiceRecord } from '../../../src/types';
import type { DatabaseStore } from '../store/db';
import type { IServerTransport } from '../transport/transport.interface';
import { logError } from '../utils/logger';

interface ThresholdState {
  cpu: boolean;
  memory: boolean;
}

export const parseMemTotalBytes = (output: string): number | null => {
  const matched = output.match(/MemTotal:\s+(\d+)\s+kB/i);
  if (!matched) {
    return null;
  }

  const value = Number.parseInt(matched[1] ?? '0', 10);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value * 1024;
};

export class AlertManager extends EventEmitter {
  private readonly thresholdState = new Map<string, ThresholdState>();
  private readonly serverMemoryCache = new Map<string, number>();
  private readonly pendingMemoryLoads = new Map<string, Promise<number | null>>();

  constructor(
    private readonly db: DatabaseStore,
    private readonly getTransport: (serverId: string) => IServerTransport
  ) {
    super();
  }

  clearServerState(serverId: string): void {
    this.serverMemoryCache.delete(serverId);
    this.pendingMemoryLoads.delete(serverId);

    for (const key of this.thresholdState.keys()) {
      if (key.startsWith(`${serverId}:`)) {
        this.thresholdState.delete(key);
      }
    }
  }

  async notifyServiceTransitions(
    server: ServerConfig | null,
    previousServices: ServiceRecord[],
    nextServices: ServiceRecord[]
  ): Promise<void> {
    if (!server || !this.isNotificationsEnabledForServer(server.id)) {
      return;
    }

    const nextById = new Map(nextServices.map((service) => [service.id, service]));

    for (const previous of previousServices) {
      if (previous.status !== 'running') {
        continue;
      }

      const next = nextById.get(previous.id);
      if (!next || !['stopped', 'failed'].includes(next.status)) {
        continue;
      }

      this.dispatchAlert(
        'Service Alert',
        `${server.name}: ${previous.displayName} changed from running to ${next.status}.`
      );
    }
  }

  async evaluateMetrics(server: ServerConfig | null, metrics: ProcessMetrics[]): Promise<void> {
    if (!server || metrics.length === 0 || !this.isNotificationsEnabledForServer(server.id)) {
      return;
    }

    const settings = this.db.getAlertSettings();
    const totalMemory = await this.getServerTotalMemory(server.id);

    for (const metric of metrics) {
      const previous = this.thresholdState.get(metric.serviceId) ?? { cpu: false, memory: false };
      const cpuExceeded = metric.cpuPercent >= settings.cpuThresholdPercent;
      const memoryExceeded =
        totalMemory !== null &&
        totalMemory > 0 &&
        metric.memoryRss / totalMemory >= settings.memoryThresholdPercent / 100;

      if (cpuExceeded && !previous.cpu) {
        this.dispatchAlert(
          'CPU Alert',
          `${server.name}: process ${metric.pid} reached ${metric.cpuPercent.toFixed(1)}% CPU.`
        );
      }

      if (memoryExceeded && !previous.memory && totalMemory) {
        const rssMb = (metric.memoryRss / 1024 / 1024).toFixed(1);
        const thresholdMb = ((totalMemory * settings.memoryThresholdPercent) / 100 / 1024 / 1024).toFixed(1);
        this.dispatchAlert(
          'Memory Alert',
          `${server.name}: process ${metric.pid} is using ${rssMb}MB RSS (threshold ${thresholdMb}MB).`
        );
      }

      this.thresholdState.set(metric.serviceId, {
        cpu: cpuExceeded,
        memory: Boolean(memoryExceeded)
      });
    }
  }

  private isNotificationsEnabledForServer(serverId: string): boolean {
    const settings = this.db.getAlertSettings();
    if (!settings.notificationsEnabled) {
      return false;
    }

    return this.db.getServerAlertSettings(serverId).notificationsEnabled;
  }

  private async getServerTotalMemory(serverId: string): Promise<number | null> {
    const cached = this.serverMemoryCache.get(serverId);
    if (typeof cached === 'number' && cached > 0) {
      return cached;
    }

    const pending = this.pendingMemoryLoads.get(serverId);
    if (pending) {
      return pending;
    }

    const load = this.loadServerTotalMemory(serverId);
    this.pendingMemoryLoads.set(serverId, load);
    const resolved = await load;
    this.pendingMemoryLoads.delete(serverId);
    return resolved;
  }

  private async loadServerTotalMemory(serverId: string): Promise<number | null> {
    try {
      const result = await this.getTransport(serverId).exec("grep '^MemTotal:' /proc/meminfo 2>/dev/null");
      const bytes = parseMemTotalBytes(result.stdout);
      if (bytes !== null) {
        this.serverMemoryCache.set(serverId, bytes);
      }
      return bytes;
    } catch (err) {
      logError('alerts', `failed to load total memory for ${serverId}`, err);
      return null;
    }
  }

  private showNotification(title: string, body: string): void {
    const alertEvent: AppAlertEvent = {
      id: `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      title,
      body,
      timestamp: Date.now()
    };
    this.emit('alert', alertEvent);

    if (!Notification.isSupported()) {
      return;
    }

    try {
      new Notification({ title, body }).show();
    } catch (err) {
      logError('alerts', 'failed to show notification', err);
    }
  }

  dispatchAlert(title: string, body: string): void {
    this.showNotification(title, body);
  }
}
