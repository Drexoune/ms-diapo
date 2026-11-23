"use client";

import { Suspense, type ReactNode } from "react";
import { Tour } from "@/components/tour/Tour";
import { AppProvider } from "@/lib/app";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      {children}
      {/* La visite lit l'adresse de la page, connue seulement à la requête : sous Suspense, le reste se pré-rend. */}
      <Suspense fallback={null}>
        <Tour />
      </Suspense>
    </AppProvider>
  );
}
