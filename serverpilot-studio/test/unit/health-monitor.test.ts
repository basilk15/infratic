import { describe, expect, it, vi } from 'vitest';
import type { HealthCheck } from '../../src/types';
import { HealthMonitor, deriveHealthStatus } from '../../electron/main/health/health-monitor';

describe('deriveHealthStatus', () => {
  it('classifies healthy, degraded, and down states', () => {
    expect(deriveHealthStatus(200, 120)).toBe('healthy');
    expect(deriveHealthStatus(200, 2500)).toBe('degraded');
    expect(deriveHealthStatus(500, 100)).toBe('down');
    expect(deriveHealthStatus(undefined, undefined, 'timeout')).toBe('down');
  });
});

describe('HealthMonitor history retention', () => {
  it('keeps only the last 20 results per check', async () => {
    const check: HealthCheck = {
      id: 'check-1',
      serverId: 'server-1',
      serviceKey: 'server-1:systemd:service-1',
      url: 'http://localhost/health',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 5000,
      enabled: true,
      createdAt: Date.now()
    };

    const db = {
      listAllHealthChecks: () => [],
      listPersistedHealthCheckResults: () => [],
      addHealthCheck: (input: HealthCheck) => input,
      removeHealthCheck: vi.fn(),
      setHealthCheckEnabled: vi.fn(),
      getHealthCheck: () => check,
      upsertLatestHealthCheckResult: vi.fn(),
      listHealthChecks: () => [check]
    } as never;

    const alertManager = { dispatchAlert: vi.fn() } as never;
    const monitor = new HealthMonitor(db, alertManager);
    let counter = 0;
    (monitor as any).executeCheck = vi.fn(async () => ({
      id: `result-${counter++}`,
      checkId: check.id,
      statusCode: 200,
      responseTimeMs: 100,
      success: true,
      checkedAt: Date.now(),
      status: 'healthy'
    }));

    for (let index = 0; index < 25; index += 1) {
      await (monitor as any).pollCheck(check);
    }

    expect(monitor.getResults(check.id)).toHaveLength(20);
  });
});
