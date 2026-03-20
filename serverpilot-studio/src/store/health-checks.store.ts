import { create } from 'zustand';
import type { HealthCheck, HealthCheckResult, HealthStatus } from '@/types';
import { ipc } from '@/lib/ipc';

interface HealthChecksState {
  checksByServiceKey: Record<string, HealthCheck[]>;
  resultsByCheck: Record<string, HealthCheckResult[]>;
  error: string | null;
  loadForService: (serverId: string, serviceKey: string, legacyServiceId?: string) => Promise<void>;
  loadForServer: (serverId: string, services: Array<{ stableKey: string; id: string }>) => Promise<void>;
  addCheck: (serverId: string, serviceKey: string, config: { url: string; method?: string; expectedStatus?: number; timeoutMs?: number }) => Promise<void>;
  removeCheck: (serviceKey: string, checkId: string) => Promise<void>;
  toggleCheck: (checkId: string, enabled: boolean) => Promise<void>;
  applyResultsUpdate: (checkId: string, results: HealthCheckResult[]) => void;
  getServiceHealthStatus: (serviceKey: string) => HealthStatus | null;
}

const rank: Record<HealthStatus, number> = {
  down: 3,
  degraded: 2,
  healthy: 1,
  unknown: 0
};

export const useHealthChecksStore = create<HealthChecksState>((set, get) => ({
  checksByServiceKey: {},
  resultsByCheck: {},
  error: null,
  loadForService: async (serverId, serviceKey, legacyServiceId) => {
    set({ error: null });
    try {
      const checks = await ipc.healthChecks.list(serverId, serviceKey, legacyServiceId);
      const resultsEntries = await Promise.all(checks.map(async (check) => [check.id, await ipc.healthChecks.getResults(check.id)] as const));
      set((state) => ({
        checksByServiceKey: {
          ...state.checksByServiceKey,
          [serviceKey]: checks
        },
        resultsByCheck: {
          ...state.resultsByCheck,
          ...Object.fromEntries(resultsEntries)
        }
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load health checks' });
    }
  },
  loadForServer: async (serverId, services) => {
    await Promise.all(services.map((service) => get().loadForService(serverId, service.stableKey, service.id)));
  },
  addCheck: async (serverId, serviceKey, config) => {
    set({ error: null });
    try {
      const next = await ipc.healthChecks.add(serverId, serviceKey, config);
      const results = await ipc.healthChecks.getResults(next.id);
      set((state) => ({
        checksByServiceKey: {
          ...state.checksByServiceKey,
          [serviceKey]: [...(state.checksByServiceKey[serviceKey] ?? []), next]
        },
        resultsByCheck: {
          ...state.resultsByCheck,
          [next.id]: results
        }
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to add health check' });
    }
  },
  removeCheck: async (serviceKey, checkId) => {
    set({ error: null });
    try {
      await ipc.healthChecks.remove(checkId);
      set((state) => {
        const nextResults = { ...state.resultsByCheck };
        delete nextResults[checkId];
        return {
          checksByServiceKey: {
            ...state.checksByServiceKey,
            [serviceKey]: (state.checksByServiceKey[serviceKey] ?? []).filter((check) => check.id !== checkId)
          },
          resultsByCheck: nextResults
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove health check' });
    }
  },
  toggleCheck: async (checkId, enabled) => {
    set({ error: null });
    try {
      await ipc.healthChecks.toggle(checkId, enabled);
      set((state) => ({
        checksByServiceKey: Object.fromEntries(
          Object.entries(state.checksByServiceKey).map(([serviceKey, checks]) => [
            serviceKey,
            checks.map((check) => (check.id === checkId ? { ...check, enabled } : check))
          ])
        )
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update health check' });
    }
  },
  applyResultsUpdate: (checkId, results) => {
    set((state) => ({
      resultsByCheck: {
        ...state.resultsByCheck,
        [checkId]: results
      },
      checksByServiceKey: Object.fromEntries(
        Object.entries(state.checksByServiceKey).map(([serviceKey, checks]) => [
          serviceKey,
          checks.map((check) =>
            check.id === checkId
              ? {
                  ...check,
                  latestResult: results[results.length - 1]
                }
              : check
          )
        ])
      )
    }));
  },
  getServiceHealthStatus: (serviceKey) => {
    const checks = get().checksByServiceKey[serviceKey] ?? [];
    if (checks.length === 0) {
      return null;
    }
    return checks.reduce<HealthStatus>((worst, check) => {
      const resultList = get().resultsByCheck[check.id] ?? [];
      const status = resultList[resultList.length - 1]?.status ?? check.latestResult?.status ?? 'unknown';
      return rank[status] > rank[worst] ? status : worst;
    }, 'unknown');
  }
}));

export const subscribeToHealthCheckUpdates = (): (() => void) =>
  ipc.healthChecks.onResults((checkId, results) => {
    useHealthChecksStore.getState().applyResultsUpdate(checkId, results);
  });
