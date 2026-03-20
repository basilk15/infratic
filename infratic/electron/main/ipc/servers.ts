import { ipcMain } from 'electron';
import { hostname, platform, userInfo } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import type { ServerConfig } from '../../../src/types';
import { IPC_EVENTS } from '../utils/events';
import { logError } from '../utils/logger';
import type { AppIpcContext } from './context';

interface AddServerPayload extends Omit<ServerConfig, 'id' | 'createdAt'> {
  password?: string;
  privateKeyPassphrase?: string;
}

const normalizeServer = (input: Omit<ServerConfig, 'id' | 'createdAt'>): ServerConfig => ({
  id: uuidv4(),
  serverType: input.serverType,
  name: input.name,
  host: input.host,
  port: input.port || 22,
  username: input.username,
  authMethod: input.authMethod,
  privateKeyPath: input.privateKeyPath,
  createdAt: Date.now()
});

const normalizeLocalServer = (input: Omit<ServerConfig, 'id' | 'createdAt'>): Omit<ServerConfig, 'id' | 'createdAt'> => ({
  serverType: 'local',
  name: input.name.trim() || hostname(),
  host: 'localhost',
  port: 22,
  username: userInfo().username,
  authMethod: 'agent'
});

const addServerInternal = async (ctx: AppIpcContext, payload: AddServerPayload): Promise<ServerConfig> => {
  if (payload.serverType === 'local') {
    if (platform() !== 'linux') {
      throw new Error('Local Machine support is currently available only on Linux.');
    }
    if (ctx.db.listServers().some((server) => server.serverType === 'local')) {
      throw new Error('Only one local machine entry can exist at a time.');
    }
  }

  const normalizedPayload = payload.serverType === 'local' ? normalizeLocalServer(payload) : payload;
  const server = normalizeServer(normalizedPayload);
  ctx.db.addServer(server);
  ctx.db.setOnboardingCompleted(true);

  const secret = server.serverType === 'ssh' && payload.authMethod === 'password' ? payload.password : payload.privateKeyPassphrase;
  if (server.serverType === 'ssh' && typeof secret === 'string' && secret.length > 0) {
    await ctx.credentials.setServerSecret(server.id, secret);
  }

  return server;
};

export const registerServersIpc = (ctx: AppIpcContext): void => {
  ipcMain.handle(IPC_EVENTS.servers.list, async () => {
    try {
      return ctx.db.listServers();
    } catch (err) {
      logError('ipc:servers', 'list failed', err);
      return [] as ServerConfig[];
    }
  });

  ipcMain.handle(
    IPC_EVENTS.servers.add,
    async (_event, payload: Omit<ServerConfig, 'id' | 'createdAt'>): Promise<ServerConfig> => {
      try {
        return await addServerInternal(ctx, payload);
      } catch (err) {
        logError('ipc:servers', 'add failed', err);
        throw new Error('Failed to add server');
      }
    }
  );

  ipcMain.handle(IPC_EVENTS.servers.addWithSecret, async (_event, payload: AddServerPayload) => {
    try {
      return await addServerInternal(ctx, payload);
    } catch (err) {
      logError('ipc:servers', 'addWithSecret failed', err);
      throw new Error('Failed to add server with credential');
    }
  });

  ipcMain.handle(
    IPC_EVENTS.servers.testConnection,
    async (
      _event,
      payload: AddServerPayload
    ): Promise<{
      success: boolean;
      message: string;
    }> => {
      try {
        const temporaryServer = normalizeServer(payload);
        if (temporaryServer.serverType === 'local') {
          return { success: true, message: 'Local machine does not require SSH connection testing.' };
        }
        const secret = payload.authMethod === 'password' ? payload.password : payload.privateKeyPassphrase;
        const result = await ctx.pool.testConnection(temporaryServer, secret ?? null);
        return result;
      } catch (err) {
        logError('ipc:servers', 'testConnection failed', err);
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Failed to test connection'
        };
      }
    }
  );

  ipcMain.handle(IPC_EVENTS.servers.remove, async (_event, id: string): Promise<void> => {
    try {
      await ctx.transports.disconnect(id);
      ctx.portMonitor.stop(id);
      ctx.metricsReaders.get(id)?.stop();
      ctx.metricsReaders.delete(id);
      ctx.alertManager.clearServerState(id);
      ctx.db.removeServer(id);
      const server = ctx.db.getServer(id);
      if (server?.serverType === 'ssh') {
        await ctx.credentials.deleteServerSecret(id);
      }
    } catch (err) {
      logError('ipc:servers', 'remove failed', err);
      throw new Error('Failed to remove server');
    }
  });

  ipcMain.handle(IPC_EVENTS.servers.connect, async (_event, id: string): Promise<void> => {
    try {
      const server = ctx.db.getServer(id);
      if (!server) {
        throw new Error(`Server ${id} not found`);
      }

      await ctx.transports.connect(server);
      ctx.portMonitor.start(id);
    } catch (err) {
      logError('ipc:servers', 'connect failed', err);
      throw new Error('Failed to connect server');
    }
  });

  ipcMain.handle(IPC_EVENTS.servers.disconnect, async (_event, id: string): Promise<void> => {
    try {
      ctx.portMonitor.stop(id);
      ctx.metricsReaders.get(id)?.stop();
      ctx.metricsReaders.delete(id);
      ctx.alertManager.clearServerState(id);
      await ctx.transports.disconnect(id);
    } catch (err) {
      logError('ipc:servers', 'disconnect failed', err);
      throw new Error('Failed to disconnect server');
    }
  });

  ipcMain.handle(IPC_EVENTS.servers.getStatus, async (_event, id: string) => {
    try {
      return ctx.transports.getStatus(id);
    } catch (err) {
      logError('ipc:servers', 'getStatus failed', err);
      return 'failed';
    }
  });
};
