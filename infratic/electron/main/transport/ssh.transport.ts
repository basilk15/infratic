import { EventEmitter } from 'node:events';
import type { ClientChannel } from 'ssh2';
import type { ConnectionPool } from '../ssh/connection-pool';
import type { ICommandStream, IServerTransport, IShellSession } from './transport.interface';

class SSHShellSession extends EventEmitter implements IShellSession {
  constructor(private readonly channel: ClientChannel) {
    super();

    channel.on('data', (chunk: Buffer | string) => {
      this.emit('data', chunk.toString());
    });

    channel.on('close', () => {
      this.emit('close');
    });

    channel.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  write(data: string): void {
    this.channel.write(data);
  }

  resize(cols: number, rows: number): void {
    this.channel.setWindow(rows, cols, 0, 0);
  }

  close(): void {
    this.channel.close();
  }
}

export class SSHServerTransport implements IServerTransport {
  constructor(
    private readonly pool: ConnectionPool,
    private readonly serverId: string
  ) {}

  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.pool.exec(this.serverId, command);
  }

  stream(command: string): ICommandStream {
    return this.pool.stream(this.serverId, command);
  }

  async shell(): Promise<IShellSession | null> {
    const channel = await this.pool.shell(this.serverId);
    if (!channel) {
      return null;
    }

    return new SSHShellSession(channel);
  }

  isLocal(): boolean {
    return false;
  }
}
