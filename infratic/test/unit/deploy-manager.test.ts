import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { DeployManager } from '../../electron/main/deploy/deploy-manager';

class MockStream extends EventEmitter {
  close(): void {
    this.emit('close');
  }
}

describe('DeployManager', () => {
  it('rejects concurrent deploys on the same server', () => {
    const stream = new MockStream();
    const getTransport = vi.fn(() => ({ stream: vi.fn(() => stream) })) as never;
    const db = {
      listDeployCommands: () => [],
      getDeployCommand: () => ({
        id: 'cmd-1',
        serverId: 'server-1',
        name: 'Deploy',
        command: 'echo hi',
        timeoutMs: 120000,
        sortOrder: 0,
        createdAt: Date.now()
      }),
      addDeployRun: vi.fn(),
      updateDeployRun: vi.fn(),
      getNextDeployCommandSortOrder: () => 0,
      addDeployCommand: vi.fn(),
      removeDeployCommand: vi.fn(),
      listDeployRuns: () => []
    } as never;

    const manager = new DeployManager(db, getTransport, (() => 'connected') as never);
    manager.run('server-1', 'cmd-1');
    expect(() => manager.run('server-1', 'cmd-1')).toThrow('Another deploy is already running for this server');
  });

  it('wraps commands with working directory when provided', () => {
    const stream = new MockStream();
    const streamSpy = vi.fn(() => stream);
    const getTransport = vi.fn(() => ({ stream: streamSpy })) as never;
    const db = {
      listDeployCommands: () => [],
      getDeployCommand: () => ({
        id: 'cmd-1',
        serverId: 'server-1',
        name: 'Deploy',
        command: 'npm run deploy',
        workingDir: '/srv/app',
        timeoutMs: 120000,
        sortOrder: 0,
        createdAt: Date.now()
      }),
      addDeployRun: vi.fn(),
      updateDeployRun: vi.fn(),
      getNextDeployCommandSortOrder: () => 0,
      addDeployCommand: vi.fn(),
      removeDeployCommand: vi.fn(),
      listDeployRuns: () => []
    } as never;

    const manager = new DeployManager(db, getTransport, (() => 'connected') as never);
    manager.run('server-1', 'cmd-1');
    expect(streamSpy).toHaveBeenCalledWith("cd '/srv/app' && npm run deploy");
  });

  it('fails immediately when the SSH exec channel cannot be opened', () => {
    const stream = new MockStream();
    const updateDeployRun = vi.fn();
    const getTransport = vi.fn(() => ({ stream: vi.fn(() => stream) })) as never;
    const db = {
      listDeployCommands: () => [],
      getDeployCommand: () => ({
        id: 'cmd-1',
        serverId: 'server-1',
        name: 'HTTP',
        command: 'python3 -m http.server 8080',
        timeoutMs: 120000,
        sortOrder: 0,
        createdAt: Date.now()
      }),
      addDeployRun: vi.fn(),
      updateDeployRun,
      getNextDeployCommandSortOrder: () => 0,
      addDeployCommand: vi.fn(),
      removeDeployCommand: vi.fn(),
      listDeployRuns: () => []
    } as never;

    const manager = new DeployManager(db, getTransport, (() => 'connected') as never);
    const outputSpy = vi.fn();
    const completeSpy = vi.fn();
    manager.on('output', outputSpy);
    manager.on('complete', completeSpy);

    manager.run('server-1', 'cmd-1');
    stream.emit('error', new Error('(SSH) Channel open failure: open failed'));

    expect(updateDeployRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: 'failed',
        exitCode: -1
      })
    );
    expect(completeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        exitCode: -1
      })
    );
    expect(outputSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chunk: expect.stringContaining('The SSH server rejected a new exec channel')
      })
    );
  });
});
