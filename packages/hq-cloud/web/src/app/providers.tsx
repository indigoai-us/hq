"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { NotificationProvider } from "@/contexts/NotificationContext";

export function Providers({ children }: { children: React.ReactNode }) {
  // Register service worker for PWA + push notifications
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failed
      });
    }
  }, []);

  return (
    <AuthProvider>
      <WebSocketProvider>
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}
