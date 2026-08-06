import React from 'react';
import { LoaderCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface LoadingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  (
    {
      isLoading = false,
      loadingText = 'Chargement...',
      variant = 'primary',
      size = 'md',
      icon,
      className,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const variantStyles = {
      primary:
        'bg-primary hover:bg-primary-dark text-white enabled:hover:shadow-lg',
      secondary:
        'bg-slate-100 hover:bg-slate-200 text-slate-700 enabled:hover:shadow-md',
      danger:
        'bg-red-500 hover:bg-red-600 text-white enabled:hover:shadow-lg enabled:hover:shadow-red-500/20',
      success:
        'bg-green-500 hover:bg-green-600 text-white enabled:hover:shadow-lg enabled:hover:shadow-green-500/20',
    };

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs font-bold',
      md: 'px-4 py-2.5 text-sm font-semibold',
      lg: 'px-6 py-3 text-base font-bold',
    };

    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: isLoading || disabled ? 1 : 1.02 }}
        whileTap={{ scale: isLoading || disabled ? 1 : 0.98 }}
        disabled={isLoading || disabled}
        className={cn(
          'rounded-lg transition-all duration-200 uppercase tracking-widest',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'flex items-center justify-center gap-2',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <LoaderCircle className="w-4 h-4 animate-spin" />
            {loadingText}
          </>
        ) : (
          <>
            {icon}
            {children}
          </>
        )}
      </motion.button>
    );
  }
);

LoadingButton.displayName = 'LoadingButton';

export default LoadingButton;
