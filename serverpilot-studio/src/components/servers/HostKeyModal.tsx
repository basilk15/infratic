interface HostKeyModalProps {
  host: string;
  fingerprint: string;
  onAccept: () => void;
  onReject: () => void;
}

export const HostKeyModal = ({ host, fingerprint, onAccept, onReject }: HostKeyModalProps): JSX.Element => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-accent-yellow bg-bg-secondary p-6">
        <h3 className="text-lg font-semibold text-text-primary">Verify Host Key</h3>
        <p className="mt-2 text-sm text-text-secondary">
          First connection to <span className="font-semibold text-text-primary">{host}</span>. Verify fingerprint before
          continuing.
        </p>
        <code className="mt-4 block rounded bg-bg-tertiary p-3 text-xs text-accent-blue">{fingerprint}</code>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onReject}
            className="rounded-md bg-bg-elevated px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-md bg-accent-green px-3 py-2 text-sm font-semibold text-bg-primary hover:opacity-90"
          >
            Trust and Continue
          </button>
        </div>
      </div>
    </div>
  );
};
