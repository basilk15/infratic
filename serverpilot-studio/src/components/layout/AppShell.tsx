import type { ReactNode } from 'react';

interface AppShellProps {
  sidebar: ReactNode;
  main: ReactNode;
  detail: ReactNode;
  terminal: ReactNode;
}

export const AppShell = ({ sidebar, main, detail, terminal }: AppShellProps): JSX.Element => {
  return (
    <div className="flex h-screen flex-col bg-bg-primary text-text-primary">
      <div className="flex min-h-0 flex-1">
        {sidebar}
        {main}
        {detail}
      </div>
      {terminal}
    </div>
  );
};
