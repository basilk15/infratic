import type { PortInfo, ServiceRecord, ServiceStatus } from '../../../src/types';
import type { IServerTransport } from '../transport/transport.interface';
import { discoverPm2Services } from './pm2';
import { scanListeningPorts, type PortProcessInfo } from './port-scanner';
import { detectProcessSignature } from './process-signatures';
import { inferProtocol } from './protocol-detector';
import { buildStableServiceKey } from './service-key';
import { discoverSystemdServices } from './systemd';

interface ProcFacts {
  cmdline: string;
  startTime: number;
  ppid: number;
  children: number[];
}

const parseProcStat = (line: string): { startTime: number; ppid: number } | null => {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const closeParen = trimmed.lastIndexOf(')');
  if (closeParen === -1) {
    return null;
  }

  const after = trimmed.slice(closeParen + 2);
  const fields = after.split(/\s+/);
  if (fields.length < 20) {
    return null;
  }

  const ppid = Number.parseInt(fields[1] ?? '0', 10);
  const startTime = Number.parseInt(fields[19] ?? '0', 10);

  if (!Number.isFinite(ppid) || !Number.isFinite(startTime)) {
    return null;
  }

  return { startTime, ppid };
};

const parseChildren = (raw: string): number[] => {
  return raw
    .trim()
    .split(/\s+/)
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isFinite(v) && v > 0);
};

const getProcFacts = async (transport: IServerTransport, pid: number): Promise<ProcFacts> => {
  const cmdlineResult = await transport.exec(`cat /proc/${pid}/cmdline 2>/dev/null | tr '\\0' ' '`);
  const statResult = await transport.exec(`cat /proc/${pid}/stat 2>/dev/null`);
  const childrenResult = await transport.exec(`cat /proc/${pid}/task/${pid}/children 2>/dev/null`);

  const statParsed = parseProcStat(statResult.stdout);
  return {
    cmdline: cmdlineResult.stdout.trim(),
    startTime: statParsed?.startTime ?? 0,
    ppid: statParsed?.ppid ?? 0,
    children: parseChildren(childrenResult.stdout)
  };
};

const toPortInfo = async (
  transport: IServerTransport,
  cmdline: string,
  ports: PortProcessInfo[]
): Promise<PortInfo[]> => {
  const mapped: PortInfo[] = [];

  for (const entry of ports) {
    const protocol = await inferProtocol(transport, entry.port, cmdline, entry.transport);
    const bindAddress = entry.bindAddress === '*' ? '0.0.0.0' : entry.bindAddress;
    mapped.push({
      port: entry.port,
      protocol,
      bindAddress,
      externallyAccessible: !['127.0.0.1', '::1'].includes(bindAddress)
    });
  }

  return mapped;
};

const collectPidPorts = (
  byPid: Map<number, PortProcessInfo[]>,
  rootPid: number,
  children: number[]
): PortProcessInfo[] => {
  const merged = new Map<string, PortProcessInfo>();
  const pids = [rootPid, ...children];

  for (const pid of pids) {
    const ports = byPid.get(pid) ?? [];
    for (const port of ports) {
      const key = `${port.transport}:${port.bindAddress}:${port.port}:${port.pid}`;
      merged.set(key, port);
    }
  }

  return [...merged.values()];
};

const deriveStatusFromRaw = (ports: PortProcessInfo[]): ServiceStatus => {
  if (ports.length > 0) {
    return 'running';
  }
  return 'unknown';
};

export class ServiceDiscovery {
  constructor(private readonly getTransport: (serverId: string) => IServerTransport) {}

  async discover(serverId: string): Promise<ServiceRecord[]> {
    const transport = this.getTransport(serverId);
    const portMap = await scanListeningPorts(transport);
    const byPid = new Map<number, PortProcessInfo[]>();

    for (const item of portMap) {
      const list = byPid.get(item.pid) ?? [];
      list.push(item);
      byPid.set(item.pid, list);
    }

    const records: ServiceRecord[] = [];
    const claimedPids = new Set<number>();

    const systemd = await discoverSystemdServices(transport, portMap);
    for (const service of systemd) {
      const facts = await getProcFacts(transport, service.pid);
      const ports = await toPortInfo(transport, facts.cmdline, collectPidPorts(byPid, service.pid, facts.children));
      const serviceId = `${serverId}:${service.pid}:${facts.startTime}`;
      records.push({
        id: serviceId,
        stableKey: buildStableServiceKey(serverId, 'systemd', service.unit),
        serverId,
        name: service.unit,
        displayName: service.unit,
        manager: 'systemd',
        pid: service.pid,
        startTime: facts.startTime,
        status: service.status,
        ports,
        cmdline: facts.cmdline,
        detectionMethod: 'systemd',
        confidence: 'high',
        parentPid: facts.ppid,
        children: facts.children
      });
      claimedPids.add(service.pid);
    }

    const pm2 = await discoverPm2Services(transport, portMap);
    for (const service of pm2) {
      if (claimedPids.has(service.pid)) {
        continue;
      }

      const facts = await getProcFacts(transport, service.pid);
      const ports = await toPortInfo(transport, facts.cmdline, collectPidPorts(byPid, service.pid, facts.children));
      const serviceId = `${serverId}:${service.pid}:${facts.startTime}`;
      records.push({
        id: serviceId,
        stableKey: buildStableServiceKey(serverId, 'pm2', service.name),
        serverId,
        name: service.name,
        displayName: service.name,
        manager: 'pm2',
        pid: service.pid,
        startTime: facts.startTime,
        status: service.status,
        ports,
        cmdline: facts.cmdline,
        detectionMethod: 'pm2 jlist',
        confidence: 'high',
        parentPid: facts.ppid,
        children: facts.children
      });
      claimedPids.add(service.pid);
    }

    for (const [pid, ports] of byPid) {
      if (claimedPids.has(pid)) {
        continue;
      }

      const facts = await getProcFacts(transport, pid);
      const signature = detectProcessSignature(facts.cmdline);
      const portInfo = await toPortInfo(transport, facts.cmdline, ports);

      const name = signature?.type ?? ports[0]?.processName ?? `pid-${pid}`;
      const serviceId = `${serverId}:${pid}:${facts.startTime}`;

      records.push({
        id: serviceId,
        stableKey: buildStableServiceKey(serverId, 'raw', name),
        serverId,
        name,
        displayName: name,
        manager: 'raw',
        pid,
        startTime: facts.startTime,
        status: deriveStatusFromRaw(ports),
        ports: portInfo,
        cmdline: facts.cmdline,
        detectionMethod: signature ? 'process-signature' : 'port-scan',
        confidence: signature?.confidence ?? 'low',
        parentPid: facts.ppid,
        children: facts.children
      });
    }

    return records;
  }
}
