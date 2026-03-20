import type { IServerTransport } from '../transport/transport.interface';
import type { PortProcessInfo } from './port-scanner';

interface Pm2Env {
  status?: string;
  pm_out_log_path?: string;
  pm_err_log_path?: string;
}

interface Pm2Entry {
  name?: string;
  pid?: number;
  pm2_env?: Pm2Env;
}

export interface Pm2ServiceMatch {
  name: string;
  pid: number;
  status: 'running' | 'stopped' | 'failed' | 'unknown';
  outLogPath?: string;
  errLogPath?: string;
  ports: PortProcessInfo[];
}

export const parsePm2Jlist = (output: string): Pm2ServiceMatch[] => {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => item as Pm2Entry)
      .filter((item) => typeof item.name === 'string' && typeof item.pid === 'number' && item.pid > 0)
      .map((item) => {
        const statusValue = item.pm2_env?.status ?? 'unknown';

        let status: Pm2ServiceMatch['status'] = 'unknown';
        if (statusValue === 'online') {
          status = 'running';
        } else if (statusValue === 'stopped') {
          status = 'stopped';
        } else if (statusValue === 'errored') {
          status = 'failed';
        }

        return {
          name: item.name as string,
          pid: item.pid as number,
          status,
          outLogPath: item.pm2_env?.pm_out_log_path,
          errLogPath: item.pm2_env?.pm_err_log_path,
          ports: []
        };
      });
  } catch {
    return [];
  }
};

export const discoverPm2Services = async (
  transport: IServerTransport,
  ports: PortProcessInfo[]
): Promise<Pm2ServiceMatch[]> => {
  const result = await transport.exec('pm2 jlist 2>/dev/null');
  const parsed = parsePm2Jlist(result.stdout);

  const byPid = new Map<number, PortProcessInfo[]>();
  for (const port of ports) {
    const list = byPid.get(port.pid) ?? [];
    list.push(port);
    byPid.set(port.pid, list);
  }

  return parsed.map((service) => ({
    ...service,
    ports: byPid.get(service.pid) ?? []
  }));
};
