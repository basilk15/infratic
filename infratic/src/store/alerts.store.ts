import { create } from 'zustand';
import type { AppAlertEvent } from '@/types';

interface AlertsState {
  events: AppAlertEvent[];
  pushEvent: (event: AppAlertEvent) => void;
  dismissEvent: (id: string) => void;
}

export const useAlertsStore = create<AlertsState>((set) => ({
  events: [],
  pushEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 5)
    })),
  dismissEvent: (id) =>
    set((state) => ({
      events: state.events.filter((event) => event.id !== id)
    }))
}));
