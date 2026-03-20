import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import { v4 as uuidv4 } from 'uuid';
import type { HealthCheck, HealthCheckResult, HealthStatus } from '../../../src/types';
import type { AlertManager } from '../alerts/alert-manager';
import type { DatabaseStore } from '../store/db';
import { logError } from '../utils/logger';

const POLL_INTERVAL_MS = 30_000;
const MAX_RESULTS = 20;

export const deriveHealthStatus = (
  statusCode: number | undefined,
  responseTimeMs: number | undefined,
  error?: string
): HealthStatus => {
  if (error || typeof statusCode !== 'number' || statusCode < 200 || statusCode >= 300) {
    return 'down';
  }
  if (typeof responseTimeMs === 'number' && responseTimeMs > 2000) {
    return 'degraded';
  }
  return 'healthy';
};

export class HealthMonitor extends EventEmitter {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly historyByCheck = new Map<string, HealthCheckResult[]>();
  private readonly statusByCheck = new Map<string, HealthStatus>();

  constructor(
    private readonly db: DatabaseStore,
    private readonly alertManager: AlertManager
  ) {
    super();
  }

  start(): void {
    const checks = this.db.listAllHealthChecks();
    for (const check of checks) {
      const persisted = this.db.listPersistedHealthCheckResults(check.id);
      if (persisted.length > 0) {
        this.historyByCheck.set(check.id, persisted);
        this.statusByCheck.set(check.id, persisted[0]?.status ?? 'unknown');
      }
      if (check.enabled) {
        this.startPollingCheck(check);
      }
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  list(serverId: string, serviceKey: string): HealthCheck[] {
    return this.db.listHealthChecks(serverId, serviceKey);
  }

  getResults(checkId: string): HealthCheckResult[] {
    return this.historyByCheck.get(checkId) ?? this.db.listPersistedHealthCheckResults(checkId);
  }

  add(check: HealthCheck): HealthCheck {
    const saved = this.db.addHealthCheck(check);
    if (saved.enabled) {
      this.startPollingCheck(saved);
    }
    return saved;
  }

  remove(checkId: string): void {
    const timer = this.timers.get(checkId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(checkId);
    }
    this.historyByCheck.delete(checkId);
    this.statusByCheck.delete(checkId);
    this.db.removeHealthCheck(checkId);
  }

  toggle(checkId: string, enabled: boolean): void {
    this.db.setHealthCheckEnabled(checkId, enabled);
    const timer = this.timers.get(checkId);
    if (!enabled) {
      if (timer) {
        clearInterval(timer);
        this.timers.delete(checkId);
      }
      return;
    }

    const check = this.db.getHealthCheck(checkId);
    if (check) {
      this.startPollingCheck(check);
    }
  }

  private startPollingCheck(check: HealthCheck): void {
    const existing = this.timers.get(check.id);
    if (existing) {
      clearInterval(existing);
    }

    void this.pollCheck(check);
    const timer = setInterval(() => {
      void this.pollCheck(check);
    }, POLL_INTERVAL_MS);
    this.timers.set(check.id, timer);
  }

  private async pollCheck(check: HealthCheck): Promise<void> {
    const result = await this.executeCheck(check);
    const previousStatus = this.statusByCheck.get(check.id) ?? 'unknown';
    this.statusByCheck.set(check.id, result.status);

    const nextHistory = [...(this.historyByCheck.get(check.id) ?? []), result].slice(-MAX_RESULTS);
    this.historyByCheck.set(check.id, nextHistory);
    this.db.upsertLatestHealthCheckResult(result);

    if (previousStatus === 'healthy' && result.status === 'down') {
      this.alertManager.dispatchAlert('Health Check Down', `${check.url} is down for service ${check.serviceKey}.`);
    }

    this.emit('result', check.id, nextHistory);
  }

  private async executeCheck(check: HealthCheck): Promise<HealthCheckResult> {
    const startedAt = Date.now();
    try {
      const url = new URL(check.url);
      const transport = url.protocol === 'https:' ? https : http;
      const statusCode = await new Promise<number | undefined>((resolve, reject) => {
        const req = transport.request(
          url,
          {
            method: check.method,
            timeout: check.timeoutMs
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
          }
        );

        req.on('timeout', () => {
          req.destroy(new Error('Request timed out'));
        });
        req.on('error', reject);
        req.end();
      });

      const responseTimeMs = Date.now() - startedAt;
      const status = statusCode === check.expectedStatus ? deriveHealthStatus(statusCode, responseTimeMs) : 'down';

      return {
        id: uuidv4(),
        checkId: check.id,
        statusCode,
        responseTimeMs,
        success: statusCode === check.expectedStatus,
        checkedAt: Date.now(),
        status,
        error: status === 'down' && statusCode !== check.expectedStatus ? `Unexpected status: ${statusCode}` : undefined
      };
    } catch (err) {
      logError('health', `check failed for ${check.url}`, err);
      return {
        id: uuidv4(),
        checkId: check.id,
        success: false,
        checkedAt: Date.now(),
        status: 'down',
        error: err instanceof Error ? err.message : 'Request failed'
      };
    }
  }
}
