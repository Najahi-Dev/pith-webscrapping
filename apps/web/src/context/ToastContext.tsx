'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { ToastItem, ToastType, ToastContainer } from '@pith/ui';

interface ToastOptions {
  description?: React.ReactNode;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (type: ToastType, title: string, options?: ToastOptions) => string;
  dismissToast: (id: string) => void;
  success: (title: string, description?: React.ReactNode, options?: ToastOptions) => string;
  error: (title: string, description?: React.ReactNode, options?: ToastOptions) => string;
  warning: (title: string, description?: React.ReactNode, options?: ToastOptions) => string;
  info: (title: string, description?: React.ReactNode, options?: ToastOptions) => string;
  loading: (title: string, description?: React.ReactNode, options?: ToastOptions) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let externalToastMethods: {
  showToast: (type: ToastType, title: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  success: (title: string, description?: React.ReactNode, options?: ToastOptions) => string;
  error: (title: string, description?: React.ReactNode, options?: ToastOptions) => string;
  warning: (title: string, description?: React.ReactNode, options?: ToastOptions) => string;
  info: (title: string, description?: React.ReactNode, options?: ToastOptions) => string;
  loading: (title: string, description?: React.ReactNode, options?: ToastOptions) => string;
} | null = null;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, options?: ToastOptions) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastItem = {
        id,
        type,
        title,
        description: options?.description,
        duration: options?.duration,
        action: options?.action,
      };

      setToasts((prev) => [...prev.slice(-4), newToast]); // keep max 5 active toasts
      return id;
    },
    []
  );

  const success = useCallback(
    (title: string, description?: React.ReactNode, options?: ToastOptions) => {
      return showToast('success', title, { ...options, description: description ?? options?.description });
    },
    [showToast]
  );

  const error = useCallback(
    (title: string, description?: React.ReactNode, options?: ToastOptions) => {
      return showToast('error', title, { ...options, description: description ?? options?.description });
    },
    [showToast]
  );

  const warning = useCallback(
    (title: string, description?: React.ReactNode, options?: ToastOptions) => {
      return showToast('warning', title, { ...options, description: description ?? options?.description });
    },
    [showToast]
  );

  const info = useCallback(
    (title: string, description?: React.ReactNode, options?: ToastOptions) => {
      return showToast('info', title, { ...options, description: description ?? options?.description });
    },
    [showToast]
  );

  const loading = useCallback(
    (title: string, description?: React.ReactNode, options?: ToastOptions) => {
      return showToast('loading', title, {
        duration: 0, // persistent until dismissed
        ...options,
        description: description ?? options?.description,
      });
    },
    [showToast]
  );

  // Expose global methods
  externalToastMethods = {
    showToast,
    dismiss: dismissToast,
    success,
    error,
    warning,
    info,
    loading,
  };

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        dismissToast,
        success,
        error,
        warning,
        info,
        loading,
      }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} position="bottom-right" />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// Convenient direct export for usage anywhere in client components
export const toast = {
  success: (title: string, description?: React.ReactNode, options?: ToastOptions) =>
    externalToastMethods?.success(title, description, options) || '',
  error: (title: string, description?: React.ReactNode, options?: ToastOptions) =>
    externalToastMethods?.error(title, description, options) || '',
  warning: (title: string, description?: React.ReactNode, options?: ToastOptions) =>
    externalToastMethods?.warning(title, description, options) || '',
  info: (title: string, description?: React.ReactNode, options?: ToastOptions) =>
    externalToastMethods?.info(title, description, options) || '',
  loading: (title: string, description?: React.ReactNode, options?: ToastOptions) =>
    externalToastMethods?.loading(title, description, options) || '',
  dismiss: (id: string) => externalToastMethods?.dismiss(id),
};
