import type { IServerTransport } from '../transport/transport.interface';

export interface PortProcessInfo {
  transport: 'tcp' | 'udp';
  bindAddress: string;
  port: number;
  pid: number;
  processName: string;
}

const parseAddressPort = (rawLocal: string): { bindAddress: string; port: number } | null => {
  const local = rawLocal.trim();

  if (local.startsWith('[')) {
    const closingIdx = local.lastIndexOf(']');
    if (closingIdx === -1) {
      return null;
    }

    const address = local.slice(1, closingIdx);
    const portStr = local.slice(closingIdx + 2);
    const port = Number.parseInt(portStr, 10);
    if (!Number.isFinite(port)) {
      return null;
    }

    return { bindAddress: address, port };
  }

  const lastColon = local.lastIndexOf(':');
  if (lastColon === -1) {
    return null;
  }

  const bindAddress = local.slice(0, lastColon) || '0.0.0.0';
  const port = Number.parseInt(local.slice(lastColon + 1), 10);
  if (!Number.isFinite(port)) {
    return null;
  }

  return { bindAddress, port };
};

export const parseSsOutput = (output: string): PortProcessInfo[] => {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('Netid'));

  const parsed: PortProcessInfo[] = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 6) {
      continue;
    }

    const netId = parts[0]?.toLowerCase() ?? '';
    const transport: 'tcp' | 'udp' = netId.startsWith('udp') ? 'udp' : 'tcp';

    const localAddressField = parts[4] ?? '';
    const address = parseAddressPort(localAddressField);
    if (!address) {
      continue;
    }

    const pidMatch = line.match(/pid=(\d+)/);
    if (!pidMatch) {
      continue;
    }

    const pid = Number.parseInt(pidMatch[1] ?? '', 10);
    if (!Number.isFinite(pid)) {
      continue;
    }

    const processNameMatch = line.match(/"([^"]+)"/);
    const processName = processNameMatch?.[1] ?? 'unknown';

    parsed.push({
      transport,
      bindAddress: address.bindAddress,
      port: address.port,
      pid,
      processName
    });
  }

  return parsed;
};

export const scanListeningPorts = async (
  transport: IServerTransport
): Promise<PortProcessInfo[]> => {
  const result = await transport.exec('ss -tlnpu 2>/dev/null');
  if (result.exitCode !== 0 && result.stdout.trim().length === 0) {
    return [];
  }

  return parseSsOutput(result.stdout);
};

export const scanTcpUdpOverview = async (
  transport: IServerTransport
): Promise<PortProcessInfo[]> => {
  const result = await transport.exec('ss -tlnpu && ss -ulnpu 2>/dev/null');
  if (result.stdout.trim().length === 0) {
    return [];
  }

  return parseSsOutput(result.stdout);
};
