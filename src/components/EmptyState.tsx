import React from "react";
import { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon | React.ReactNode;
  action?: () => void;
  actionLabel?: string;
}

const EmptyState = ({ title, description, icon: Icon, action, actionLabel }: Props) => {
  // Handle if icon is a React element already (wrapped in JSX)
  const iconElement = React.isValidElement(Icon) ? (
    Icon
  ) : Icon && typeof Icon === "function" ? (
    // Icon is a Lucide icon component
    <Icon className="w-8 h-8 text-slate-300" />
  ) : (
    <span className="text-2xl text-slate-300">📋</span>
  );

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        {iconElement}
      </div>
      <h3 className="text-base font-black text-primary mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-400 max-w-xs">{description}</p>}
      {action && actionLabel && (
        <button
          onClick={action}
          className="mt-5 px-6 py-3 bg-primary text-secondary rounded-xl font-black text-xs uppercase tracking-wider hover:scale-105 transition-transform"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
