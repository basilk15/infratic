import { EventEmitter } from 'node:events';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ICommandStream extends EventEmitter {
  close(): void;
  signal?(signalName: string): void;
}

export interface IShellSession extends EventEmitter {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

export interface IServerTransport {
  exec(command: string, timeoutMs?: number): Promise<CommandResult>;
  stream(command: string): ICommandStream;
  shell(): Promise<IShellSession | null>;
  isLocal(): boolean;
}
