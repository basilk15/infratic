import { app } from 'electron';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  AlertSettings,
  DeployCommand,
  DeployRun,
  HealthCheck,
  HealthCheckResult,
  HealthStatus,
  ServerAlertSettings,
  ServerConfig,
  ServerGroup
} from '../../../src/types';

interface ServerRow {
  id: string;
  server_type: ServerConfig['serverType'];
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: ServerConfig['authMethod'];
  private_key_path: string | null;
  group_id: string | null;
  created_at: number;
}

interface KnownHostRow {
  host: string;
  fingerprint: string;
  added_at: number;
}

interface MetricRow {
  server_id: string;
  pid: number;
  service_id: string;
  cpu_percent: number;
  memory_rss: number;
  timestamp: number;
}

interface HealthCheckRow {
  id: string;
  server_id: string;
  service_id: string;
  service_key: string | null;
  url: string;
  method: string;
  expected_status: number;
  timeout_ms: number;
  enabled: number;
  created_at: number;
}

interface HealthCheckResultRow {
  id: string;
  check_id: string;
  status_code: number | null;
  response_time_ms: number | null;
  success: number;
  error: string | null;
  checked_at: number;
}

interface DeployCommandRow {
  id: string;
  server_id: string;
  name: string;
  command: string;
  working_dir: string | null;
  timeout_ms: number;
  sort_order: number;
  created_at: number;
}

interface DeployRunRow {
  id: string;
  command_id: string;
  server_id: string;
  started_at: number;
  finished_at: number | null;
  exit_code: number | null;
  status: DeployRun['status'];
}

interface AppSettingRow {
  key: string;
  value: string;
}

interface ServerPreferenceRow {
  server_id: string;
  notifications_enabled: number;
  group_id?: string | null;
}

interface ServerGroupRow {
  id: string;
  name: string;
  collapsed: number;
  sort_order: number;
}

export interface MetricInsert {
  serverId: string;
  pid: number;
  serviceId: string;
  cpuPercent: number;
  memoryRss: number;
  timestamp: number;
}

const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  notificationsEnabled: true,
  cpuThresholdPercent: 80,
  memoryThresholdPercent: 80
};

export class DatabaseStore {
  private readonly db: Database.Database;

  constructor() {
    const dbPath = join(app.getPath('userData'), 'serverpilot-studio.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    const row = this.db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as
      | { version: number | null }
      | undefined;
    const currentVersion = row?.version ?? 0;

    if (currentVersion < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS servers (
          id TEXT PRIMARY KEY,
          server_type TEXT NOT NULL DEFAULT 'ssh',
          name TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER NOT NULL DEFAULT 22,
          username TEXT NOT NULL,
          auth_method TEXT NOT NULL,
          private_key_path TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS known_hosts (
          host TEXT PRIMARY KEY,
          fingerprint TEXT NOT NULL,
          added_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS metric_samples (
          server_id TEXT NOT NULL,
          pid INTEGER NOT NULL,
          service_id TEXT NOT NULL,
          cpu_percent REAL NOT NULL,
          memory_rss INTEGER NOT NULL,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_metrics_lookup ON metric_samples(server_id, service_id, timestamp DESC);
      `);

      this.db
        .prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(1, Date.now());
    }

    if (currentVersion < 2) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS server_preferences (
          server_id TEXT PRIMARY KEY,
          notifications_enabled INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
        );
      `);

      const upsertSetting = this.db.prepare(
        `INSERT OR IGNORE INTO app_settings(key, value)
         VALUES (?, ?)`
      );

      upsertSetting.run('notificationsEnabled', JSON.stringify(DEFAULT_ALERT_SETTINGS.notificationsEnabled));
      upsertSetting.run('cpuThresholdPercent', JSON.stringify(DEFAULT_ALERT_SETTINGS.cpuThresholdPercent));
      upsertSetting.run('memoryThresholdPercent', JSON.stringify(DEFAULT_ALERT_SETTINGS.memoryThresholdPercent));
      upsertSetting.run('onboardingCompleted', JSON.stringify(false));

      this.db
        .prepare(
          `INSERT OR IGNORE INTO server_preferences(server_id, notifications_enabled)
           SELECT id, 1 FROM servers`
        )
        .run();

      this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(2, Date.now());
    }

    if (currentVersion < 3) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS server_groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          collapsed INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
      `);

      const serverPreferencesColumns = this.db.prepare('PRAGMA table_info(server_preferences)').all() as Array<{
        name: string;
      }>;
      const hasGroupId = serverPreferencesColumns.some((column) => column.name === 'group_id');
      if (!hasGroupId) {
        this.db
          .prepare('ALTER TABLE server_preferences ADD COLUMN group_id TEXT REFERENCES server_groups(id) ON DELETE SET NULL')
          .run();
      }

      this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(3, Date.now());
    }

    if (currentVersion < 4) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS health_checks (
          id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL,
          service_id TEXT NOT NULL,
          url TEXT NOT NULL,
          method TEXT NOT NULL DEFAULT 'GET',
          expected_status INTEGER NOT NULL DEFAULT 200,
          timeout_ms INTEGER NOT NULL DEFAULT 5000,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS health_check_results (
          id TEXT PRIMARY KEY,
          check_id TEXT NOT NULL UNIQUE,
          status_code INTEGER,
          response_time_ms INTEGER,
          success INTEGER NOT NULL,
          error TEXT,
          checked_at INTEGER NOT NULL
        );
      `);

      this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(4, Date.now());
    }

    if (currentVersion < 5) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS deploy_commands (
          id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL,
          name TEXT NOT NULL,
          command TEXT NOT NULL,
          working_dir TEXT,
          timeout_ms INTEGER NOT NULL DEFAULT 120000,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS deploy_runs (
          id TEXT PRIMARY KEY,
          command_id TEXT NOT NULL,
          server_id TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          finished_at INTEGER,
          exit_code INTEGER,
          status TEXT NOT NULL
        );
      `);

      this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(5, Date.now());
    }

    if (currentVersion < 6) {
      const healthCheckColumns = this.db.prepare('PRAGMA table_info(health_checks)').all() as Array<{ name: string }>;
      const hasServiceKey = healthCheckColumns.some((column) => column.name === 'service_key');
      if (!hasServiceKey) {
        this.db.prepare('ALTER TABLE health_checks ADD COLUMN service_key TEXT').run();
      }

      this.db.prepare('UPDATE health_checks SET service_key = service_id WHERE service_key IS NULL').run();
      this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(6, Date.now());
    }

    if (currentVersion < 7) {
      const serverColumns = this.db.prepare('PRAGMA table_info(servers)').all() as Array<{ name: string }>;
      const hasServerType = serverColumns.some((column) => column.name === 'server_type');
      if (!hasServerType) {
        this.db.prepare("ALTER TABLE servers ADD COLUMN server_type TEXT NOT NULL DEFAULT 'ssh'").run();
      }

      this.db.prepare("UPDATE servers SET server_type = 'ssh' WHERE server_type IS NULL OR server_type = ''").run();
      this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(7, Date.now());
    }
  }

  listServers(): ServerConfig[] {
    const rows = this.db
      .prepare(
        `SELECT s.*, sp.group_id
         FROM servers s
         LEFT JOIN server_preferences sp ON sp.server_id = s.id
         ORDER BY s.created_at DESC`
      )
      .all() as ServerRow[];
    return rows.map((row) => ({
      id: row.id,
      serverType: row.server_type,
      name: row.name,
      host: row.host,
      port: row.port,
      username: row.username,
      authMethod: row.auth_method,
      privateKeyPath: row.private_key_path ?? undefined,
      groupId: row.group_id ?? undefined,
      createdAt: row.created_at
    }));
  }

  addServer(server: ServerConfig): ServerConfig {
    this.db
      .prepare(
        `INSERT INTO servers(id, server_type, name, host, port, username, auth_method, private_key_path, created_at)
         VALUES (@id, @server_type, @name, @host, @port, @username, @auth_method, @private_key_path, @created_at)`
      )
      .run({
        id: server.id,
        server_type: server.serverType,
        name: server.name,
        host: server.host,
        port: server.port,
        username: server.username,
        auth_method: server.authMethod,
        private_key_path: server.privateKeyPath ?? null,
        created_at: server.createdAt
      });

    this.db
      .prepare(
        `INSERT OR IGNORE INTO server_preferences(server_id, notifications_enabled)
         VALUES (?, 1)`
      )
      .run(server.id);

    return server;
  }

  removeServer(id: string): void {
    this.db.prepare('DELETE FROM servers WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM metric_samples WHERE server_id = ?').run(id);
  }

  getServer(id: string): ServerConfig | null {
    const row = this.db
      .prepare(
        `SELECT s.*, sp.group_id
         FROM servers s
         LEFT JOIN server_preferences sp ON sp.server_id = s.id
         WHERE s.id = ?`
      )
      .get(id) as ServerRow | undefined;
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      serverType: row.server_type,
      name: row.name,
      host: row.host,
      port: row.port,
      username: row.username,
      authMethod: row.auth_method,
      privateKeyPath: row.private_key_path ?? undefined,
      groupId: row.group_id ?? undefined,
      createdAt: row.created_at
    };
  }

  upsertKnownHost(host: string, fingerprint: string): void {
    this.db
      .prepare(
        `INSERT INTO known_hosts(host, fingerprint, added_at)
         VALUES (?, ?, ?)
         ON CONFLICT(host) DO UPDATE SET fingerprint = excluded.fingerprint, added_at = excluded.added_at`
      )
      .run(host, fingerprint, Date.now());
  }

  getKnownHost(host: string): { host: string; fingerprint: string; addedAt: number } | null {
    const row = this.db
      .prepare('SELECT host, fingerprint, added_at FROM known_hosts WHERE host = ?')
      .get(host) as KnownHostRow | undefined;

    if (!row) {
      return null;
    }

    return {
      host: row.host,
      fingerprint: row.fingerprint,
      addedAt: row.added_at
    };
  }

  insertMetricSamples(samples: MetricInsert[]): void {
    if (samples.length === 0) {
      return;
    }

    const stmt = this.db.prepare(
      `INSERT INTO metric_samples(server_id, pid, service_id, cpu_percent, memory_rss, timestamp)
       VALUES (@server_id, @pid, @service_id, @cpu_percent, @memory_rss, @timestamp)`
    );

    const tx = this.db.transaction((input: MetricInsert[]) => {
      for (const sample of input) {
        stmt.run({
          server_id: sample.serverId,
          pid: sample.pid,
          service_id: sample.serviceId,
          cpu_percent: sample.cpuPercent,
          memory_rss: sample.memoryRss,
          timestamp: sample.timestamp
        });
      }
    });

    tx(samples);
  }

  listMetricSamples(serverId: string, serviceId: string, limit: number = 60): MetricInsert[] {
    const rows = this.db
      .prepare(
        `SELECT server_id, pid, service_id, cpu_percent, memory_rss, timestamp
         FROM metric_samples
         WHERE server_id = ? AND service_id = ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(serverId, serviceId, limit) as MetricRow[];

    return rows.map((row) => ({
      serverId: row.server_id,
      pid: row.pid,
      serviceId: row.service_id,
      cpuPercent: row.cpu_percent,
      memoryRss: row.memory_rss,
      timestamp: row.timestamp
    }));
  }

  close(): void {
    this.db.close();
  }

  getAlertSettings(): AlertSettings {
    const rows = this.db.prepare('SELECT key, value FROM app_settings').all() as AppSettingRow[];
    const map = new Map(rows.map((row) => [row.key, row.value]));

    return {
      notificationsEnabled: this.parseBooleanSetting(map.get('notificationsEnabled'), DEFAULT_ALERT_SETTINGS.notificationsEnabled),
      cpuThresholdPercent: this.parseNumberSetting(
        map.get('cpuThresholdPercent'),
        DEFAULT_ALERT_SETTINGS.cpuThresholdPercent
      ),
      memoryThresholdPercent: this.parseNumberSetting(
        map.get('memoryThresholdPercent'),
        DEFAULT_ALERT_SETTINGS.memoryThresholdPercent
      )
    };
  }

  setAlertSettings(settings: AlertSettings): AlertSettings {
    const stmt = this.db.prepare(
      `INSERT INTO app_settings(key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );

    const tx = this.db.transaction((input: AlertSettings) => {
      stmt.run('notificationsEnabled', JSON.stringify(input.notificationsEnabled));
      stmt.run('cpuThresholdPercent', JSON.stringify(input.cpuThresholdPercent));
      stmt.run('memoryThresholdPercent', JSON.stringify(input.memoryThresholdPercent));
    });

    tx(settings);
    return this.getAlertSettings();
  }

  listServerAlertSettings(): ServerAlertSettings[] {
    const rows = this.db
      .prepare(
        `SELECT s.id as server_id, COALESCE(sp.notifications_enabled, 1) as notifications_enabled
         FROM servers s
         LEFT JOIN server_preferences sp ON sp.server_id = s.id
         ORDER BY s.created_at DESC`
      )
      .all() as ServerPreferenceRow[];

    return rows.map((row) => ({
      serverId: row.server_id,
      notificationsEnabled: row.notifications_enabled === 1
    }));
  }

  getServerAlertSettings(serverId: string): ServerAlertSettings {
    const row = this.db
      .prepare(
        `SELECT server_id, notifications_enabled
         FROM server_preferences
         WHERE server_id = ?`
      )
      .get(serverId) as ServerPreferenceRow | undefined;

    return {
      serverId,
      notificationsEnabled: row ? row.notifications_enabled === 1 : true
    };
  }

  setServerNotificationsEnabled(serverId: string, enabled: boolean): ServerAlertSettings {
    this.db
      .prepare(
        `INSERT INTO server_preferences(server_id, notifications_enabled)
         VALUES (?, ?)
         ON CONFLICT(server_id) DO UPDATE SET notifications_enabled = excluded.notifications_enabled`
      )
      .run(serverId, enabled ? 1 : 0);

    return this.getServerAlertSettings(serverId);
  }

  getOnboardingCompleted(): boolean {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get('onboardingCompleted') as
      | { value: string }
      | undefined;
    return this.parseBooleanSetting(row?.value, false);
  }

  setOnboardingCompleted(completed: boolean): boolean {
    this.db
      .prepare(
        `INSERT INTO app_settings(key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run('onboardingCompleted', JSON.stringify(completed));

    return this.getOnboardingCompleted();
  }

  listServerGroups(): ServerGroup[] {
    const rows = this.db
      .prepare('SELECT id, name, collapsed, sort_order FROM server_groups ORDER BY sort_order ASC, name ASC')
      .all() as ServerGroupRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      collapsed: row.collapsed === 1,
      sortOrder: row.sort_order
    }));
  }

  createServerGroup(input: { id: string; name: string }): ServerGroup {
    const maxSortOrderRow = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) as value FROM server_groups').get() as
      | { value: number }
      | undefined;
    const nextSortOrder = (maxSortOrderRow?.value ?? -1) + 1;

    this.db
      .prepare(
        `INSERT INTO server_groups(id, name, collapsed, sort_order)
         VALUES (?, ?, 0, ?)`
      )
      .run(input.id, input.name, nextSortOrder);

    return this.getServerGroup(input.id);
  }

  renameServerGroup(groupId: string, name: string): ServerGroup {
    this.db.prepare('UPDATE server_groups SET name = ? WHERE id = ?').run(name, groupId);
    return this.getServerGroup(groupId);
  }

  setServerGroupCollapsed(groupId: string, collapsed: boolean): ServerGroup {
    this.db.prepare('UPDATE server_groups SET collapsed = ? WHERE id = ?').run(collapsed ? 1 : 0, groupId);
    return this.getServerGroup(groupId);
  }

  assignServerToGroup(serverId: string, groupId: string | null): void {
    this.db
      .prepare(
        `INSERT INTO server_preferences(server_id, notifications_enabled, group_id)
         VALUES (?, 1, ?)
         ON CONFLICT(server_id) DO UPDATE SET group_id = excluded.group_id`
      )
      .run(serverId, groupId);
  }

  private getServerGroup(groupId: string): ServerGroup {
    const row = this.db
      .prepare('SELECT id, name, collapsed, sort_order FROM server_groups WHERE id = ?')
      .get(groupId) as ServerGroupRow | undefined;

    if (!row) {
      throw new Error(`Server group ${groupId} not found`);
    }

    return {
      id: row.id,
      name: row.name,
      collapsed: row.collapsed === 1,
      sortOrder: row.sort_order
    };
  }

  private parseBooleanSetting(raw: string | undefined, fallback: boolean): boolean {
    if (typeof raw !== 'string') {
      return fallback;
    }

    try {
      return Boolean(JSON.parse(raw));
    } catch {
      return fallback;
    }
  }

  private parseNumberSetting(raw: string | undefined, fallback: number): number {
    if (typeof raw !== 'string') {
      return fallback;
    }

    try {
      const parsed = Number(JSON.parse(raw));
      return Number.isFinite(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  listHealthChecks(serverId: string, serviceKey: string): HealthCheck[] {
    const checks = this.db
      .prepare(
        `SELECT id, server_id, service_id, service_key, url, method, expected_status, timeout_ms, enabled, created_at
         FROM health_checks
         WHERE server_id = ? AND service_key = ?
         ORDER BY created_at ASC`
      )
      .all(serverId, serviceKey) as HealthCheckRow[];

    return checks.map((row) => ({
      id: row.id,
      serverId: row.server_id,
      serviceKey: row.service_key ?? row.service_id,
      url: row.url,
      method: row.method,
      expectedStatus: row.expected_status,
      timeoutMs: row.timeout_ms,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      latestResult: this.getLatestHealthCheckResult(row.id) ?? undefined
    }));
  }

  listAllHealthChecks(): HealthCheck[] {
    const checks = this.db
      .prepare(
        `SELECT id, server_id, service_id, service_key, url, method, expected_status, timeout_ms, enabled, created_at
         FROM health_checks
         ORDER BY created_at ASC`
      )
      .all() as HealthCheckRow[];

    return checks.map((row) => ({
      id: row.id,
      serverId: row.server_id,
      serviceKey: row.service_key ?? row.service_id,
      url: row.url,
      method: row.method,
      expectedStatus: row.expected_status,
      timeoutMs: row.timeout_ms,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      latestResult: this.getLatestHealthCheckResult(row.id) ?? undefined
    }));
  }

  addHealthCheck(check: HealthCheck): HealthCheck {
    this.db
      .prepare(
        `INSERT INTO health_checks(id, server_id, service_id, url, method, expected_status, timeout_ms, enabled, created_at)
         VALUES (@id, @server_id, @service_id, @url, @method, @expected_status, @timeout_ms, @enabled, @created_at)`
      )
      .run({
        id: check.id,
        server_id: check.serverId,
        service_id: check.serviceKey,
        url: check.url,
        method: check.method,
        expected_status: check.expectedStatus,
        timeout_ms: check.timeoutMs,
        enabled: check.enabled ? 1 : 0,
        created_at: check.createdAt
      });

    this.db.prepare('UPDATE health_checks SET service_key = ? WHERE id = ?').run(check.serviceKey, check.id);

    return check;
  }

  removeHealthCheck(checkId: string): void {
    this.db.prepare('DELETE FROM health_check_results WHERE check_id = ?').run(checkId);
    this.db.prepare('DELETE FROM health_checks WHERE id = ?').run(checkId);
  }

  setHealthCheckEnabled(checkId: string, enabled: boolean): void {
    this.db.prepare('UPDATE health_checks SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, checkId);
  }

  getHealthCheck(checkId: string): HealthCheck | null {
    const row = this.db
      .prepare(
        `SELECT id, server_id, service_id, service_key, url, method, expected_status, timeout_ms, enabled, created_at
         FROM health_checks
         WHERE id = ?`
      )
      .get(checkId) as HealthCheckRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      serverId: row.server_id,
      serviceKey: row.service_key ?? row.service_id,
      url: row.url,
      method: row.method,
      expectedStatus: row.expected_status,
      timeoutMs: row.timeout_ms,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      latestResult: this.getLatestHealthCheckResult(row.id) ?? undefined
    };
  }

  migrateLegacyHealthChecks(serverId: string, legacyServiceId: string, stableServiceKey: string): void {
    this.db
      .prepare(
        `UPDATE health_checks
         SET service_key = ?
         WHERE server_id = ? AND (service_key = service_id OR service_key = ?)`
      )
      .run(stableServiceKey, serverId, legacyServiceId);
  }

  upsertLatestHealthCheckResult(result: Omit<HealthCheckResult, 'status'> & { status?: HealthStatus }): HealthCheckResult {
    this.db
      .prepare(
        `INSERT INTO health_check_results(id, check_id, status_code, response_time_ms, success, error, checked_at)
         VALUES (@id, @check_id, @status_code, @response_time_ms, @success, @error, @checked_at)
         ON CONFLICT(check_id) DO UPDATE SET
           id = excluded.id,
           status_code = excluded.status_code,
           response_time_ms = excluded.response_time_ms,
           success = excluded.success,
           error = excluded.error,
           checked_at = excluded.checked_at`
      )
      .run({
        id: result.id,
        check_id: result.checkId,
        status_code: result.statusCode ?? null,
        response_time_ms: result.responseTimeMs ?? null,
        success: result.success ? 1 : 0,
        error: result.error ?? null,
        checked_at: result.checkedAt
      });

    return this.getLatestHealthCheckResult(result.checkId) as HealthCheckResult;
  }

  getLatestHealthCheckResult(checkId: string): HealthCheckResult | null {
    const row = this.db
      .prepare(
        `SELECT id, check_id, status_code, response_time_ms, success, error, checked_at
         FROM health_check_results
         WHERE check_id = ?`
      )
      .get(checkId) as HealthCheckResultRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapHealthCheckResult(row);
  }

  listPersistedHealthCheckResults(checkId: string): HealthCheckResult[] {
    const row = this.getLatestHealthCheckResult(checkId);
    return row ? [row] : [];
  }

  private mapHealthCheckResult(row: HealthCheckResultRow): HealthCheckResult {
    return {
      id: row.id,
      checkId: row.check_id,
      statusCode: row.status_code ?? undefined,
      responseTimeMs: row.response_time_ms ?? undefined,
      success: row.success === 1,
      error: row.error ?? undefined,
      checkedAt: row.checked_at,
      status: this.deriveHealthStatus(row.success === 1, row.status_code, row.response_time_ms, row.error)
    };
  }

  private deriveHealthStatus(
    success: boolean,
    statusCode: number | null,
    responseTimeMs: number | null,
    error: string | null
  ): HealthStatus {
    if (!success || error || (typeof statusCode === 'number' && (statusCode < 200 || statusCode >= 300))) {
      return 'down';
    }
    if (typeof responseTimeMs === 'number' && responseTimeMs > 2000) {
      return 'degraded';
    }
    if (typeof statusCode === 'number') {
      return 'healthy';
    }
    return 'unknown';
  }

  listDeployCommands(serverId: string): DeployCommand[] {
    const rows = this.db
      .prepare(
        `SELECT id, server_id, name, command, working_dir, timeout_ms, sort_order, created_at
         FROM deploy_commands
         WHERE server_id = ?
         ORDER BY sort_order ASC, created_at ASC`
      )
      .all(serverId) as DeployCommandRow[];

    return rows.map((row) => ({
      id: row.id,
      serverId: row.server_id,
      name: row.name,
      command: row.command,
      workingDir: row.working_dir ?? undefined,
      timeoutMs: row.timeout_ms,
      sortOrder: row.sort_order,
      createdAt: row.created_at
    }));
  }

  addDeployCommand(command: DeployCommand): DeployCommand {
    this.db
      .prepare(
        `INSERT INTO deploy_commands(id, server_id, name, command, working_dir, timeout_ms, sort_order, created_at)
         VALUES (@id, @server_id, @name, @command, @working_dir, @timeout_ms, @sort_order, @created_at)`
      )
      .run({
        id: command.id,
        server_id: command.serverId,
        name: command.name,
        command: command.command,
        working_dir: command.workingDir ?? null,
        timeout_ms: command.timeoutMs,
        sort_order: command.sortOrder,
        created_at: command.createdAt
      });
    return command;
  }

  removeDeployCommand(commandId: string): void {
    this.db.prepare('DELETE FROM deploy_runs WHERE command_id = ?').run(commandId);
    this.db.prepare('DELETE FROM deploy_commands WHERE id = ?').run(commandId);
  }

  getDeployCommand(commandId: string): DeployCommand | null {
    const row = this.db
      .prepare(
        `SELECT id, server_id, name, command, working_dir, timeout_ms, sort_order, created_at
         FROM deploy_commands
         WHERE id = ?`
      )
      .get(commandId) as DeployCommandRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      serverId: row.server_id,
      name: row.name,
      command: row.command,
      workingDir: row.working_dir ?? undefined,
      timeoutMs: row.timeout_ms,
      sortOrder: row.sort_order,
      createdAt: row.created_at
    };
  }

  getNextDeployCommandSortOrder(serverId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) as value FROM deploy_commands WHERE server_id = ?')
      .get(serverId) as { value: number } | undefined;
    return (row?.value ?? -1) + 1;
  }

  addDeployRun(run: DeployRun): DeployRun {
    this.db
      .prepare(
        `INSERT INTO deploy_runs(id, command_id, server_id, started_at, finished_at, exit_code, status)
         VALUES (@id, @command_id, @server_id, @started_at, @finished_at, @exit_code, @status)`
      )
      .run({
        id: run.id,
        command_id: run.commandId,
        server_id: run.serverId,
        started_at: run.startedAt,
        finished_at: run.finishedAt ?? null,
        exit_code: run.exitCode ?? null,
        status: run.status
      });
    return run;
  }

  updateDeployRun(runId: string, patch: Partial<DeployRun>): void {
    const existing = this.getDeployRun(runId);
    if (!existing) {
      return;
    }
    this.db
      .prepare(
        `UPDATE deploy_runs
         SET finished_at = ?, exit_code = ?, status = ?
         WHERE id = ?`
      )
      .run(patch.finishedAt ?? existing.finishedAt ?? null, patch.exitCode ?? existing.exitCode ?? null, patch.status ?? existing.status, runId);
  }

  getDeployRun(runId: string): DeployRun | null {
    const row = this.db
      .prepare(
        `SELECT id, command_id, server_id, started_at, finished_at, exit_code, status
         FROM deploy_runs
         WHERE id = ?`
      )
      .get(runId) as DeployRunRow | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      commandId: row.command_id,
      serverId: row.server_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      exitCode: row.exit_code ?? undefined,
      status: row.status
    };
  }

  listDeployRuns(commandId: string): DeployRun[] {
    const rows = this.db
      .prepare(
        `SELECT id, command_id, server_id, started_at, finished_at, exit_code, status
         FROM deploy_runs
         WHERE command_id = ?
         ORDER BY started_at DESC
         LIMIT 10`
      )
      .all(commandId) as DeployRunRow[];
    return rows.map((row) => ({
      id: row.id,
      commandId: row.command_id,
      serverId: row.server_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      exitCode: row.exit_code ?? undefined,
      status: row.status
    }));
  }
}
