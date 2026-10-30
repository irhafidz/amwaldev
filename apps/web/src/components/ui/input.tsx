import type * as React from 'react';

import { cn } from '@/lib/utils';

interface InputProps extends React.ComponentProps<'input'> {
  error?: boolean;
  rightElement?: React.ReactNode;
}

function Input({
  className,
  type,
  error = false,
  rightElement,
  ...props
}: InputProps) {
  return (
    <div className="relative w-full">
      <input
        className={cn(
          'flex h-12 w-full min-w-0 rounded-field border bg-bg-default px-4 py-3 font-jakarta text-body-base text-text-primary shadow-xs outline-none transition-[color,box-shadow] selection:bg-brand-primary selection:text-white placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-rose-300 focus-visible:border-status-error focus-visible:ring-status-error/20'
            : 'border-gray-200 hover:border-gray-300 focus-visible:border-brand-primary focus-visible:ring-brand-primary/30',
          rightElement && 'pr-12',
          className
        )}
        data-slot="input"
        type={type}
        {...props}
      />
      {rightElement && (
        <div className="-translate-y-1/2 absolute top-1/2 right-4 flex items-center justify-center">
          {rightElement}
        </div>
      )}
    </div>
  );
}

export { Input };
