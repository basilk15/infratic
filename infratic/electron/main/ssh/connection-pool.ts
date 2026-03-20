import { EventEmitter } from 'node:events';
import type { ClientChannel } from 'ssh2';
import { Client } from 'ssh2';
import type { ConnectionStatus, ServerConfig } from '../../../src/types';
import type { CredentialStore } from '../credentials/credential-store';
import { log, logError } from '../utils/logger';
import { withTimeout, COMMAND_TIMEOUT_MS } from '../utils/timeout';
import type { HostKeyStore } from './host-key-store';
import { SSHClientFactory } from './ssh-client';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ConnectionEntry {
  client: Client | null;
  server: ServerConfig;
  status: ConnectionStatus;
  reconnectAttempt: number;
  reconnectTimer: NodeJS.Timeout | null;
  keepaliveTimer: NodeJS.Timeout | null;
  shouldReconnect: boolean;
}

const BACKOFF_SEQUENCE_SECONDS = [1, 2, 4, 8, 16, 30] as const;

export class SSHCommandStream extends EventEmitter {
  private channel: ClientChannel | null = null;

  setChannel(channel: ClientChannel): void {
    this.channel = channel;
  }

  close(): void {
    this.channel?.close();
  }

  signal(signalName: string): void {
    this.channel?.signal(signalName);
  }
}

export class ConnectionPool extends EventEmitter {
  private readonly entries = new Map<string, ConnectionEntry>();
  private readonly clientFactory: SSHClientFactory;

  constructor(
    private readonly credentials: CredentialStore,
    hostKeyStore: HostKeyStore
  ) {
    super();
    this.clientFactory = new SSHClientFactory(hostKeyStore);
  }

  private getOrCreateEntry(server: ServerConfig): ConnectionEntry {
    const existing = this.entries.get(server.id);
    if (existing) {
      existing.server = server;
      return existing;
    }

    const entry: ConnectionEntry = {
      client: null,
      server,
      status: 'disconnected',
      reconnectAttempt: 0,
      reconnectTimer: null,
      keepaliveTimer: null,
      shouldReconnect: true
    };
    this.entries.set(server.id, entry);
    return entry;
  }

  private updateStatus(id: string, status: ConnectionStatus): void {
    const entry = this.entries.get(id);
    if (!entry || entry.status === status) {
      return;
    }

    entry.status = status;
    this.emit('status', { id, status });
  }

  async connect(server: ServerConfig): Promise<void> {
    const entry = this.getOrCreateEntry(server);
    entry.shouldReconnect = true;

    if (entry.status === 'connected' || entry.status === 'connecting' || entry.status === 'reconnecting') {
      return;
    }

    this.updateStatus(server.id, 'connecting');
    const secret = await this.credentials.getServerSecret(server.id);

    try {
      const result = await this.clientFactory.connect(server, secret);
      entry.client = result.client;
      entry.reconnectAttempt = 0;
      this.installClientListeners(server.id, entry);
      this.startKeepalive(server.id, entry);
      this.updateStatus(server.id, 'connected');
      log('ssh', 'connected to', `${server.host}:${server.port}`);
    } catch (err) {
      this.updateStatus(server.id, 'failed');
      logError('ssh', `initial connect failed for ${server.host}:${server.port}`, err);
      this.scheduleReconnect(entry);
    }
  }

  async disconnect(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }

    entry.shouldReconnect = false;
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }
    if (entry.keepaliveTimer) {
      clearInterval(entry.keepaliveTimer);
      entry.keepaliveTimer = null;
    }

    if (entry.client) {
      entry.client.end();
      entry.client = null;
    }

    this.updateStatus(id, 'disconnected');
  }

  getStatus(id: string): ConnectionStatus {
    return this.entries.get(id)?.status ?? 'disconnected';
  }

  async exec(id: string, command: string): Promise<ExecResult> {
    const entry = this.entries.get(id);
    if (!entry?.client || entry.status !== 'connected') {
      return {
        stdout: '',
        stderr: 'SSH client is not connected',
        exitCode: -1
      };
    }

    const client = entry.client;

    try {
      return await withTimeout(
        new Promise<ExecResult>((resolve) => {
          client.exec(command, (err, channel) => {
            if (err) {
              resolve({
                stdout: '',
                stderr: err.message,
                exitCode: -1
              });
              return;
            }

            let stdout = '';
            let stderr = '';
            let exitCode = 0;

            channel.on('data', (chunk: Buffer | string) => {
              stdout += chunk.toString();
            });

            channel.stderr.on('data', (chunk: Buffer | string) => {
              stderr += chunk.toString();
            });

            channel.on('exit', (code?: number) => {
              if (typeof code === 'number') {
                exitCode = code;
              }
            });

            channel.on('close', () => {
              resolve({ stdout, stderr, exitCode });
            });
          });
        }),
        COMMAND_TIMEOUT_MS,
        `SSH command timeout for ${command}`
      );
    } catch (err) {
      logError('ssh', `exec failed for ${command}`, err);
      return {
        stdout: '',
        stderr: err instanceof Error ? err.message : 'unknown ssh error',
        exitCode: -1
      };
    }
  }

  async testConnection(
    server: ServerConfig,
    secret: string | null
  ): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.clientFactory.connect(server, secret);
      result.client.end();
      return {
        success: true,
        message: `Connection successful to ${server.host}:${server.port}`
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'SSH connection failed'
      };
    }
  }

  async shell(id: string): Promise<ClientChannel | null> {
    const entry = this.entries.get(id);
    if (!entry?.client || entry.status !== 'connected') {
      return null;
    }

    const client = entry.client;

    try {
      return await withTimeout(
        new Promise<ClientChannel | null>((resolve) => {
          client.shell((err, channel) => {
            if (err) {
              resolve(null);
              return;
            }

            resolve(channel);
          });
        }),
        COMMAND_TIMEOUT_MS,
        'SSH shell timeout'
      );
    } catch (err) {
      logError('ssh', 'shell request failed', err);
      return null;
    }
  }

  stream(id: string, command: string): SSHCommandStream {
    const stream = new SSHCommandStream();
    const entry = this.entries.get(id);

    if (!entry?.client || entry.status !== 'connected') {
      queueMicrotask(() => {
        stream.emit('error', new Error('SSH client is not connected'));
      });
      return stream;
    }

    const client = entry.client;

    const setupTimeout = setTimeout(() => {
      stream.emit('error', new Error(`Stream setup timeout: ${command}`));
    }, COMMAND_TIMEOUT_MS);

    client.exec(command, (err, channel) => {
      clearTimeout(setupTimeout);

      if (err) {
        stream.emit('error', err);
        return;
      }

      stream.setChannel(channel);

      channel.on('data', (chunk: Buffer | string) => {
        stream.emit('data', chunk.toString());
      });

      channel.stderr.on('data', (chunk: Buffer | string) => {
        stream.emit('data', chunk.toString());
      });

      channel.on('close', () => {
        stream.emit('close');
      });

      channel.on('exit', (code?: number) => {
        stream.emit('exit', typeof code === 'number' ? code : null);
      });

      channel.on('error', (channelErr: Error) => {
        stream.emit('error', channelErr);
      });
    });

    return stream;
  }

  private installClientListeners(id: string, entry: ConnectionEntry): void {
    const client = entry.client;
    if (!client) {
      return;
    }

    client.on('error', (err) => {
      logError('ssh', `client error on ${id}`, err);
      if (entry.status === 'connected') {
        this.updateStatus(id, 'degraded');
      }
    });

    client.on('close', () => {
      if (entry.keepaliveTimer) {
        clearInterval(entry.keepaliveTimer);
        entry.keepaliveTimer = null;
      }
      entry.client = null;

      if (!entry.shouldReconnect) {
        this.updateStatus(id, 'disconnected');
        return;
      }

      this.updateStatus(id, 'reconnecting');
      this.scheduleReconnect(entry);
    });
  }

  private startKeepalive(id: string, entry: ConnectionEntry): void {
    if (entry.keepaliveTimer) {
      clearInterval(entry.keepaliveTimer);
    }

    entry.keepaliveTimer = setInterval(() => {
      if (!entry.client) {
        return;
      }

      entry.client.exec('echo keepalive', (err, channel) => {
        if (err) {
          this.updateStatus(id, 'degraded');
          return;
        }
        channel.on('close', () => {
          if (this.getStatus(id) === 'degraded') {
            this.updateStatus(id, 'connected');
          }
        });
        channel.end();
      });
    }, 30_000);
  }

  private scheduleReconnect(entry: ConnectionEntry): void {
    if (!entry.shouldReconnect) {
      return;
    }

    const seconds =
      BACKOFF_SEQUENCE_SECONDS[Math.min(entry.reconnectAttempt, BACKOFF_SEQUENCE_SECONDS.length - 1)] ?? 30;
    entry.reconnectAttempt += 1;

    log('ssh', 'scheduling reconnect', entry.server.id, `${seconds}s`);

    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
    }

    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      void this.connect(entry.server);
    }, seconds * 1000);
  }
}
