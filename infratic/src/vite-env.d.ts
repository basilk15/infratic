/// <reference types="vite/client" />

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

declare global {
  interface Window {
    api: {
      servers: {
        list: () => Promise<ServerConfig[]>;
        add: (config: Omit<ServerConfig, 'id' | 'createdAt'>) => Promise<ServerConfig>;
        addWithSecret: (
          config: Omit<ServerConfig, 'id' | 'createdAt'> & { password?: string; privateKeyPassphrase?: string }
        ) => Promise<ServerConfig>;
        testConnection: (
          config: Omit<ServerConfig, 'id' | 'createdAt'> & { password?: string; privateKeyPassphrase?: string }
        ) => Promise<{ success: boolean; message: string }>;
        remove: (id: string) => Promise<void>;
        connect: (id: string) => Promise<void>;
        disconnect: (id: string) => Promise<void>;
        getStatus: (id: string) => Promise<ConnectionStatus>;
        onStatus: (callback: (id: string, status: ConnectionStatus) => void) => () => void;
      };
      services: {
        discover: (serverId: string) => Promise<ServiceRecord[]>;
        control: (
          serverId: string,
          serviceId: string,
          action: 'start' | 'stop' | 'restart'
        ) => Promise<{ success: boolean; message: string }>;
      };
      metrics: {
        startPolling: (serverId: string, pids: number[]) => Promise<void>;
        stopPolling: (serverId: string) => Promise<void>;
        onUpdate: (callback: (data: ProcessMetrics[]) => void) => () => void;
      };
      logs: {
        start: (serverId: string, serviceId: string) => Promise<void>;
        stop: (serverId: string, serviceId: string) => Promise<void>;
        pause: (serverId: string, serviceId: string) => Promise<void>;
        resume: (serverId: string, serviceId: string) => Promise<void>;
        export: (payload: {
          serverName: string;
          serviceName: string;
          lines: string[];
        }) => Promise<{ canceled: boolean; filePath?: string }>;
        onLine: (callback: (serviceId: string, line: string) => void) => () => void;
      };
      settings: {
        get: () => Promise<{ alerts: AlertSettings; servers: ServerAlertSettings[]; onboardingCompleted: boolean }>;
        updateAlerts: (settings: AlertSettings) => Promise<AlertSettings>;
        setServerNotifications: (serverId: string, enabled: boolean) => Promise<ServerAlertSettings>;
      };
      alerts: {
        onEvent: (callback: (event: AppAlertEvent) => void) => () => void;
      };
      healthChecks: {
        list: (serverId: string, serviceKey: string, legacyServiceId?: string) => Promise<HealthCheck[]>;
        add: (
          serverId: string,
          serviceKey: string,
          config: { url: string; method?: string; expectedStatus?: number; timeoutMs?: number }
        ) => Promise<HealthCheck>;
        remove: (checkId: string) => Promise<void>;
        getResults: (checkId: string) => Promise<HealthCheckResult[]>;
        toggle: (checkId: string, enabled: boolean) => Promise<void>;
        onResults: (callback: (checkId: string, results: HealthCheckResult[]) => void) => () => void;
      };
      deploy: {
        list: (serverId: string) => Promise<DeployCommand[]>;
        add: (
          serverId: string,
          config: { name: string; command: string; workingDir?: string; timeoutMs?: number }
        ) => Promise<DeployCommand>;
        remove: (commandId: string) => Promise<void>;
        run: (serverId: string, commandId: string) => Promise<string>;
        cancel: (serverId: string) => Promise<void>;
        getHistory: (commandId: string) => Promise<DeployRun[]>;
        onOutput: (callback: (payload: DeployOutputEvent) => void) => () => void;
        onComplete: (callback: (payload: DeployCompleteEvent) => void) => () => void;
        onState: (callback: (serverId: string, running: boolean) => void) => () => void;
      };
      groups: {
        list: () => Promise<ServerGroup[]>;
        create: (name: string) => Promise<ServerGroup>;
        rename: (groupId: string, name: string) => Promise<ServerGroup>;
        setCollapsed: (groupId: string, collapsed: boolean) => Promise<ServerGroup>;
        assignServer: (serverId: string, groupId: string | null) => Promise<void>;
      };
      terminal: {
        create: (serverId: string) => Promise<string>;
        write: (terminalId: string, data: string) => void;
        resize: (terminalId: string, cols: number, rows: number) => void;
        close: (terminalId: string) => void;
        onData: (callback: (terminalId: string, data: string) => void) => () => void;
      };
      hostKey: {
        onVerify: (callback: (host: string, fingerprint: string) => void) => () => void;
        respond: (host: string, accepted: boolean) => void;
      };
    };
  }
}

export {};
