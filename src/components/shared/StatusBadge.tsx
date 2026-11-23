import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STYLES: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
};

const DOTS: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-blue-500',
  neutral: 'bg-slate-400',
};

interface StatusBadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  variant,
  children,
  dot = false,
  pulse = false,
  className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors duration-200 ${STYLES[variant]} ${className}`}
  >
    {dot && (
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-radar-ping ${DOTS[variant]}`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${DOTS[variant]}`} />
      </span>
    )}
    {children}
  </span>
);

export function estatusSatBadge(estatus: 'vigente' | 'cancelado' | 'en_cancelacion') {
  if (estatus === 'vigente') {
    return (
      <StatusBadge variant="success" dot>
        Vigente
      </StatusBadge>
    );
  }
  if (estatus === 'en_cancelacion') {
    return (
      <StatusBadge variant="warning" dot pulse>
        En cancelación
      </StatusBadge>
    );
  }
  return (
    <StatusBadge variant="danger" dot>
      Cancelado
    </StatusBadge>
  );
}
