import { create } from 'zustand';
import type { AlertSettings, ServerAlertSettings } from '@/types';
import { ipc } from '@/lib/ipc';

interface SettingsState {
  alerts: AlertSettings;
  serverSettings: Record<string, ServerAlertSettings>;
  onboardingCompleted: boolean;
  isLoading: boolean;
  error: string | null;
  load: () => Promise<void>;
  updateAlerts: (settings: AlertSettings) => Promise<void>;
  setServerNotifications: (serverId: string, enabled: boolean) => Promise<void>;
  markOnboardingCompleted: () => void;
}

const defaultAlerts: AlertSettings = {
  notificationsEnabled: true,
  cpuThresholdPercent: 80,
  memoryThresholdPercent: 80
};

export const useSettingsStore = create<SettingsState>((set) => ({
  alerts: defaultAlerts,
  serverSettings: {},
  onboardingCompleted: false,
  isLoading: false,
  error: null,
  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const payload = await ipc.settings.get();
      set({
        alerts: payload.alerts,
        serverSettings: Object.fromEntries(payload.servers.map((item) => [item.serverId, item])),
        onboardingCompleted: payload.onboardingCompleted,
        isLoading: false
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load settings'
      });
    }
  },
  updateAlerts: async (settings) => {
    set({ error: null });
    try {
      const next = await ipc.settings.updateAlerts(settings);
      set({ alerts: next });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update settings' });
    }
  },
  setServerNotifications: async (serverId, enabled) => {
    set({ error: null });
    try {
      const next = await ipc.settings.setServerNotifications(serverId, enabled);
      set((state) => ({
        serverSettings: {
          ...state.serverSettings,
          [serverId]: next
        }
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update server notifications' });
    }
  },
  markOnboardingCompleted: () => set({ onboardingCompleted: true })
}));
