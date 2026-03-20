import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessMetrics, ServerConfig, ServiceRecord } from '../../src/types';
import { AlertManager, parseMemTotalBytes } from '../../electron/main/alerts/alert-manager';

const notifications: Array<{ title: string; body: string }> = [];

vi.mock('electron', () => ({
  Notification: class {
    static isSupported(): boolean {
      return true;
    }

    constructor(private readonly options: { title: string; body: string }) {}

    show(): void {
      notifications.push(this.options);
    }
  }
}));

const server: ServerConfig = {
  id: 'server-1',
  serverType: 'ssh',
  name: 'Production',
  host: 'prod.example.com',
  port: 22,
  username: 'ubuntu',
  authMethod: 'agent',
  createdAt: Date.now()
};

const baseService: ServiceRecord = {
  id: 'server-1:101:1',
  stableKey: 'server-1:systemd:api',
  serverId: server.id,
  name: 'api',
  displayName: 'api',
  manager: 'systemd',
  pid: 101,
  startTime: 1,
  status: 'running',
  ports: [],
  cmdline: 'node server.js',
  detectionMethod: 'systemd',
  confidence: 'high',
  parentPid: 1,
  children: []
};

describe('alert-manager helpers', () => {
  it('parses MemTotal bytes from /proc/meminfo output', () => {
    expect(parseMemTotalBytes('MemTotal:       16384256 kB\nMemFree: 1 kB')).toBe(16384256 * 1024);
    expect(parseMemTotalBytes('MemFree: 1 kB')).toBeNull();
  });
});

describe('AlertManager', () => {
  beforeEach(() => {
    notifications.length = 0;
  });

  it('notifies when a running service transitions to failed', async () => {
    const manager = new AlertManager(
      {
        getAlertSettings: () => ({
          notificationsEnabled: true,
          cpuThresholdPercent: 80,
          memoryThresholdPercent: 80
        }),
        getServerAlertSettings: () => ({ serverId: server.id, notificationsEnabled: true })
      } as never,
      (() => {
        throw new Error('not needed');
      }) as never
    );

    await manager.notifyServiceTransitions(server, [baseService], [{ ...baseService, status: 'failed' }]);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.title).toBe('Service Alert');
    expect(notifications[0]?.body).toContain('running to failed');
  });

  it('fires CPU and memory alerts only on threshold crossing', async () => {
    const metric: ProcessMetrics = {
      serviceId: baseService.id,
      pid: baseService.pid,
      cpuPercent: 91,
      memoryRss: 900 * 1024,
      memoryVirtual: 0,
      memorySwap: 0,
      timestamp: Date.now()
    };

    const manager = new AlertManager(
      {
        getAlertSettings: () => ({
          notificationsEnabled: true,
          cpuThresholdPercent: 80,
          memoryThresholdPercent: 80
        }),
        getServerAlertSettings: () => ({ serverId: server.id, notificationsEnabled: true })
      } as never,
      () =>
        ({
        exec: vi.fn().mockResolvedValue({
          stdout: 'MemTotal: 1000 kB',
          stderr: '',
          exitCode: 0
        })
      }) as never
    );

    await manager.evaluateMetrics(server, [metric]);
    await manager.evaluateMetrics(server, [metric]);
    await manager.evaluateMetrics(server, [{ ...metric, cpuPercent: 10, memoryRss: 100 * 1024 }]);
    await manager.evaluateMetrics(server, [metric]);

    expect(notifications.filter((item) => item.title === 'CPU Alert')).toHaveLength(2);
    expect(notifications.filter((item) => item.title === 'Memory Alert')).toHaveLength(2);
  });
});
