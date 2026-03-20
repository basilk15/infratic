import { create } from 'zustand';
import type { ServiceRecord } from '@/types';
import { ipc } from '@/lib/ipc';

interface ServicesState {
  servicesByServer: Record<string, ServiceRecord[]>;
  selectedServiceId: string | null;
  loadingByServer: Record<string, boolean>;
  error: string | null;
  discover: (serverId: string) => Promise<void>;
  selectService: (serviceId: string | null) => void;
  controlService: (
    serverId: string,
    serviceId: string,
    action: 'start' | 'stop' | 'restart'
  ) => Promise<{ success: boolean; message: string }>;
  getSelectedService: (serverId: string | null) => ServiceRecord | null;
}

export const useServicesStore = create<ServicesState>((set, get) => ({
  servicesByServer: {},
  selectedServiceId: null,
  loadingByServer: {},
  error: null,
  discover: async (serverId) => {
    set((state) => ({
      loadingByServer: {
        ...state.loadingByServer,
        [serverId]: true
      },
      error: null
    }));

    try {
      const services = await ipc.services.discover(serverId);
      const previousSelectedId = get().selectedServiceId;
      const preservedSelection = services.some((service) => service.id === previousSelectedId)
        ? previousSelectedId
        : services[0]?.id ?? null;
      set((state) => ({
        servicesByServer: {
          ...state.servicesByServer,
          [serverId]: services
        },
        loadingByServer: {
          ...state.loadingByServer,
          [serverId]: false
        },
        selectedServiceId: preservedSelection
      }));
    } catch (err) {
      set((state) => ({
        loadingByServer: {
          ...state.loadingByServer,
          [serverId]: false
        },
        error: err instanceof Error ? err.message : 'Service discovery failed'
      }));
    }
  },
  selectService: (serviceId) => set({ selectedServiceId: serviceId }),
  controlService: async (serverId, serviceId, action) => {
    try {
      const result = await ipc.services.control(serverId, serviceId, action);
      return result;
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Service action failed'
      };
    }
  },
  getSelectedService: (serverId) => {
    if (!serverId) {
      return null;
    }

    const selectedServiceId = get().selectedServiceId;
    const services = get().servicesByServer[serverId] ?? [];
    return services.find((service) => service.id === selectedServiceId) ?? null;
  }
}));
