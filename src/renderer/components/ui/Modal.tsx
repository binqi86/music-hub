import React from 'react';
import { clsx } from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={clsx('relative bg-surface-800 rounded-xl border border-surface-700/50 shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto', className)}>
        <div className="flex items-center justify-between p-4 border-b border-surface-700/30">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-theme-secondary hover:text-theme-primary text-xl leading-none">&times;</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}