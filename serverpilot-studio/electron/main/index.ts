import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AlertManager } from './alerts/alert-manager';
import { CredentialStore } from './credentials/credential-store';
import { DeployManager } from './deploy/deploy-manager';
import { PortMonitor } from './discovery/port-monitor';
import { ServiceDiscovery } from './discovery/service-discovery';
import { HealthMonitor } from './health/health-monitor';
import { registerDeployIpc } from './ipc/deploy';
import { registerGroupsIpc } from './ipc/groups';
import { registerHealthChecksIpc } from './ipc/health-checks';
import { registerLogsIpc } from './ipc/logs';
import { registerMetricsIpc } from './ipc/metrics';
import type { AppIpcContext } from './ipc/context';
import { registerServersIpc } from './ipc/servers';
import { registerSettingsIpc } from './ipc/settings';
import { registerServicesIpc } from './ipc/services';
import { registerTerminalIpc } from './ipc/terminal';
import { ProcMetricsReader } from './metrics/proc-reader';
import { ConnectionPool } from './ssh/connection-pool';
import { HostKeyStore } from './ssh/host-key-store';
import { DatabaseStore } from './store/db';
import { TransportManager } from './transport/transport-manager';
import { IPC_EVENTS } from './utils/events';
import { log, logError } from './utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../../dist/index.html'));
  }

  return window;
};

const bootstrap = async (): Promise<void> => {
  const db = new DatabaseStore();
  const credentials = new CredentialStore();
  await credentials.healthcheck();

  const hostKeyStore = new HostKeyStore(db);
  const pool = new ConnectionPool(credentials, hostKeyStore);
  const transports = new TransportManager(db, pool);
  const discovery = new ServiceDiscovery((serverId) => transports.getTransport(serverId));
  const portMonitor = new PortMonitor((serverId) => transports.getTransport(serverId));
  const alertManager = new AlertManager(db, (serverId) => transports.getTransport(serverId));
  const deployManager = new DeployManager(db, (serverId) => transports.getTransport(serverId), (serverId) =>
    transports.getStatus(serverId)
  );
  const healthMonitor = new HealthMonitor(db, alertManager);

  const context: AppIpcContext = {
    getMainWindow: () => mainWindow,
    db,
    credentials,
    deployManager,
    pool,
    transports,
    hostKeyStore,
    discovery,
    healthMonitor,
    portMonitor,
    alertManager,
    metricsReaders: new Map<string, ProcMetricsReader>(),
    serviceCache: new Map()
  };

  registerServersIpc(context);
  registerServicesIpc(context);
  registerMetricsIpc(context);
  registerLogsIpc(context);
  registerGroupsIpc(context);
  registerHealthChecksIpc(context);
  registerDeployIpc(context);
  registerSettingsIpc(context);
  registerTerminalIpc(context);

  ipcMain.on(IPC_EVENTS.hostKey.respond, (_event, host: string, accepted: boolean) => {
    hostKeyStore.respond(host, accepted);
  });

  hostKeyStore.on('verify-request', (payload: { host: string; fingerprint: string }) => {
    mainWindow?.webContents.send(IPC_EVENTS.hostKey.verify, payload.host, payload.fingerprint);
  });

  hostKeyStore.on('mismatch', (payload: { host: string; expected: string; received: string }) => {
    mainWindow?.webContents.send(IPC_EVENTS.hostKey.mismatch, payload);
  });

  credentials.on('warning', (message: string) => {
    log('credentials', message);
  });

  alertManager.on('alert', (payload: { id: string; title: string; body: string; timestamp: number }) => {
    mainWindow?.webContents.send(IPC_EVENTS.alerts.event, payload);
  });

  healthMonitor.on('result', (checkId: string, results: unknown) => {
    mainWindow?.webContents.send(IPC_EVENTS.healthChecks.results, checkId, results);
  });
  deployManager.on('output', (payload: unknown) => {
    mainWindow?.webContents.send(IPC_EVENTS.deploy.output, payload);
  });
  deployManager.on('complete', (payload: unknown) => {
    mainWindow?.webContents.send(IPC_EVENTS.deploy.complete, payload);
  });
  deployManager.on('state', (serverId: string, running: boolean) => {
    mainWindow?.webContents.send(IPC_EVENTS.deploy.state, serverId, running);
  });

  pool.on('status', ({ id, status }: { id: string; status: string }) => {
    mainWindow?.webContents.send(IPC_EVENTS.servers.statusChanged, id, status);
  });

  portMonitor.on('change', (payload: unknown) => {
    log('ports', 'change detected', payload);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logError('process', 'unhandled rejection', reason);
  });

  process.on('uncaughtException', (err: Error) => {
    logError('process', 'uncaught exception', err);
  });

  healthMonitor.start();
};

app.whenReady().then(async () => {
  await bootstrap();
  mainWindow = createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
