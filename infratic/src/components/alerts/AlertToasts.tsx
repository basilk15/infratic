import { useEffect } from 'react';
import type { AppAlertEvent } from '@/types';

interface AlertToastsProps {
  events: AppAlertEvent[];
  onDismiss: (id: string) => void;
}

export const AlertToasts = ({ events, onDismiss }: AlertToastsProps): JSX.Element | null => {
  useEffect(() => {
    if (events.length === 0) {
      return;
    }

    const timers = events.map((event) =>
      window.setTimeout(() => {
        onDismiss(event.id);
      }, 6000)
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [events, onDismiss]);

  if (events.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[360px] flex-col gap-3">
      {events.map((event) => (
        <div
          key={event.id}
          className="pointer-events-auto rounded-xl border border-accent-blue/30 bg-bg-secondary p-4 shadow-2xl shadow-black/20"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">{event.title}</p>
              <p className="mt-1 text-xs text-text-secondary">{event.body}</p>
            </div>
            <button
              type="button"
              className="text-xs text-text-secondary hover:text-text-primary"
              onClick={() => onDismiss(event.id)}
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
