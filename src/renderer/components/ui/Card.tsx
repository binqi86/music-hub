import React from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className, onClick, hover = false }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-surface-800 rounded-xl border border-surface-700/30',
        hover && 'hover:bg-surface-750 hover:border-surface-600/30 cursor-pointer transition-all',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
