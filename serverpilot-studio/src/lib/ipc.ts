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
} from '@/types';

interface AddServerSecretPayload {
  password?: string;
  privateKeyPassphrase?: string;
}

interface ExtendedApi {
  servers: {
    addWithSecret?: (
      config: Omit<ServerConfig, 'id' | 'createdAt'> & AddServerSecretPayload
    ) => Promise<ServerConfig>;
    onStatus?: (callback: (id: string, status: ConnectionStatus) => void) => () => void;
    testConnection?: (
      config: Omit<ServerConfig, 'id' | 'createdAt'> & AddServerSecretPayload
    ) => Promise<{ success: boolean; message: string }>;
  };
}

const api = window.api;
const extended = window.api as unknown as ExtendedApi;

export const ipc = {
  servers: {
    list: (): Promise<ServerConfig[]> => api.servers.list(),
    add: (config: Omit<ServerConfig, 'id' | 'createdAt'>): Promise<ServerConfig> => api.servers.add(config),
    addWithSecret: (
      config: Omit<ServerConfig, 'id' | 'createdAt'> & AddServerSecretPayload
    ): Promise<ServerConfig> => {
      if (extended.servers.addWithSecret) {
        return extended.servers.addWithSecret(config);
      }
      return api.servers.add(config);
    },
    testConnection: (
      config: Omit<ServerConfig, 'id' | 'createdAt'> & AddServerSecretPayload
    ): Promise<{ success: boolean; message: string }> => {
      if (extended.servers.testConnection) {
        return extended.servers.testConnection(config);
      }
      return Promise.resolve({ success: false, message: 'testConnection IPC is unavailable' });
    },
    remove: (id: string): Promise<void> => api.servers.remove(id),
    connect: (id: string): Promise<void> => api.servers.connect(id),
    disconnect: (id: string): Promise<void> => api.servers.disconnect(id),
    getStatus: (id: string): Promise<ConnectionStatus> => api.servers.getStatus(id),
    onStatus: (callback: (id: string, status: ConnectionStatus) => void): (() => void) => {
      if (extended.servers.onStatus) {
        return extended.servers.onStatus(callback);
      }
      return () => {
        return;
      };
    }
  },
  services: {
    discover: (serverId: string): Promise<ServiceRecord[]> => api.services.discover(serverId),
    control: (
      serverId: string,
      serviceId: string,
      action: 'start' | 'stop' | 'restart'
    ): Promise<{ success: boolean; message: string }> => api.services.control(serverId, serviceId, action)
  },
  metrics: {
    startPolling: (serverId: string, pids: number[]): Promise<void> => api.metrics.startPolling(serverId, pids),
    stopPolling: (serverId: string): Promise<void> => api.metrics.stopPolling(serverId),
    onUpdate: (callback: (data: ProcessMetrics[]) => void): (() => void) => api.metrics.onUpdate(callback)
  },
  logs: {
    start: (serverId: string, serviceId: string): Promise<void> => api.logs.start(serverId, serviceId),
    stop: (serverId: string, serviceId: string): Promise<void> => api.logs.stop(serverId, serviceId),
    pause: (serverId: string, serviceId: string): Promise<void> => api.logs.pause(serverId, serviceId),
    resume: (serverId: string, serviceId: string): Promise<void> => api.logs.resume(serverId, serviceId),
    export: (payload: { serverName: string; serviceName: string; lines: string[] }): Promise<{ canceled: boolean; filePath?: string }> =>
      api.logs.export(payload),
    onLine: (callback: (serviceId: string, line: string) => void): (() => void) => api.logs.onLine(callback)
  },
  settings: {
    get: (): Promise<{ alerts: AlertSettings; servers: ServerAlertSettings[]; onboardingCompleted: boolean }> =>
      api.settings.get(),
    updateAlerts: (settings: AlertSettings): Promise<AlertSettings> => api.settings.updateAlerts(settings),
    setServerNotifications: (serverId: string, enabled: boolean): Promise<ServerAlertSettings> =>
      api.settings.setServerNotifications(serverId, enabled)
  },
  alerts: {
    onEvent: (callback: (event: AppAlertEvent) => void): (() => void) => api.alerts.onEvent(callback)
  },
  healthChecks: {
    list: (serverId: string, serviceKey: string, legacyServiceId?: string): Promise<HealthCheck[]> =>
      api.healthChecks.list(serverId, serviceKey, legacyServiceId),
    add: (
      serverId: string,
      serviceKey: string,
      config: { url: string; method?: string; expectedStatus?: number; timeoutMs?: number }
    ): Promise<HealthCheck> => api.healthChecks.add(serverId, serviceKey, config),
    remove: (checkId: string): Promise<void> => api.healthChecks.remove(checkId),
    getResults: (checkId: string): Promise<HealthCheckResult[]> => api.healthChecks.getResults(checkId),
    toggle: (checkId: string, enabled: boolean): Promise<void> => api.healthChecks.toggle(checkId, enabled),
    onResults: (callback: (checkId: string, results: HealthCheckResult[]) => void): (() => void) =>
      api.healthChecks.onResults(callback)
  },
  deploy: {
    list: (serverId: string): Promise<DeployCommand[]> => api.deploy.list(serverId),
    add: (
      serverId: string,
      config: { name: string; command: string; workingDir?: string; timeoutMs?: number }
    ): Promise<DeployCommand> => api.deploy.add(serverId, config),
    remove: (commandId: string): Promise<void> => api.deploy.remove(commandId),
    run: (serverId: string, commandId: string): Promise<string> => api.deploy.run(serverId, commandId),
    cancel: (serverId: string): Promise<void> => api.deploy.cancel(serverId),
    getHistory: (commandId: string): Promise<DeployRun[]> => api.deploy.getHistory(commandId),
    onOutput: (callback: (payload: DeployOutputEvent) => void): (() => void) => api.deploy.onOutput(callback),
    onComplete: (callback: (payload: DeployCompleteEvent) => void): (() => void) => api.deploy.onComplete(callback),
    onState: (callback: (serverId: string, running: boolean) => void): (() => void) => api.deploy.onState(callback)
  },
  groups: {
    list: (): Promise<ServerGroup[]> => api.groups.list(),
    create: (name: string): Promise<ServerGroup> => api.groups.create(name),
    rename: (groupId: string, name: string): Promise<ServerGroup> => api.groups.rename(groupId, name),
    setCollapsed: (groupId: string, collapsed: boolean): Promise<ServerGroup> => api.groups.setCollapsed(groupId, collapsed),
    assignServer: (serverId: string, groupId: string | null): Promise<void> => api.groups.assignServer(serverId, groupId)
  },
  terminal: {
    create: (serverId: string): Promise<string> => api.terminal.create(serverId),
    write: (terminalId: string, data: string): void => api.terminal.write(terminalId, data),
    resize: (terminalId: string, cols: number, rows: number): void => api.terminal.resize(terminalId, cols, rows),
    close: (terminalId: string): void => api.terminal.close(terminalId),
    onData: (callback: (terminalId: string, data: string) => void): (() => void) => api.terminal.onData(callback)
  },
  hostKey: {
    onVerify: (callback: (host: string, fingerprint: string) => void): (() => void) => api.hostKey.onVerify(callback),
    respond: (host: string, accepted: boolean): void => api.hostKey.respond(host, accepted)
  }
};
