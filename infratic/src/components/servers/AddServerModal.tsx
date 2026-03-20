import { useMemo, useState } from 'react';
import type { AuthMethod, ServerType } from '@/types';
import { useServersStore } from '@/store/servers.store';

interface AddServerModalProps {
  open: boolean;
  onClose: () => void;
}

export const AddServerModal = ({ open, onClose }: AddServerModalProps): JSX.Element | null => {
  const addServer = useServersStore((state) => state.addServer);
  const testConnection = useServersStore((state) => state.testConnection);

  const [serverType, setServerType] = useState<ServerType | null>(null);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('password');
  const [privateKeyPath, setPrivateKeyPath] = useState('');
  const [password, setPassword] = useState('');
  const [privateKeyPassphrase, setPrivateKeyPassphrase] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [saving, setSaving] = useState(false);

  const resetState = (): void => {
    setServerType(null);
    setStep(1);
    setName('');
    setHost('');
    setPort(22);
    setUsername('');
    setAuthMethod('password');
    setPrivateKeyPath('');
    setPassword('');
    setPrivateKeyPassphrase('');
    setTesting(false);
    setTestResult('');
    setSaving(false);
  };

  const canNext = useMemo(() => {
    if (serverType !== 'ssh') {
      return false;
    }

    if (step === 2) {
      return host.trim().length > 0 && username.trim().length > 0;
    }

    if (step === 3) {
      if (authMethod === 'privateKey') {
        return privateKeyPath.trim().length > 0;
      }
      return true;
    }

    return true;
  }, [authMethod, host, privateKeyPath, serverType, step, username]);

  if (!open) {
    return null;
  }

  const remotePayload = {
    serverType: 'ssh' as const,
    name: name.trim() || host,
    host: host.trim(),
    port,
    username: username.trim(),
    authMethod,
    privateKeyPath: authMethod === 'privateKey' ? privateKeyPath.trim() : undefined,
    password: authMethod === 'password' ? password : undefined,
    privateKeyPassphrase: authMethod === 'privateKey' ? privateKeyPassphrase : undefined
  };

  const localPayload = {
    serverType: 'local' as const,
    name: name.trim(),
    host: 'localhost',
    port: 22,
    username: '',
    authMethod: 'agent' as const,
    privateKeyPath: undefined,
    password: undefined,
    privateKeyPassphrase: undefined
  };

  const closeModal = (): void => {
    resetState();
    onClose();
  };

  const remoteStep = step - 1;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-xl border border-bg-elevated bg-bg-secondary p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Server</h2>
          <button type="button" onClick={closeModal} className="text-sm text-text-secondary hover:text-text-primary">
            Close
          </button>
        </div>

        <div className="mb-4 text-xs uppercase tracking-wide text-text-secondary">
          {serverType === 'ssh' ? `Step ${remoteStep} / 4` : serverType === 'local' ? 'This Computer' : 'Step 1 / 4'}
        </div>

        {!serverType && (
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setServerType('local');
                setStep(1);
                setName('This Computer');
              }}
              className="rounded-xl border border-bg-elevated bg-bg-tertiary p-5 text-left hover:border-accent-blue"
            >
              <p className="text-base font-semibold">This Computer</p>
              <p className="mt-2 text-sm text-text-secondary">Manage processes on the same machine without SSH.</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setServerType('ssh');
                setStep(2);
              }}
              className="rounded-xl border border-bg-elevated bg-bg-tertiary p-5 text-left hover:border-accent-blue"
            >
              <p className="text-base font-semibold">Remote Server via SSH</p>
              <p className="mt-2 text-sm text-text-secondary">Use the existing SSH workflow for remote hosts.</p>
            </button>
          </div>
        )}

        {serverType === 'local' && (
          <div className="space-y-3">
            <label className="block text-sm">
              Display Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
                placeholder="This Computer"
              />
            </label>
            <p className="text-sm text-text-secondary">This creates a local Linux machine entry that is always available.</p>
          </div>
        )}

        {serverType === 'ssh' && step === 2 && (
          <div className="space-y-3">
            <label className="block text-sm">
              Host
              <input
                value={host}
                onChange={(event) => setHost(event.target.value)}
                className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
                placeholder="192.168.1.20"
              />
            </label>

            <label className="block text-sm">
              Port
              <input
                type="number"
                value={port}
                onChange={(event) => setPort(Number.parseInt(event.target.value, 10) || 22)}
                className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
                placeholder="ubuntu"
              />
            </label>
          </div>
        )}

        {serverType === 'ssh' && step === 3 && (
          <div className="space-y-3">
            <label className="block text-sm">
              Auth Method
              <select
                value={authMethod}
                onChange={(event) => setAuthMethod(event.target.value as AuthMethod)}
                className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
              >
                <option value="password">Password</option>
                <option value="privateKey">Private Key</option>
                <option value="agent">SSH Agent</option>
              </select>
            </label>

            {authMethod === 'password' && (
              <label className="block text-sm">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
                />
              </label>
            )}

            {authMethod === 'privateKey' && (
              <>
                <label className="block text-sm">
                  Private Key Path
                  <input
                    value={privateKeyPath}
                    onChange={(event) => setPrivateKeyPath(event.target.value)}
                    className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
                    placeholder="~/.ssh/id_ed25519"
                  />
                </label>

                <label className="block text-sm">
                  Key Passphrase (optional)
                  <input
                    type="password"
                    value={privateKeyPassphrase}
                    onChange={(event) => setPrivateKeyPassphrase(event.target.value)}
                    className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
                  />
                </label>
              </>
            )}
          </div>
        )}

        {serverType === 'ssh' && step === 4 && (
          <div className="space-y-3">
            <label className="block text-sm">
              Server Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
                placeholder={host || 'my-server'}
              />
            </label>

            <button
              type="button"
              className="rounded-md bg-accent-blue px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                const result = await testConnection(remotePayload);
                setTestResult(result.message);
                setTesting(false);
              }}
            >
              {testing ? 'Testing connection...' : 'Test connection'}
            </button>

            {testResult && <p className="text-sm text-text-secondary">{testResult}</p>}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            className="rounded-md bg-bg-elevated px-3 py-2 text-sm hover:bg-bg-tertiary disabled:opacity-50"
            disabled={!serverType || (serverType === 'ssh' && step === 1)}
            onClick={() => {
              if (serverType === 'local') {
                setServerType(null);
                setName('');
                return;
              }

              if (step === 2) {
                setServerType(null);
                setStep(1);
                return;
              }

              setStep((current) => Math.max(2, current - 1));
            }}
          >
            Back
          </button>

          {serverType === 'ssh' && step < 4 ? (
            <button
              type="button"
              className="rounded-md bg-accent-blue px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              disabled={!canNext}
              onClick={() => setStep((current) => Math.min(4, Math.max(2, current + 1)))}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="rounded-md bg-accent-green px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              disabled={saving || !serverType}
              onClick={async () => {
                setSaving(true);
                const saved = await addServer(serverType === 'local' ? localPayload : remotePayload);
                setSaving(false);
                if (saved) {
                  closeModal();
                }
              }}
            >
              {saving ? 'Saving...' : serverType === 'local' ? 'Add this computer' : 'Save server'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
