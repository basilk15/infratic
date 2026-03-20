import type { IServerTransport } from '../transport/transport.interface';
import type { PortProcessInfo } from './port-scanner';

export interface SystemdUnit {
  unit: string;
  activeState: 'active' | 'inactive' | 'failed' | 'unknown';
}

export interface SystemdServiceMatch {
  unit: string;
  pid: number;
  fragmentPath: string;
  status: 'running' | 'stopped' | 'failed' | 'unknown';
  ports: PortProcessInfo[];
}

export const parseSystemctlList = (output: string): SystemdUnit[] => {
  const units: SystemdUnit[] = [];

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('.service')) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) {
      continue;
    }

    const unit = parts[0] ?? '';
    const activeValue = parts[2] ?? 'unknown';

    let activeState: SystemdUnit['activeState'] = 'unknown';
    if (activeValue === 'active') {
      activeState = 'active';
    } else if (activeValue === 'inactive') {
      activeState = 'inactive';
    } else if (activeValue === 'failed') {
      activeState = 'failed';
    }

    units.push({ unit, activeState });
  }

  return units;
};

const parseShow = (output: string): { pid: number; fragmentPath: string } | null => {
  const mainPidMatch = output.match(/^MainPID=(\d+)$/m);
  if (!mainPidMatch) {
    return null;
  }

  const pid = Number.parseInt(mainPidMatch[1] ?? '', 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    return null;
  }

  const fragmentPathMatch = output.match(/^FragmentPath=(.*)$/m);
  return {
    pid,
    fragmentPath: fragmentPathMatch?.[1] ?? ''
  };
};

export const discoverSystemdServices = async (
  transport: IServerTransport,
  ports: PortProcessInfo[]
): Promise<SystemdServiceMatch[]> => {
  const listResult = await transport.exec('systemctl list-units --type=service --all --no-pager --plain 2>/dev/null');

  const units = parseSystemctlList(listResult.stdout).filter((unit) => unit.activeState !== 'unknown');
  const activeUnits = units.filter((unit) => unit.activeState === 'active' || unit.activeState === 'failed');

  const byPid = new Map<number, PortProcessInfo[]>();
  for (const port of ports) {
    const existing = byPid.get(port.pid) ?? [];
    existing.push(port);
    byPid.set(port.pid, existing);
  }

  const matches: SystemdServiceMatch[] = [];

  for (const unit of activeUnits) {
    const showResult = await transport.exec(`systemctl show ${unit.unit} --property=MainPID,FragmentPath 2>/dev/null`);
    const details = parseShow(showResult.stdout);
    if (!details) {
      continue;
    }

    const status: SystemdServiceMatch['status'] =
      unit.activeState === 'active' ? 'running' : unit.activeState === 'failed' ? 'failed' : 'unknown';

    matches.push({
      unit: unit.unit,
      pid: details.pid,
      fragmentPath: details.fragmentPath,
      status,
      ports: byPid.get(details.pid) ?? []
    });
  }

  return matches;
};
