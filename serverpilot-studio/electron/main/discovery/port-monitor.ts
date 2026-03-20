import { EventEmitter } from 'node:events';
import type { IServerTransport } from '../transport/transport.interface';
import { scanTcpUdpOverview, type PortProcessInfo } from './port-scanner';

export interface PortChange {
  type: 'new' | 'removed' | 'binding-changed';
  key: string;
  previous?: PortProcessInfo;
  current?: PortProcessInfo;
}

interface MonitorEntry {
  timer: NodeJS.Timeout;
  latest: PortProcessInfo[];
  previousByKey: Map<string, PortProcessInfo>;
}

const toKey = (port: PortProcessInfo): string => `${port.transport}:${port.port}:${port.pid}`;

export class PortMonitor extends EventEmitter {
  private monitors = new Map<string, MonitorEntry>();

  constructor(private readonly getTransport: (serverId: string) => IServerTransport) {
    super();
  }

  start(serverId: string): void {
    if (this.monitors.has(serverId)) {
      return;
    }

    const entry: MonitorEntry = {
      timer: setInterval(() => {
        void this.scanAndDiff(serverId);
      }, 10_000),
      latest: [],
      previousByKey: new Map()
    };

    this.monitors.set(serverId, entry);
    void this.scanAndDiff(serverId);
  }

  stop(serverId: string): void {
    const monitor = this.monitors.get(serverId);
    if (!monitor) {
      return;
    }

    clearInterval(monitor.timer);
    this.monitors.delete(serverId);
  }

  getLatest(serverId: string): PortProcessInfo[] {
    return this.monitors.get(serverId)?.latest ?? [];
  }

  private async scanAndDiff(serverId: string): Promise<void> {
    const monitor = this.monitors.get(serverId);
    if (!monitor) {
      return;
    }

    const current = await scanTcpUdpOverview(this.getTransport(serverId));
    const currentByKey = new Map<string, PortProcessInfo>();

    for (const item of current) {
      currentByKey.set(toKey(item), item);
    }

    const changes: PortChange[] = [];

    for (const [key, prev] of monitor.previousByKey.entries()) {
      const next = currentByKey.get(key);
      if (!next) {
        changes.push({ type: 'removed', key, previous: prev });
        continue;
      }

      if (prev.bindAddress !== next.bindAddress) {
        changes.push({ type: 'binding-changed', key, previous: prev, current: next });
      }
    }

    for (const [key, next] of currentByKey.entries()) {
      if (!monitor.previousByKey.has(key)) {
        changes.push({ type: 'new', key, current: next });
      }
    }

    monitor.latest = current;
    monitor.previousByKey = currentByKey;

    if (changes.length > 0) {
      this.emit('change', { serverId, changes, ports: current });
    }
  }
}
