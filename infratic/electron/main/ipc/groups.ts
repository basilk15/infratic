import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { ServerGroup } from '../../../src/types';
import { IPC_EVENTS } from '../utils/events';
import { logError } from '../utils/logger';
import type { AppIpcContext } from './context';

export const registerGroupsIpc = (ctx: AppIpcContext): void => {
  ipcMain.handle(IPC_EVENTS.groups.list, async (): Promise<ServerGroup[]> => {
    try {
      return ctx.db.listServerGroups();
    } catch (err) {
      logError('ipc:groups', 'list failed', err);
      throw new Error('Failed to load server groups');
    }
  });

  ipcMain.handle(IPC_EVENTS.groups.create, async (_event, name: string): Promise<ServerGroup> => {
    try {
      return ctx.db.createServerGroup({ id: uuidv4(), name: name.trim() });
    } catch (err) {
      logError('ipc:groups', 'create failed', err);
      throw new Error('Failed to create server group');
    }
  });

  ipcMain.handle(IPC_EVENTS.groups.rename, async (_event, groupId: string, name: string): Promise<ServerGroup> => {
    try {
      return ctx.db.renameServerGroup(groupId, name.trim());
    } catch (err) {
      logError('ipc:groups', 'rename failed', err);
      throw new Error('Failed to rename server group');
    }
  });

  ipcMain.handle(
    IPC_EVENTS.groups.setCollapsed,
    async (_event, groupId: string, collapsed: boolean): Promise<ServerGroup> => {
      try {
        return ctx.db.setServerGroupCollapsed(groupId, collapsed);
      } catch (err) {
        logError('ipc:groups', 'setCollapsed failed', err);
        throw new Error('Failed to update server group state');
      }
    }
  );

  ipcMain.handle(IPC_EVENTS.groups.assignServer, async (_event, serverId: string, groupId: string | null): Promise<void> => {
    try {
      ctx.db.assignServerToGroup(serverId, groupId);
    } catch (err) {
      logError('ipc:groups', 'assignServer failed', err);
      throw new Error('Failed to assign server to group');
    }
  });
};
