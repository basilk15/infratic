import { create } from 'zustand';
import type { MetricsHistory, ProcessMetrics } from '@/types';
import { ipc } from '@/lib/ipc';

interface MetricsState {
  live: Record<string, ProcessMetrics>;
  history: Record<string, MetricsHistory>;
  applyMetricsUpdate: (metrics: ProcessMetrics[]) => void;
  startPolling: (serverId: string, pids: number[]) => Promise<void>;
  stopPolling: (serverId: string) => Promise<void>;
  clearServerMetrics: (serverId: string) => void;
}

export const useMetricsStore = create<MetricsState>((set) => ({
  live: {},
  history: {},
  applyMetricsUpdate: (metrics) => {
    set((state) => {
      const nextLive = { ...state.live };
      const nextHistory = { ...state.history };

      for (const metric of metrics) {
        nextLive[metric.serviceId] = metric;
        const existing = nextHistory[metric.serviceId] ?? { serviceId: metric.serviceId, samples: [] };

        const samples = [
          ...existing.samples,
          {
            t: metric.timestamp,
            cpu: metric.cpuPercent,
            mem: metric.memoryRss
          }
        ];

        nextHistory[metric.serviceId] = {
          serviceId: metric.serviceId,
          samples: samples.slice(-60)
        };
      }

      return {
        live: nextLive,
        history: nextHistory
      };
    });
  },
  startPolling: async (serverId, pids) => {
    await ipc.metrics.startPolling(serverId, pids);
  },
  stopPolling: async (serverId) => {
    await ipc.metrics.stopPolling(serverId);
  },
  clearServerMetrics: (serverId) => {
    set((state) => {
      const nextLive: Record<string, ProcessMetrics> = {};
      const nextHistory: Record<string, MetricsHistory> = {};

      for (const [serviceId, metric] of Object.entries(state.live)) {
        if (!serviceId.startsWith(`${serverId}:`)) {
          nextLive[serviceId] = metric;
        }
      }

      for (const [serviceId, history] of Object.entries(state.history)) {
        if (!serviceId.startsWith(`${serverId}:`)) {
          nextHistory[serviceId] = history;
        }
      }

      return {
        live: nextLive,
        history: nextHistory
      };
    });
  }
}));

export const subscribeToMetricsUpdates = (): (() => void) => {
  return ipc.metrics.onUpdate((metrics) => {
    useMetricsStore.getState().applyMetricsUpdate(metrics);
  });
};
