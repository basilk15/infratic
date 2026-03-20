import { create } from 'zustand';
import type { ServerGroup } from '@/types';
import { ipc } from '@/lib/ipc';

interface GroupsState {
  groups: ServerGroup[];
  isLoading: boolean;
  error: string | null;
  loadGroups: () => Promise<void>;
  createGroup: (name: string) => Promise<void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  setCollapsed: (groupId: string, collapsed: boolean) => Promise<void>;
}

export const useGroupsStore = create<GroupsState>((set) => ({
  groups: [],
  isLoading: false,
  error: null,
  loadGroups: async () => {
    set({ isLoading: true, error: null });
    try {
      const groups = await ipc.groups.list();
      set({ groups, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load groups' });
    }
  },
  createGroup: async (name) => {
    set({ error: null });
    try {
      const next = await ipc.groups.create(name);
      set((state) => ({ groups: [...state.groups, next] }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create group' });
    }
  },
  renameGroup: async (groupId, name) => {
    set({ error: null });
    try {
      const next = await ipc.groups.rename(groupId, name);
      set((state) => ({
        groups: state.groups.map((group) => (group.id === groupId ? next : group))
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to rename group' });
    }
  },
  setCollapsed: async (groupId, collapsed) => {
    set({ error: null });
    try {
      const next = await ipc.groups.setCollapsed(groupId, collapsed);
      set((state) => ({
        groups: state.groups.map((group) => (group.id === groupId ? next : group))
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update group state' });
    }
  }
}));
