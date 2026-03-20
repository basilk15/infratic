import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseStore } from '../store/db';
import { log, logError } from '../utils/logger';
import { canonicalHost, toSha256Fingerprint } from './host-key-utils';

interface KnownHostsJson {
  hosts: Record<
    string,
    {
      fingerprint: string;
      addedAt: number;
    }
  >;
}

interface PendingVerification {
  fingerprint: string;
  resolve: (accepted: boolean) => void;
  timeout: NodeJS.Timeout;
}

const VERIFY_TIMEOUT_MS = 120_000;

export class HostKeyStore extends EventEmitter {
  private readonly knownHostsPath: string;
  private readonly db: DatabaseStore;
  private knownHosts: KnownHostsJson = { hosts: {} };
  private pending = new Map<string, PendingVerification>();

  constructor(db: DatabaseStore) {
    super();
    this.db = db;
    this.knownHostsPath = join(app.getPath('userData'), 'known-hosts.json');
    this.load();
  }

  private ensureFileDir(): void {
    mkdirSync(dirname(this.knownHostsPath), { recursive: true });
  }

  private load(): void {
    if (!existsSync(this.knownHostsPath)) {
      this.knownHosts = { hosts: {} };
      return;
    }

    try {
      const raw = readFileSync(this.knownHostsPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'hosts' in parsed &&
        typeof (parsed as { hosts: unknown }).hosts === 'object' &&
        (parsed as { hosts: unknown }).hosts !== null
      ) {
        this.knownHosts = parsed as KnownHostsJson;
        return;
      }
    } catch (err) {
      logError('host-key', 'failed to parse known-hosts.json, resetting', err);
    }

    this.knownHosts = { hosts: {} };
  }

  private save(): void {
    this.ensureFileDir();
    writeFileSync(this.knownHostsPath, JSON.stringify(this.knownHosts, null, 2), 'utf8');
  }

  static canonicalHost(host: string, port: number): string {
    return canonicalHost(host, port);
  }

  static toSha256Fingerprint(input: Buffer | string): string {
    return toSha256Fingerprint(input);
  }

  async verifyOrPrompt(host: string, fingerprintInput: Buffer | string): Promise<boolean> {
    const fingerprint = HostKeyStore.toSha256Fingerprint(fingerprintInput);
    const existing = this.knownHosts.hosts[host] ?? this.db.getKnownHost(host);

    if (existing) {
      if (existing.fingerprint === fingerprint) {
        return true;
      }

      this.emit('mismatch', {
        host,
        expected: existing.fingerprint,
        received: fingerprint
      });
      log('host-key', 'fingerprint mismatch', host, existing.fingerprint, fingerprint);
      return false;
    }

    const accepted = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(host);
        resolve(false);
      }, VERIFY_TIMEOUT_MS);

      this.pending.set(host, { fingerprint, resolve, timeout });
      this.emit('verify-request', { host, fingerprint });
    });

    if (accepted) {
      this.knownHosts.hosts[host] = {
        fingerprint,
        addedAt: Date.now()
      };
      this.save();
      this.db.upsertKnownHost(host, fingerprint);
      log('host-key', 'host key accepted and stored', host);
      return true;
    }

    return false;
  }

  respond(host: string, accepted: boolean): void {
    const pending = this.pending.get(host);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(host);
    pending.resolve(accepted);
  }
}
