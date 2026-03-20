import { readFileSync } from 'node:fs';
import { Client } from 'ssh2';
import type { ConnectConfig } from 'ssh2';
import type { ServerConfig } from '../../../src/types';
import type { HostKeyStore } from './host-key-store';
import { withTimeout, COMMAND_TIMEOUT_MS } from '../utils/timeout';

export interface SSHConnectResult {
  client: Client;
}

export class SSHClientFactory {
  constructor(private readonly hostKeyStore: HostKeyStore) {}

  async connect(server: ServerConfig, secret: string | null): Promise<SSHConnectResult> {
    const client = new Client();
    const host = `${server.host}:${server.port}`;

    const hostVerifier: NonNullable<ConnectConfig['hostVerifier']> = (
      key: Buffer | string,
      callback?: (verified: boolean) => void
    ): boolean | void => {
      const verify = this.hostKeyStore.verifyOrPrompt(host, key);
      if (typeof callback === 'function') {
        void verify.then(callback).catch(() => callback(false));
        return;
      }

      return false;
    };

    const baseConfig: ConnectConfig = {
      host: server.host,
      port: server.port,
      username: server.username,
      readyTimeout: COMMAND_TIMEOUT_MS,
      keepaliveInterval: 30_000,
      keepaliveCountMax: 2,
      hostHash: 'sha256',
      hostVerifier
    };

    const authConfig = this.buildAuthConfig(server, secret);

    const finalConfig: ConnectConfig = {
      ...baseConfig,
      ...authConfig
    };

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        client
          .on('ready', () => resolve())
          .on('error', (err) => reject(err))
          .connect(finalConfig);
      }),
      COMMAND_TIMEOUT_MS,
      `SSH connect timeout for ${host}`
    );

    return { client };
  }

  private buildAuthConfig(server: ServerConfig, secret: string | null): ConnectConfig {
    if (server.authMethod === 'password') {
      return {
        password: secret ?? ''
      };
    }

    if (server.authMethod === 'privateKey') {
      const privateKeyPath = server.privateKeyPath;
      if (!privateKeyPath) {
        throw new Error('privateKeyPath is required for private key auth');
      }

      const privateKey = readFileSync(privateKeyPath, 'utf8');
      return {
        privateKey,
        passphrase: secret ?? undefined
      };
    }

    return {
      agent: process.env.SSH_AUTH_SOCK,
      tryKeyboard: false
    };
  }
}
