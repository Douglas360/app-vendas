"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (/sw.js) no carregamento da aplicação.
 * Necessário para o PWA ser instalável e funcionar offline.
 * Só registra em produção para não atrapalhar o hot-reload no dev.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.error("Falha ao registrar o service worker:", err));
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
