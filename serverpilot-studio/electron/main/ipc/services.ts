import { ipcMain } from 'electron';
import type { ConnectionStatus, ServiceRecord } from '../../../src/types';
import { IPC_EVENTS } from '../utils/events';
import { logError } from '../utils/logger';
import type { AppIpcContext } from './context';

const statusBySystemdText = (text: string): ServiceRecord['status'] => {
  if (text.includes('active')) {
    return 'running';
  }
  if (text.includes('failed')) {
    return 'failed';
  }
  if (text.includes('inactive')) {
    return 'stopped';
  }
  return 'unknown';
};

const READY_STATUSES: ReadonlySet<ConnectionStatus> = new Set(['connected', 'degraded', 'reconnecting']);

const ensureLinuxHost = async (ctx: AppIpcContext, serverId: string): Promise<void> => {
  const server = ctx.db.getServer(serverId);
  if (!server) {
    throw new Error('Server not found.');
  }

  if (server.serverType === 'local') {
    return;
  }

  const status = ctx.transports.getStatus(serverId);
  if (!READY_STATUSES.has(status)) {
    throw new Error('Server is not connected yet. Connect first, then run discovery.');
  }

  const transport = ctx.transports.getTransport(serverId);
  const unameResult = await transport.exec('uname -s 2>/dev/null');
  const combinedOutput = `${unameResult.stdout}\n${unameResult.stderr}`.trim().toLowerCase();

  if (combinedOutput.includes('linux')) {
    return;
  }

  // Fallback path for edge cases where uname is unavailable but /proc exists.
  const procResult = await transport.exec('cat /proc/sys/kernel/ostype 2>/dev/null');
  const procOutput = `${procResult.stdout}\n${procResult.stderr}`.trim().toLowerCase();
  if (procOutput.includes('linux')) {
    return;
  }

  const detected = combinedOutput || procOutput || 'unknown';
  throw new Error(`Unsupported remote host OS (${detected}). Phase 1 supports Linux hosts only.`);
};

export const executeServiceAction = async (
  ctx: AppIpcContext,
  serverId: string,
  service: ServiceRecord,
  action: 'start' | 'stop' | 'restart'
): Promise<{ success: boolean; message: string }> => {
  const transport = ctx.transports.getTransport(serverId);

  if (service.manager === 'systemd') {
    const unit = service.name;
    const command = `sudo -n systemctl ${action} ${unit}`;
    const result = await transport.exec(command);

    if (result.exitCode === 0) {
      const statusResult = await transport.exec(`systemctl is-active ${unit} 2>/dev/null`);
      const status = statusBySystemdText(statusResult.stdout.trim());
      return { success: true, message: `systemd ${action} completed (${status})` };
    }

    return {
      success: false,
      message:
        result.stderr.trim() ||
        'systemd action failed. Ensure passwordless sudo is configured for this unit.'
    };
  }

  if (service.manager === 'pm2') {
    const command = `pm2 ${action} ${service.name}`;
    const result = await transport.exec(command);
    return {
      success: result.exitCode === 0,
      message: result.exitCode === 0 ? `pm2 ${action} completed` : result.stderr.trim() || 'pm2 action failed'
    };
  }

  if (service.manager === 'raw') {
    if (action === 'start') {
      return { success: false, message: 'cannot start raw process: no manager attached' };
    }

    const command = action === 'stop' ? `kill -TERM ${service.pid}` : `kill -HUP ${service.pid}`;
    const result = await transport.exec(command);
    return {
      success: result.exitCode === 0,
      message: result.exitCode === 0 ? `signal sent (${action})` : result.stderr.trim() || 'signal action failed'
    };
  }

  return { success: false, message: 'unknown service manager' };
};

export const registerServicesIpc = (ctx: AppIpcContext): void => {
  ipcMain.handle(IPC_EVENTS.services.discover, async (_event, serverId: string): Promise<ServiceRecord[]> => {
    try {
      await ensureLinuxHost(ctx, serverId);
      const previousServices = [...(ctx.serviceCache.get(serverId)?.values() ?? [])];
      const services = await ctx.discovery.discover(serverId);
      const byId = new Map<string, ServiceRecord>();
      for (const service of services) {
        byId.set(service.id, service);
      }
      ctx.serviceCache.set(serverId, byId);
      await ctx.alertManager.notifyServiceTransitions(ctx.db.getServer(serverId), previousServices, services);
      return services;
    } catch (err) {
      logError('ipc:services', 'discover failed', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to discover services');
    }
  });

  ipcMain.handle(
    IPC_EVENTS.services.control,
    async (
      _event,
      serverId: string,
      serviceId: string,
      action: 'start' | 'stop' | 'restart'
    ): Promise<{ success: boolean; message: string }> => {
      try {
        await ensureLinuxHost(ctx, serverId);
        const service = ctx.serviceCache.get(serverId)?.get(serviceId);
        if (!service) {
          return { success: false, message: 'Service not found in cache. Run discovery first.' };
        }

        return executeServiceAction(ctx, serverId, service, action);
      } catch (err) {
        logError('ipc:services', 'control failed', err);
        return { success: false, message: err instanceof Error ? err.message : 'Service action failed' };
      }
    }
  );

  ipcMain.handle(IPC_EVENTS.services.portOverview, async (_event, serverId: string) => {
    try {
      ctx.portMonitor.start(serverId);
      return ctx.portMonitor.getLatest(serverId);
    } catch (err) {
      logError('ipc:services', 'portOverview failed', err);
      return [];
    }
  });
};
