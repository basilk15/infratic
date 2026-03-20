import { app, safeStorage } from 'electron';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { log, logError } from '../utils/logger';

interface CredentialVault {
  entries: Record<string, string>;
}

type KeytarModule = {
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

export class CredentialStore extends EventEmitter {
  private readonly serviceName = 'serverpilot-studio';
  private readonly vaultPath: string;
  private keytar: KeytarModule | null = null;
  private keytarLoadFailed = false;
  private inMemoryFallback = new Map<string, string>();

  constructor() {
    super();
    this.vaultPath = join(app.getPath('userData'), 'credentials.vault.json');
  }

  private async loadKeytar(): Promise<KeytarModule | null> {
    if (this.keytar) {
      return this.keytar;
    }

    if (this.keytarLoadFailed) {
      return null;
    }

    try {
      const keytarModule = (await import('keytar')) as unknown;
      if (
        typeof keytarModule === 'object' &&
        keytarModule !== null &&
        'default' in keytarModule &&
        typeof keytarModule.default === 'object' &&
        keytarModule.default !== null
      ) {
        this.keytar = keytarModule.default as KeytarModule;
      } else {
        this.keytar = keytarModule as KeytarModule;
      }
      return this.keytar;
    } catch (err) {
      this.keytarLoadFailed = true;
      logError('credentials', 'keytar failed to load, switching to encrypted fallback', err);
      this.emit('warning', 'OS keychain unavailable. Using encrypted local vault fallback.');
      return null;
    }
  }

  private ensureVaultDir(): void {
    mkdirSync(dirname(this.vaultPath), { recursive: true });
  }

  private readVault(): CredentialVault {
    if (!existsSync(this.vaultPath)) {
      return { entries: {} };
    }

    try {
      const raw = readFileSync(this.vaultPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'entries' in parsed &&
        typeof (parsed as { entries: unknown }).entries === 'object' &&
        (parsed as { entries: unknown }).entries !== null
      ) {
        return parsed as CredentialVault;
      }
    } catch (err) {
      logError('credentials', 'failed to read credential vault, resetting file', err);
    }

    return { entries: {} };
  }

  private writeVault(vault: CredentialVault): void {
    this.ensureVaultDir();
    writeFileSync(this.vaultPath, JSON.stringify(vault, null, 2), 'utf8');
  }

  private setVaultValue(account: string, secret: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      this.inMemoryFallback.set(account, secret);
      this.emit(
        'warning',
        'Neither keytar nor Electron safeStorage is available. Credentials are stored in-memory only for this session.'
      );
      return;
    }

    const encrypted = safeStorage.encryptString(secret);
    const serialized = encrypted.toString('base64');
    const vault = this.readVault();
    vault.entries[account] = serialized;
    this.writeVault(vault);
  }

  private getVaultValue(account: string): string | null {
    if (!safeStorage.isEncryptionAvailable()) {
      return this.inMemoryFallback.get(account) ?? null;
    }

    const vault = this.readVault();
    const encoded = vault.entries[account];
    if (!encoded) {
      return null;
    }

    try {
      const decrypted = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
      return decrypted;
    } catch (err) {
      logError('credentials', 'failed to decrypt fallback credential', err);
      return null;
    }
  }

  async setServerSecret(serverId: string, secret: string): Promise<void> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      await keytar.setPassword(this.serviceName, serverId, secret);
      return;
    }

    this.setVaultValue(serverId, secret);
  }

  async getServerSecret(serverId: string): Promise<string | null> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      return keytar.getPassword(this.serviceName, serverId);
    }

    return this.getVaultValue(serverId);
  }

  async deleteServerSecret(serverId: string): Promise<void> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      await keytar.deletePassword(this.serviceName, serverId);
      return;
    }

    const vault = this.readVault();
    if (serverId in vault.entries) {
      delete vault.entries[serverId];
      this.writeVault(vault);
    }
    this.inMemoryFallback.delete(serverId);
  }

  async healthcheck(): Promise<void> {
    const keytar = await this.loadKeytar();
    if (!keytar) {
      log('credentials', 'using encrypted fallback credential store');
      return;
    }

    log('credentials', 'keytar loaded successfully');
  }
}
