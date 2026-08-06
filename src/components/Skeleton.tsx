import React from 'react';
import { cn } from '../lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'rectangular' | 'circular' | 'text';
}

const Skeleton: React.FC<SkeletonProps> = ({ className, variant = 'rectangular' }) => {
  return (
    <div
      className={cn(
        "animate-pulse bg-slate-100",
        variant === 'circular' && "rounded-full",
        variant === 'rectangular' && "rounded-2xl",
        variant === 'text' && "h-3 w-3/4 rounded",
        className
      )}
    />
  );
};

export default Skeleton;
