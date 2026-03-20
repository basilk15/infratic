interface WelcomeScreenProps {
  onAddServer: () => void;
}

export const WelcomeScreen = ({ onAddServer }: WelcomeScreenProps): JSX.Element => {
  return (
    <div className="flex flex-1 items-center justify-center bg-bg-primary p-8">
      <div className="max-w-2xl rounded-2xl border border-bg-elevated bg-bg-secondary p-8 shadow-2xl shadow-black/20">
        <p className="text-sm uppercase tracking-[0.25em] text-accent-blue">Welcome</p>
        <h1 className="mt-3 text-4xl font-semibold">ServerPilot Studio helps you keep Linux servers under control.</h1>
        <ul className="mt-6 space-y-3 text-sm text-text-secondary">
          <li>Track SSH-connected servers from one desktop dashboard.</li>
          <li>Inspect services, live CPU and memory, logs, ports, and an embedded terminal.</li>
          <li>Organize hosts, add alerts, and jump into action when something changes.</li>
        </ul>
        <button
          type="button"
          onClick={onAddServer}
          className="mt-8 rounded-lg bg-accent-blue px-5 py-3 text-sm font-semibold hover:opacity-90"
        >
          Add your first server
        </button>
      </div>
    </div>
  );
};
