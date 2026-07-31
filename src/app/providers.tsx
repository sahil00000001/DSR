"use client";

import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";

/**
 * Client-side providers, mounted once at the root.
 *
 * Kept to the two that genuinely need to be global — toasts and confirmations
 * are requested from anywhere in the tree — plus service-worker registration.
 * Everything else stays local so server components remain the default.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        {children}
        <ServiceWorkerRegistrar />
      </ConfirmProvider>
    </ToastProvider>
  );
}
