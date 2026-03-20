import { EventEmitter } from 'node:events';
import type { ProcessMetrics } from '../../../src/types';
import type { IServerTransport } from '../transport/transport.interface';

interface PrevReading {
  pid: number;
  startTime: number;
  procJiffies: number;
  totalJiffies: number;
}

interface ParsedProcSnapshot {
  pid: number;
  startTime: number;
  utime: number;
  stime: number;
  vmRss: number;
  vmSize: number;
  vmSwap: number;
}

const parseStatLine = (line: string): { pid: number; startTime: number; utime: number; stime: number } | null => {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const closeParen = trimmed.lastIndexOf(')');
  if (closeParen === -1) {
    return null;
  }

  const pid = Number.parseInt(trimmed.slice(0, trimmed.indexOf(' ')), 10);
  if (!Number.isFinite(pid)) {
    return null;
  }

  const fields = trimmed.slice(closeParen + 2).split(/\s+/);
  if (fields.length < 20) {
    return null;
  }

  const utime = Number.parseInt(fields[11] ?? '0', 10);
  const stime = Number.parseInt(fields[12] ?? '0', 10);
  const startTime = Number.parseInt(fields[19] ?? '0', 10);

  if (![utime, stime, startTime].every((v) => Number.isFinite(v))) {
    return null;
  }

  return { pid, startTime, utime, stime };
};

export const parseTotalJiffies = (line: string): number => {
  const fields = line
    .replace(/^cpu\s+/, '')
    .trim()
    .split(/\s+/)
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isFinite(v));

  return fields.reduce((acc, value) => acc + value, 0);
};

export const parseStatusMetrics = (statusText: string): { vmRss: number; vmSize: number; vmSwap: number } => {
  const vmRss = Number.parseInt(statusText.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1] ?? '0', 10) * 1024;
  const vmSize = Number.parseInt(statusText.match(/^VmSize:\s+(\d+)\s+kB/m)?.[1] ?? '0', 10) * 1024;
  const vmSwap = Number.parseInt(statusText.match(/^VmSwap:\s+(\d+)\s+kB/m)?.[1] ?? '0', 10) * 1024;

  return {
    vmRss: Number.isFinite(vmRss) ? vmRss : 0,
    vmSize: Number.isFinite(vmSize) ? vmSize : 0,
    vmSwap: Number.isFinite(vmSwap) ? vmSwap : 0
  };
};

export const calculateCpuPercent = (procDelta: number, totalDelta: number, numCpus: number): number => {
  if (totalDelta <= 0 || procDelta < 0 || numCpus <= 0) {
    return 0;
  }
  const value = (procDelta / totalDelta) * numCpus * 100;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

const parseBatchOutput = (output: string): { totalJiffies: number; snapshots: ParsedProcSnapshot[] } => {
  const cpuMatch = output.match(/^=CPUSTAT=\n([^\n]+)/m);
  const totalJiffies = cpuMatch ? parseTotalJiffies(cpuMatch[1] ?? '') : 0;

  const chunks = output.split('=PID=').slice(1);
  const snapshots: ParsedProcSnapshot[] = [];

  for (const chunk of chunks) {
    const markerEnd = chunk.indexOf('=');
    if (markerEnd === -1) {
      continue;
    }

    const pid = Number.parseInt(chunk.slice(0, markerEnd), 10);
    if (!Number.isFinite(pid)) {
      continue;
    }

    const body = chunk.slice(markerEnd + 1);
    const separator = body.indexOf('=STATUS=\n');
    if (separator === -1) {
      continue;
    }

    const statPart = body.slice(0, separator).trim();
    const statusPart = body.slice(separator + '=STATUS=\n'.length);

    const stat = parseStatLine(statPart);
    if (!stat) {
      continue;
    }

    const memory = parseStatusMetrics(statusPart);

    snapshots.push({
      pid,
      startTime: stat.startTime,
      utime: stat.utime,
      stime: stat.stime,
      vmRss: memory.vmRss,
      vmSize: memory.vmSize,
      vmSwap: memory.vmSwap
    });
  }

  return { totalJiffies, snapshots };
};

export class ProcMetricsReader extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private prevReadings = new Map<number, PrevReading>();
  private numCpus = 1;

  constructor(
    private readonly transport: IServerTransport,
    private readonly serverId: string,
    private pids: number[]
  ) {
    super();
  }

  setPids(pids: number[]): void {
    this.pids = pids;
  }

  start(intervalMs: number = 2000): void {
    if (this.timer) {
      return;
    }

    void this.initializeCpuCount();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, intervalMs);
    void this.pollOnce();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async initializeCpuCount(): Promise<void> {
    const result = await this.transport.exec('nproc');
    const parsed = Number.parseInt(result.stdout.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      this.numCpus = parsed;
    }
  }

  private createBatchCommand(): string {
    const pidList = this.pids.filter((pid) => Number.isFinite(pid) && pid > 0).join(' ');
    return `echo =CPUSTAT=; head -n1 /proc/stat; for pid in ${pidList}; do echo "=PID=$pid="; cat /proc/$pid/stat 2>/dev/null; echo "=STATUS="; cat /proc/$pid/status 2>/dev/null; done`;
  }

  private async pollOnce(): Promise<void> {
    if (this.pids.length === 0) {
      this.emit('metrics', [] as ProcessMetrics[]);
      return;
    }

    const result = await this.transport.exec(this.createBatchCommand());
    if (result.exitCode !== 0 && result.stdout.trim().length === 0) {
      this.emit('metrics', [] as ProcessMetrics[]);
      return;
    }

    const parsed = parseBatchOutput(result.stdout);
    const timestamp = Date.now();
    const metrics: ProcessMetrics[] = [];

    for (const snapshot of parsed.snapshots) {
      const procJiffies = snapshot.utime + snapshot.stime;
      const previous = this.prevReadings.get(snapshot.pid);

      let cpuPercent = 0;
      if (previous && previous.startTime === snapshot.startTime) {
        const procDelta = procJiffies - previous.procJiffies;
        const totalDelta = parsed.totalJiffies - previous.totalJiffies;
        cpuPercent = calculateCpuPercent(procDelta, totalDelta, this.numCpus);
      }

      this.prevReadings.set(snapshot.pid, {
        pid: snapshot.pid,
        startTime: snapshot.startTime,
        procJiffies,
        totalJiffies: parsed.totalJiffies
      });

      metrics.push({
        serviceId: `${this.serverId}:${snapshot.pid}:${snapshot.startTime}`,
        pid: snapshot.pid,
        cpuPercent,
        memoryRss: snapshot.vmRss,
        memoryVirtual: snapshot.vmSize,
        memorySwap: snapshot.vmSwap,
        timestamp
      });
    }

    this.emit('metrics', metrics);
  }
}
