'use client';

import React from 'react';
import { ToastProvider, ConfirmProvider } from '@/context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
