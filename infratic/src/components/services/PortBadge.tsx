import type { PortInfo } from '@/types';

interface PortBadgeProps {
  port: PortInfo;
}

export const PortBadge = ({ port }: PortBadgeProps): JSX.Element => {
  return (
    <span
      className="inline-flex items-center rounded-full border border-bg-elevated bg-bg-tertiary px-2 py-0.5 text-[11px] font-semibold uppercase text-text-secondary"
      title={`${port.bindAddress}:${port.port}`}
    >
      {port.protocol}:{port.port}
    </span>
  );
};
