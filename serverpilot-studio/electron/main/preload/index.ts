import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppAlertEvent,
  AlertSettings,
  ConnectionStatus,
  DeployCommand,
  DeployCompleteEvent,
  DeployOutputEvent,
  DeployRun,
  HealthCheck,
  HealthCheckResult,
  ProcessMetrics,
  ServerAlertSettings,
  ServerConfig,
  ServerGroup,
  ServiceRecord
} from '../../../src/types';
import { IPC_EVENTS } from '../utils/events';

const api = {
  servers: {
    list: (): Promise<ServerConfig[]> => ipcRenderer.invoke(IPC_EVENTS.servers.list),
    add: (config: Omit<ServerConfig, 'id' | 'createdAt'>): Promise<ServerConfig> =>
      ipcRenderer.invoke(IPC_EVENTS.servers.add, config),
    addWithSecret: (
      config: Omit<ServerConfig, 'id' | 'createdAt'> & { password?: string; privateKeyPassphrase?: string }
    ): Promise<ServerConfig> => ipcRenderer.invoke(IPC_EVENTS.servers.addWithSecret, config),
    testConnection: (
      config: Omit<ServerConfig, 'id' | 'createdAt'> & { password?: string; privateKeyPassphrase?: string }
    ): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_EVENTS.servers.testConnection, config),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC_EVENTS.servers.remove, id),
    connect: (id: string): Promise<void> => ipcRenderer.invoke(IPC_EVENTS.servers.connect, id),
    disconnect: (id: string): Promise<void> => ipcRenderer.invoke(IPC_EVENTS.servers.disconnect, id),
    getStatus: (id: string): Promise<ConnectionStatus> => ipcRenderer.invoke(IPC_EVENTS.servers.getStatus, id),
    onStatus: (callback: (id: string, status: ConnectionStatus) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, id: string, status: ConnectionStatus): void => {
        callback(id, status);
      };
      ipcRenderer.on(IPC_EVENTS.servers.statusChanged, listener);
      return () => ipcRenderer.removeListener(IPC_EVENTS.servers.statusChanged, listener);
    }
  },
  services: {
    discover: (serverId: string): Promise<ServiceRecord[]> =>
      ipcRenderer.invoke(IPC_EVENTS.services.discover, serverId),
    control: (
      serverId: string,
      serviceId: string,
      action: 'start' | 'stop' | 'restart'
    ): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_EVENTS.services.control, serverId, serviceId, action)
  },
  metrics: {
    startPolling: (serverId: string, pids: number[]): Promise<void> =>
      ipcRenderer.invoke(IPC_EVENTS.metrics.start, serverId, pids),
    stopPolling: (serverId: string): Promise<void> => ipcRenderer.invoke(IPC_EVENTS.metrics.stop, serverId),
    onUpdate: (callback: (data: ProcessMetrics[]) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: ProcessMetrics[]): void => callback(data);
      ipcRenderer.on(IPC_EVENTS.metrics.update, listener);
      return () => ipcRenderer.removeListener(IPC_EVENTS.metrics.update, listener);
    }
  },
  logs: {
    start: (serverId: string, serviceId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_EVENTS.logs.start, serverId, serviceId),
    stop: (serverId: string, serviceId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_EVENTS.logs.stop, serverId, serviceId),
    pause: (serverId: string, serviceId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_EVENTS.logs.pause, serverId, serviceId),
    resume: (serverId: string, serviceId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_EVENTS.logs.resume, serverId, serviceId),
    export: (payload: { serverName: string; serviceName: string; lines: string[] }): Promise<{ canceled: boolean; filePath?: string }> =>
      ipcRenderer.invoke(IPC_EVENTS.logs.export, payload),
    onLine: (callback: (serviceId: string, line: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, serviceId: string, line: string): void => {
        callback(serviceId, line);
      };
      ipcRenderer.on(IPC_EVENTS.logs.line, listener);
      return () => ipcRenderer.removeListener(IPC_EVENTS.logs.line, listener);
    }
  },
  settings: {
    get: (): Promise<{ alerts: AlertSettings; servers: ServerAlertSettings[]; onboardingCompleted: boolean }> =>
      ipcRenderer.invoke(IPC_EVENTS.settings.get),
    updateAlerts: (settings: AlertSettings): Promise<AlertSettings> =>
      ipcRenderer.invoke(IPC_EVENTS.settings.updateAlerts, settings),
    setServerNotifications: (serverId: string, enabled: boolean): Promise<ServerAlertSettings> =>
      ipcRenderer.invoke(IPC_EVENTS.settings.setServerNotifications, serverId, enabled)
  },
  alerts: {
    onEvent: (callback: (event: AppAlertEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: AppAlertEvent): void => {
        callback(payload);
      };
      ipcRenderer.on(IPC_EVENTS.alerts.event, listener);
      return () => ipcRenderer.removeListener(IPC_EVENTS.alerts.event, listener);
    }
  },
  healthChecks: {
    list: (serverId: string, serviceKey: string, legacyServiceId?: string): Promise<HealthCheck[]> =>
      ipcRenderer.invoke(IPC_EVENTS.healthChecks.list, serverId, serviceKey, legacyServiceId),
    add: (
      serverId: string,
      serviceKey: string,
      config: { url: string; method?: string; expectedStatus?: number; timeoutMs?: number }
    ): Promise<HealthCheck> => ipcRenderer.invoke(IPC_EVENTS.healthChecks.add, serverId, serviceKey, config),
    remove: (checkId: string): Promise<void> => ipcRenderer.invoke(IPC_EVENTS.healthChecks.remove, checkId),
    getResults: (checkId: string): Promise<HealthCheckResult[]> => ipcRenderer.invoke(IPC_EVENTS.healthChecks.getResults, checkId),
    toggle: (checkId: string, enabled: boolean): Promise<void> => ipcRenderer.invoke(IPC_EVENTS.healthChecks.toggle, checkId, enabled),
    onResults: (callback: (checkId: string, results: HealthCheckResult[]) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, checkId: string, results: HealthCheckResult[]): void => {
        callback(checkId, results);
      };
      ipcRenderer.on(IPC_EVENTS.healthChecks.results, listener);
      return () => ipcRenderer.removeListener(IPC_EVENTS.healthChecks.results, listener);
    }
  },
  deploy: {
    list: (serverId: string): Promise<DeployCommand[]> => ipcRenderer.invoke(IPC_EVENTS.deploy.list, serverId),
    add: (
      serverId: string,
      config: { name: string; command: string; workingDir?: string; timeoutMs?: number }
    ): Promise<DeployCommand> => ipcRenderer.invoke(IPC_EVENTS.deploy.add, serverId, config),
    remove: (commandId: string): Promise<void> => ipcRenderer.invoke(IPC_EVENTS.deploy.remove, commandId),
    run: (serverId: string, commandId: string): Promise<string> => ipcRenderer.invoke(IPC_EVENTS.deploy.run, serverId, commandId),
    cancel: (serverId: string): Promise<void> => ipcRenderer.invoke(IPC_EVENTS.deploy.cancel, serverId),
    getHistory: (commandId: string): Promise<DeployRun[]> => ipcRenderer.invoke(IPC_EVENTS.deploy.getHistory, commandId),
    onOutput: (callback: (payload: DeployOutputEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: DeployOutputEvent): void => callback(payload);
      ipcRenderer.on(IPC_EVENTS.deploy.output, listener);
      return () => ipcRenderer.removeListener(IPC_EVENTS.deploy.output, listener);
    },
    onComplete: (callback: (payload: DeployCompleteEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: DeployCompleteEvent): void => callback(payload);
      ipcRenderer.on(IPC_EVENTS.deploy.complete, listener);
      return () => ipcRenderer.removeListener(IPC_EVENTS.deploy.complete, listener);
    },
    onState: (callback: (serverId: string, running: boolean) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, serverId: string, running: boolean): void => callback(serverId, running);
      ipcRenderer.on(IPC_EVENTS.deploy.state, listener);
      return () => ipcRenderer.removeListener(IPC_EVENTS.deploy.state, listener);
    }
  },
  groups: {
    list: (): Promise<ServerGroup[]> => ipcRenderer.invoke(IPC_EVENTS.groups.list),
    create: (name: string): Promise<ServerGroup> => ipcRenderer.invoke(IPC_EVENTS.groups.create, name),
    rename: (groupId: string, name: string): Promise<ServerGroup> => ipcRenderer.invoke(IPC_EVENTS.groups.rename, groupId, name),
    setCollapsed: (groupId: string, collapsed: boolean): Promise<ServerGroup> =>
      ipcRenderer.invoke(IPC_EVENTS.groups.setCollapsed, groupId, collapsed),
    assignServer: (serverId: string, groupId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC_EVENTS.groups.assignServer, serverId, groupId)
  },
  terminal: {
    create: (serverId: string): Promise<string> => ipcRenderer.invoke(IPC_EVENTS.terminal.create, serverId),
    write: (terminalId: string, data: string): void => ipcRenderer.send(IPC_EVENTS.terminal.write, terminalId, data),
    resize: (terminalId: string, cols: number, rows: number): void =>
      ipcRenderer.send(IPC_EVENTS.terminal.resize, terminalId, cols, rows),
    close: (terminalId: string): void => ipcRenderer.send(IPC_EVENTS.terminal.close, terminalId),
    onData: (callback: (terminalId: string, data: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, terminalId: string, data: string): void => {
        callback(terminalId, data);
      };
      ipcRenderer.on(IPC_EVENTS.terminal.data, listener);
      return () => ipcRenderer.removeListener(IPC_EVENTS.terminal.data, listener);
    }
  },
  hostKey: {
    onVerify: (callback: (host: string, fingerprint: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, host: string, fingerprint: string): void => {
        callback(host, fingerprint);
      };
      ipcRenderer.on(IPC_EVENTS.hostKey.verify, listener);
      return () => ipcRenderer.removeListener(IPC_EVENTS.hostKey.verify, listener);
    },
    respond: (host: string, accepted: boolean): void => {
      ipcRenderer.send(IPC_EVENTS.hostKey.respond, host, accepted);
    }
  }
};

contextBridge.exposeInMainWorld('api', api);
