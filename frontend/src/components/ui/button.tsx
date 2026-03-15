import { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'default' | 'outline';
    className?: string;
  }
>;

export function Button({ variant = 'default', className = '', children, ...props }: ButtonProps) {
  const base = 'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60';
  const variantClass = variant === 'outline' ? 'border bg-transparent' : '';

  return (
    <button {...props} className={`${base} ${variantClass} ${className}`.trim()}>
      {children}
    </button>
  );
}
