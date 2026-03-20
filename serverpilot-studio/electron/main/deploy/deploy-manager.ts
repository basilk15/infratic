import { EventEmitter } from 'node:events';
import { v4 as uuidv4 } from 'uuid';
import type { ConnectionStatus, DeployCommand, DeployCompleteEvent, DeployOutputEvent, DeployRun } from '../../../src/types';
import type { DatabaseStore } from '../store/db';
import type { ICommandStream, IServerTransport } from '../transport/transport.interface';

interface ActiveDeploy {
  runId: string;
  command: DeployCommand;
  stream: ICommandStream;
  timer: NodeJS.Timeout;
  exitCode: number | null;
  finished: boolean;
}

const escapeSingleQuotes = (value: string): string => value.replace(/'/g, `'\\''`);

const formatDeployError = (err: Error): string => {
  const message = err.message.trim();
  if (message.includes('Channel open failure')) {
    return `${message}. The SSH server rejected a new exec channel. Close any open terminal/log stream or reconnect and try again.`;
  }

  return message;
};

export class DeployManager extends EventEmitter {
  private readonly activeByServer = new Map<string, ActiveDeploy>();

  constructor(
    private readonly db: DatabaseStore,
    private readonly getTransport: (serverId: string) => IServerTransport,
    private readonly getStatus: (serverId: string) => ConnectionStatus
  ) {
    super();
  }

  list(serverId: string): DeployCommand[] {
    return this.db.listDeployCommands(serverId);
  }

  add(serverId: string, config: { name: string; command: string; workingDir?: string; timeoutMs?: number }): DeployCommand {
    return this.db.addDeployCommand({
      id: uuidv4(),
      serverId,
      name: config.name.trim(),
      command: config.command.trim(),
      workingDir: config.workingDir?.trim() || undefined,
      timeoutMs: config.timeoutMs ?? 120000,
      sortOrder: this.db.getNextDeployCommandSortOrder(serverId),
      createdAt: Date.now()
    });
  }

  remove(commandId: string): void {
    const command = this.db.getDeployCommand(commandId);
    if (!command) {
      return;
    }
    const active = this.activeByServer.get(command.serverId);
    if (active?.command.id === commandId) {
      throw new Error('Cannot remove a deploy command while it is running');
    }
    this.db.removeDeployCommand(commandId);
  }

  getHistory(commandId: string): DeployRun[] {
    return this.db.listDeployRuns(commandId);
  }

  isRunning(serverId: string): boolean {
    return this.activeByServer.has(serverId);
  }

  run(serverId: string, commandId: string): string {
    if (this.activeByServer.has(serverId)) {
      throw new Error('Another deploy is already running for this server');
    }
    if (!['connected', 'degraded', 'reconnecting'].includes(this.getStatus(serverId))) {
      throw new Error('Connect to the server before running deploy commands');
    }

    const command = this.db.getDeployCommand(commandId);
    if (!command) {
      throw new Error('Deploy command not found');
    }

    const runId = uuidv4();
    this.db.addDeployRun({
      id: runId,
      commandId,
      serverId,
      startedAt: Date.now(),
      status: 'running'
    });

    const finalCommand = command.workingDir
      ? `cd '${escapeSingleQuotes(command.workingDir)}' && ${command.command}`
      : command.command;

    const stream = this.getTransport(serverId).stream(finalCommand);
    const timer = setTimeout(() => {
      this.complete(serverId, runId, commandId, 'timed_out', null);
      stream.close();
    }, command.timeoutMs);

    const active: ActiveDeploy = {
      runId,
      command,
      stream,
      timer,
      exitCode: null,
      finished: false
    };
    this.activeByServer.set(serverId, active);
    this.emit('state', serverId, true);
    this.emit('output', {
      runId,
      serverId,
      commandId,
      chunk: `[started] ${finalCommand}\n[info] Waiting for command output. Long-running servers may stay quiet until they receive traffic.\n`
    } satisfies DeployOutputEvent);

    stream.on('data', (chunk: string) => {
      const payload: DeployOutputEvent = {
        runId,
        serverId,
        commandId,
        chunk
      };
      this.emit('output', payload);
    });

    stream.on('exit', (exitCode: number | null) => {
      active.exitCode = exitCode;
    });

    stream.on('error', (err: Error) => {
      if (active.finished) {
        return;
      }

      this.emit('output', {
        runId,
        serverId,
        commandId,
        chunk: `\n[error] ${formatDeployError(err)}\n`
      } satisfies DeployOutputEvent);
      this.complete(serverId, runId, commandId, 'failed', active.exitCode ?? -1);
    });

    stream.on('close', () => {
      if (active.finished) {
        return;
      }

      const status = active.exitCode === 0 ? 'succeeded' : 'failed';
      this.complete(serverId, runId, commandId, status, active.exitCode);
    });

    return runId;
  }

  cancel(serverId: string): void {
    const active = this.activeByServer.get(serverId);
    if (!active) {
      return;
    }
    this.complete(serverId, active.runId, active.command.id, 'canceled', active.exitCode);
    active.stream.close();
  }

  private complete(
    serverId: string,
    runId: string,
    commandId: string,
    status: DeployRun['status'],
    exitCode: number | null
  ): void {
    const active = this.activeByServer.get(serverId);
    if (!active || active.runId !== runId || active.finished) {
      return;
    }

    active.finished = true;
    clearTimeout(active.timer);
    this.activeByServer.delete(serverId);
    this.emit('state', serverId, false);

    const finishedAt = Date.now();
    this.db.updateDeployRun(runId, {
      finishedAt,
      exitCode: exitCode ?? undefined,
      status
    });

    this.emit('output', {
      runId,
      serverId,
      commandId,
      chunk: `\n[complete] status=${status}${typeof exitCode === 'number' ? ` exit=${exitCode}` : ''}\n`
    } satisfies DeployOutputEvent);

    const payload: DeployCompleteEvent = {
      runId,
      serverId,
      commandId,
      status,
      exitCode: exitCode ?? undefined,
      finishedAt
    };
    this.emit('complete', payload);
  }
}
