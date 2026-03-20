import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { env } from 'node:process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ICommandStream, IServerTransport, IShellSession } from './transport.interface';

class LocalCommandStream extends EventEmitter implements ICommandStream {
  private child: ChildProcessWithoutNullStreams | null;

  constructor(command: string) {
    super();
    this.child = spawn('/bin/sh', ['-lc', command], {
      cwd: env.HOME,
      env
    });

    this.child.stdout.on('data', (chunk: Buffer | string) => {
      this.emit('data', chunk.toString());
    });

    this.child.stderr.on('data', (chunk: Buffer | string) => {
      this.emit('data', chunk.toString());
    });

    this.child.on('exit', (code) => {
      this.emit('exit', typeof code === 'number' ? code : null);
    });

    this.child.on('close', () => {
      this.emit('close');
      this.child = null;
    });

    this.child.on('error', (err) => {
      this.emit('error', err);
    });
  }

  close(): void {
    this.child?.kill('SIGTERM');
  }

  signal(signalName: string): void {
    this.child?.kill(signalName as NodeJS.Signals);
  }
}

class LocalShellSession extends EventEmitter implements IShellSession {
  private readonly child: ChildProcessWithoutNullStreams;

  constructor() {
    super();

    const shell = env.SHELL || '/bin/bash';
    this.child = spawn('script', ['-qfec', `${shell} -li`, '/dev/null'], {
      cwd: env.HOME,
      env
    });

    this.child.stdout.on('data', (chunk: Buffer | string) => {
      this.emit('data', chunk.toString());
    });

    this.child.stderr.on('data', (chunk: Buffer | string) => {
      this.emit('data', chunk.toString());
    });

    this.child.on('close', () => {
      this.emit('close');
    });

    this.child.on('error', (err) => {
      this.emit('error', err);
    });
  }

  write(data: string): void {
    this.child.stdin.write(data);
  }

  resize(cols: number, rows: number): void {
    this.child.stdin.write(`stty rows ${rows} cols ${cols}\n`);
  }

  close(): void {
    this.child.kill('SIGTERM');
  }
}

export class LocalServerTransport implements IServerTransport {
  async exec(command: string, timeoutMs: number = 30_000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const child = spawn('/bin/sh', ['-lc', command], {
        cwd: env.HOME,
        env
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      const finish = (exitCode: number): void => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode });
      };

      const timer = setTimeout(() => {
        stderr += `Command timed out after ${timeoutMs}ms`;
        child.kill('SIGTERM');
        finish(-1);
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        stderr += err.message;
        finish(-1);
      });

      child.on('close', (code) => {
        finish(typeof code === 'number' ? code : -1);
      });
    });
  }

  stream(command: string): ICommandStream {
    return new LocalCommandStream(command);
  }

  async shell(): Promise<IShellSession | null> {
    return new LocalShellSession();
  }

  isLocal(): boolean {
    return true;
  }
}
