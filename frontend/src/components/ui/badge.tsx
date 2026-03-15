import { PropsWithChildren } from 'react';

type BadgeProps = PropsWithChildren<{
  className?: string;
  variant?: 'default' | 'secondary';
}>;

export function Badge({ className = '', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`.trim()}>
      {children}
    </span>
  );
}
