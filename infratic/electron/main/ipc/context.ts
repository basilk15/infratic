import type { BrowserWindow } from 'electron';
import type { AlertManager } from '../alerts/alert-manager';
import type { CredentialStore } from '../credentials/credential-store';
import type { DeployManager } from '../deploy/deploy-manager';
import type { ServiceDiscovery } from '../discovery/service-discovery';
import type { HealthMonitor } from '../health/health-monitor';
import type { PortMonitor } from '../discovery/port-monitor';
import type { ProcMetricsReader } from '../metrics/proc-reader';
import type { ConnectionPool } from '../ssh/connection-pool';
import type { HostKeyStore } from '../ssh/host-key-store';
import type { DatabaseStore } from '../store/db';
import type { TransportManager } from '../transport/transport-manager';
import type { ServiceRecord } from '../../../src/types';

export interface AppIpcContext {
  getMainWindow: () => BrowserWindow | null;
  db: DatabaseStore;
  credentials: CredentialStore;
  deployManager: DeployManager;
  pool: ConnectionPool;
  transports: TransportManager;
  hostKeyStore: HostKeyStore;
  discovery: ServiceDiscovery;
  healthMonitor: HealthMonitor;
  portMonitor: PortMonitor;
  alertManager: AlertManager;
  metricsReaders: Map<string, ProcMetricsReader>;
  serviceCache: Map<string, Map<string, ServiceRecord>>;
}
