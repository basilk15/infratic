import { create } from 'zustand';
import type { ConnectionStatus, ServerConfig } from '@/types';
import { ipc } from '@/lib/ipc';

interface NewServerInput extends Omit<ServerConfig, 'id' | 'createdAt'> {
  password?: string;
  privateKeyPassphrase?: string;
}

interface ServersState {
  servers: ServerConfig[];
  statuses: Record<string, ConnectionStatus>;
  selectedServerId: string | null;
  isLoading: boolean;
  error: string | null;
  setSelectedServer: (serverId: string | null) => void;
  loadServers: () => Promise<void>;
  addServer: (input: NewServerInput) => Promise<ServerConfig | null>;
  removeServer: (id: string) => Promise<void>;
  connectServer: (id: string) => Promise<void>;
  disconnectServer: (id: string) => Promise<void>;
  setStatus: (id: string, status: ConnectionStatus) => void;
  testConnection: (input: NewServerInput) => Promise<{ success: boolean; message: string }>;
  setServerGroup: (serverId: string, groupId: string | null) => Promise<void>;
}

export const useServersStore = create<ServersState>((set, get) => ({
  servers: [],
  statuses: {},
  selectedServerId: null,
  isLoading: false,
  error: null,
  setSelectedServer: (serverId) => set({ selectedServerId: serverId }),
  loadServers: async () => {
    set({ isLoading: true, error: null });
    try {
      const servers = await ipc.servers.list();
      const statuses: Record<string, ConnectionStatus> = {};
      for (const server of servers) {
        statuses[server.id] = await ipc.servers.getStatus(server.id);
      }

      set({
        servers,
        statuses,
        isLoading: false,
        selectedServerId: get().selectedServerId ?? servers[0]?.id ?? null
      });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load servers' });
    }
  },
  addServer: async (input) => {
    set({ error: null });
    try {
      const server = await ipc.servers.addWithSecret(input);
      set((state) => ({
        servers: [server, ...state.servers],
        statuses: {
          ...state.statuses,
          [server.id]: server.serverType === 'local' ? 'connected' : 'disconnected'
        },
        selectedServerId: state.selectedServerId ?? server.id
      }));
      return server;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to add server' });
      return null;
    }
  },
  removeServer: async (id) => {
    set({ error: null });
    try {
      await ipc.servers.remove(id);
      set((state) => {
        const nextServers = state.servers.filter((server) => server.id !== id);
        const nextStatuses = { ...state.statuses };
        delete nextStatuses[id];

        return {
          servers: nextServers,
          statuses: nextStatuses,
          selectedServerId:
            state.selectedServerId === id ? (nextServers.length > 0 ? (nextServers[0]?.id ?? null) : null) : state.selectedServerId
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove server' });
    }
  },
  connectServer: async (id) => {
    const server = get().servers.find((entry) => entry.id === id);
    if (server?.serverType === 'local') {
      set((state) => ({ statuses: { ...state.statuses, [id]: 'connected' }, error: null }));
      return;
    }
    set((state) => ({ statuses: { ...state.statuses, [id]: 'connecting' }, error: null }));
    try {
      await ipc.servers.connect(id);
    } catch (err) {
      set((state) => ({
        statuses: { ...state.statuses, [id]: 'failed' },
        error: err instanceof Error ? err.message : 'Failed to connect server'
      }));
    }
  },
  disconnectServer: async (id) => {
    const server = get().servers.find((entry) => entry.id === id);
    if (server?.serverType === 'local') {
      set((state) => ({ statuses: { ...state.statuses, [id]: 'connected' }, error: null }));
      return;
    }
    set({ error: null });
    try {
      await ipc.servers.disconnect(id);
      set((state) => ({ statuses: { ...state.statuses, [id]: 'disconnected' } }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to disconnect server' });
    }
  },
  setStatus: (id, status) => {
    set((state) => ({
      statuses: {
        ...state.statuses,
        [id]: status
      }
    }));
  },
  testConnection: async (input) => {
    return ipc.servers.testConnection(input);
  },
  setServerGroup: async (serverId, groupId) => {
    set({ error: null });
    try {
      await ipc.groups.assignServer(serverId, groupId);
      set((state) => ({
        servers: state.servers.map((server) =>
          server.id === serverId
            ? {
                ...server,
                groupId: groupId ?? undefined
              }
            : server
        )
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update server group' });
    }
  }
}));
