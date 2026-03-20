import type { ConnectionStatus, ServerConfig } from '../../../src/types';
import type { DatabaseStore } from '../store/db';
import type { ConnectionPool } from '../ssh/connection-pool';
import { LocalServerTransport } from './local.transport';
import { SSHServerTransport } from './ssh.transport';
import type { IServerTransport } from './transport.interface';

export class TransportManager {
  private readonly localTransport = new LocalServerTransport();

  constructor(
    private readonly db: DatabaseStore,
    private readonly pool: ConnectionPool
  ) {}

  getTransport(serverId: string): IServerTransport {
    const server = this.db.getServer(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (server.serverType === 'local') {
      return this.localTransport;
    }

    return new SSHServerTransport(this.pool, serverId);
  }

  getStatus(serverId: string): ConnectionStatus {
    const server = this.db.getServer(serverId);
    if (server?.serverType === 'local') {
      return 'connected';
    }

    return this.pool.getStatus(serverId);
  }

  async connect(server: ServerConfig): Promise<void> {
    if (server.serverType === 'local') {
      return;
    }

    await this.pool.connect(server);
  }

  async disconnect(serverId: string): Promise<void> {
    const server = this.db.getServer(serverId);
    if (server?.serverType === 'local') {
      return;
    }

    await this.pool.disconnect(serverId);
  }
}
