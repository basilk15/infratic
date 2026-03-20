import { create } from 'zustand';
import type { DeployCommand, DeployCompleteEvent, DeployOutputEvent, DeployRun } from '@/types';
import { ipc } from '@/lib/ipc';

interface DeployState {
  commandsByServer: Record<string, DeployCommand[]>;
  historyByCommand: Record<string, DeployRun[]>;
  runningByServer: Record<string, boolean>;
  activeRunIdByServer: Record<string, string | null>;
  lastRunIdByServer: Record<string, string | null>;
  activeCommandIdByServer: Record<string, string | null>;
  outputByRun: Record<string, string>;
  error: string | null;
  loadCommands: (serverId: string) => Promise<void>;
  addCommand: (serverId: string, config: { name: string; command: string; workingDir?: string; timeoutMs?: number }) => Promise<void>;
  removeCommand: (serverId: string, commandId: string) => Promise<void>;
  loadHistory: (commandId: string) => Promise<void>;
  runCommand: (serverId: string, commandId: string) => Promise<void>;
  cancel: (serverId: string) => Promise<void>;
  applyOutput: (payload: DeployOutputEvent) => void;
  applyComplete: (payload: DeployCompleteEvent) => void;
  applyState: (serverId: string, running: boolean) => void;
}

export const useDeployStore = create<DeployState>((set, get) => ({
  commandsByServer: {},
  historyByCommand: {},
  runningByServer: {},
  activeRunIdByServer: {},
  lastRunIdByServer: {},
  activeCommandIdByServer: {},
  outputByRun: {},
  error: null,
  loadCommands: async (serverId) => {
    set({ error: null });
    try {
      const commands = await ipc.deploy.list(serverId);
      set((state) => ({
        commandsByServer: {
          ...state.commandsByServer,
          [serverId]: commands
        }
      }));
      await Promise.all(commands.map((command) => get().loadHistory(command.id)));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load deploy commands' });
    }
  },
  addCommand: async (serverId, config) => {
    set({ error: null });
    try {
      const next = await ipc.deploy.add(serverId, config);
      set((state) => ({
        commandsByServer: {
          ...state.commandsByServer,
          [serverId]: [...(state.commandsByServer[serverId] ?? []), next]
        }
      }));
      await get().loadHistory(next.id);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to add deploy command' });
    }
  },
  removeCommand: async (serverId, commandId) => {
    set({ error: null });
    try {
      await ipc.deploy.remove(commandId);
      set((state) => ({
        commandsByServer: {
          ...state.commandsByServer,
          [serverId]: (state.commandsByServer[serverId] ?? []).filter((command) => command.id !== commandId)
        }
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove deploy command' });
    }
  },
  loadHistory: async (commandId) => {
    try {
      const history = await ipc.deploy.getHistory(commandId);
      set((state) => ({
        historyByCommand: {
          ...state.historyByCommand,
          [commandId]: history
        }
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load deploy history' });
    }
  },
  runCommand: async (serverId, commandId) => {
    set({ error: null });
    try {
      const runId = await ipc.deploy.run(serverId, commandId);
      set((state) => ({
        runningByServer: { ...state.runningByServer, [serverId]: true },
        activeRunIdByServer: { ...state.activeRunIdByServer, [serverId]: runId },
        lastRunIdByServer: { ...state.lastRunIdByServer, [serverId]: runId },
        activeCommandIdByServer: { ...state.activeCommandIdByServer, [serverId]: commandId },
        outputByRun: { ...state.outputByRun, [runId]: '' }
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to run deploy command' });
    }
  },
  cancel: async (serverId) => {
    set({ error: null });
    try {
      await ipc.deploy.cancel(serverId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to cancel deploy command' });
    }
  },
  applyOutput: (payload) =>
    set((state) => ({
      outputByRun: {
        ...state.outputByRun,
        [payload.runId]: `${state.outputByRun[payload.runId] ?? ''}${payload.chunk}`
      }
    })),
  applyComplete: (payload) =>
    set((state) => {
      void get().loadHistory(payload.commandId);
      return {
        runningByServer: { ...state.runningByServer, [payload.serverId]: false },
        activeRunIdByServer: { ...state.activeRunIdByServer, [payload.serverId]: null },
        lastRunIdByServer: { ...state.lastRunIdByServer, [payload.serverId]: payload.runId },
        activeCommandIdByServer: { ...state.activeCommandIdByServer, [payload.serverId]: null }
      };
    }),
  applyState: (serverId, running) =>
    set((state) => ({
      runningByServer: { ...state.runningByServer, [serverId]: running }
    }))
}));

export const subscribeToDeployEvents = (): (() => void) => {
  const unsubscribeOutput = ipc.deploy.onOutput((payload) => {
    useDeployStore.getState().applyOutput(payload);
  });
  const unsubscribeComplete = ipc.deploy.onComplete((payload) => {
    useDeployStore.getState().applyComplete(payload);
  });
  const unsubscribeState = ipc.deploy.onState((serverId, running) => {
    useDeployStore.getState().applyState(serverId, running);
  });

  return () => {
    unsubscribeOutput();
    unsubscribeComplete();
    unsubscribeState();
  };
};
