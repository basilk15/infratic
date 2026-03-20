import type { ServiceManager } from '../../../src/types';

const sanitize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '-');

export const buildStableServiceKey = (serverId: string, manager: ServiceManager, name: string): string => {
  return `${serverId}:${manager}:${sanitize(name)}`;
};
