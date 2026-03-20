import type { Protocol } from '../../../src/types';
import type { IServerTransport } from '../transport/transport.interface';

const wsRegex = /socket\.io|\bws\b|websocket/i;
const webServerRegex = /nginx|caddy|apache/i;
const nodeRegex = /node|npm|yarn/i;

const tlsProbe = async (transport: IServerTransport, port: number): Promise<boolean> => {
  const result = await transport.exec(`openssl s_client -connect localhost:${port} -brief 2>/dev/null < /dev/null`);
  if (result.exitCode !== 0) {
    return false;
  }

  const combined = `${result.stdout}\n${result.stderr}`;
  return /Protocol|Cipher|Certificate/i.test(combined);
};

export const inferProtocol = async (
  serverTransport: IServerTransport,
  port: number,
  cmdline: string,
  socketTransport: 'tcp' | 'udp'
): Promise<Protocol> => {
  if (socketTransport === 'udp') {
    return 'udp';
  }

  const hasWsHints = wsRegex.test(cmdline);
  const hasWebServerHints = webServerRegex.test(cmdline);
  const isNode = nodeRegex.test(cmdline);

  if (port === 443) {
    return hasWsHints ? 'wss' : 'https';
  }

  if (port === 80 || hasWebServerHints) {
    return hasWsHints ? 'ws' : 'http';
  }

  if ([3000, 8080, 8000].includes(port) && isNode) {
    return hasWsHints ? 'ws' : 'http';
  }

  const hasTls = await tlsProbe(serverTransport, port);
  if (hasTls) {
    return hasWsHints ? 'wss' : 'https';
  }

  if (hasWsHints) {
    return 'ws';
  }

  return 'tcp';
};
