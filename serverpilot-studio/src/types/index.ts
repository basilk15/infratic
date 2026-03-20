export type AuthMethod = 'password' | 'privateKey' | 'agent';
export type ServerType = 'ssh' | 'local';

export interface ServerConfig {
  id: string;                  // uuid
  serverType: ServerType;
  name: string;
  host: string;
  port: number;                // default 22
  username: string;
  authMethod: AuthMethod;
  privateKeyPath?: string;     // path on disk, never stored content
  groupId?: string;
  createdAt: number;
}

export interface ServerGroup {
  id: string;
  name: string;
  collapsed: boolean;
  sortOrder: number;
}

export interface AlertSettings {
  notificationsEnabled: boolean;
  cpuThresholdPercent: number;
  memoryThresholdPercent: number;
}

export interface ServerAlertSettings {
  serverId: string;
  notificationsEnabled: boolean;
}

export interface AppAlertEvent {
  id: string;
  title: string;
  body: string;
  timestamp: number;
}

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'reconnecting'
  | 'failed';

export type ServiceManager = 'systemd' | 'pm2' | 'raw' | 'unknown';

export type ServiceStatus = 'running' | 'stopped' | 'failed' | 'unknown';

export type Protocol = 'http' | 'https' | 'ws' | 'wss' | 'tcp' | 'udp' | 'unknown';

export interface PortInfo {
  port: number;
  protocol: Protocol;
  bindAddress: string;         // '0.0.0.0' = public, '127.0.0.1' = local only
  externallyAccessible: boolean;
}

export interface ServiceRecord {
  id: string;                  // `${serverId}:${pid}:${startTime}`
  stableKey: string;
  serverId: string;
  name: string;
  displayName: string;
  manager: ServiceManager;
  pid: number;
  startTime: number;           // from /proc stat field 22 — used for PID reuse detection
  status: ServiceStatus;
  ports: PortInfo[];
  cmdline: string;
  detectionMethod: string;
  confidence: 'high' | 'medium' | 'low';
  parentPid?: number;
  children: number[];          // child PIDs
}

export interface ProcessMetrics {
  serviceId: string;
  pid: number;
  cpuPercent: number;
  memoryRss: number;           // bytes
  memoryVirtual: number;       // bytes
  memorySwap: number;          // bytes
  timestamp: number;
}

export interface MetricsHistory {
  serviceId: string;
  samples: Array<{ t: number; cpu: number; mem: number }>;  // last 60 samples
}

export interface HealthCheck {
  id: string;
  serverId: string;
  serviceKey: string;
  url: string;
  method: string;
  expectedStatus: number;
  timeoutMs: number;
  enabled: boolean;
  createdAt: number;
  latestResult?: HealthCheckResult;
}

export interface HealthCheckResult {
  id: string;
  checkId: string;
  statusCode?: number;
  responseTimeMs?: number;
  success: boolean;
  error?: string;
  checkedAt: number;
  status: HealthStatus;
}

export type DeployRunStatus = 'running' | 'succeeded' | 'failed' | 'canceled' | 'timed_out' | 'rejected';

export interface DeployCommand {
  id: string;
  serverId: string;
  name: string;
  command: string;
  workingDir?: string;
  timeoutMs: number;
  sortOrder: number;
  createdAt: number;
}

export interface DeployRun {
  id: string;
  commandId: string;
  serverId: string;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
  status: DeployRunStatus;
}

export interface DeployOutputEvent {
  runId: string;
  serverId: string;
  commandId: string;
  chunk: string;
}

export interface DeployCompleteEvent {
  runId: string;
  serverId: string;
  commandId: string;
  status: DeployRunStatus;
  exitCode?: number;
  finishedAt: number;
}
