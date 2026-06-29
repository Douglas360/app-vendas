"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, ScanLine } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ZXING_URL = "https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js";

// Carrega a biblioteca ZXing (UMD) uma única vez
function loadZxing(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.ZXing) return resolve(w.ZXing);
    const existing = document.getElementById("zxing-lib") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(w.ZXing));
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar o leitor.")));
      return;
    }
    const s = document.createElement("script");
    s.id = "zxing-lib";
    s.src = ZXING_URL;
    s.async = true;
    s.onload = () => resolve(w.ZXing);
    s.onerror = () => reject(new Error("Falha ao carregar o leitor."));
    document.head.appendChild(s);
  });
}

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    // sem áudio, tudo bem
  }
}

export function BarcodeScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const [status, setStatus] = useState<"loading" | "scanning" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const readerRef = useRef<any>(null);
  const lastRef = useRef<{ code: string; t: number }>({ code: "", t: 0 });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("loading");
    setErrorMsg("");
    setLastCode(null);

    (async () => {
      try {
        const ZXing = await loadZxing();
        if (cancelled) return;
        const reader = new ZXing.BrowserMultiFormatReader();
        readerRef.current = reader;

        await reader.decodeFromVideoDevice(
          null,
          "pdv-scanner-video",
          (result: any) => {
            if (!result) return;
            const code: string =
              typeof result.getText === "function" ? result.getText() : result.text;
            if (!code) return;
            const now = Date.now();
            // evita ler o mesmo código repetidas vezes em sequência
            if (code === lastRef.current.code && now - lastRef.current.t < 1500) return;
            lastRef.current = { code, t: now };
            setLastCode(code);
            beep();
            onDetected(code);
          }
        );
        if (!cancelled) setStatus("scanning");
      } catch (e: any) {
        if (cancelled) return;
        const name = e?.name || "";
        let msg = e?.message || "Não foi possível acessar a câmera.";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          msg = "Permissão da câmera negada. Autorize o acesso e tente de novo.";
        } else if (name === "NotFoundError") {
          msg = "Nenhuma câmera encontrada neste aparelho.";
        }
        setErrorMsg(msg);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      try {
        readerRef.current?.reset();
      } catch {
        // ignore
      }
      readerRef.current = null;
    };
  }, [open, onDetected]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-indigo-500" />
            Ler código de barras
          </DialogTitle>
          <DialogDescription>
            Aponte a câmera para o código de barras do produto. Os itens vão sendo adicionados ao
            carrinho.
          </DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-xl border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            id="pdv-scanner-video"
            className="aspect-square w-full object-cover"
            muted
            playsInline
          />
          {/* mira */}
          {status === "scanning" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-4/5 rounded-lg border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="h-7 w-7 animate-spin" />
              <p className="text-xs">Iniciando a câmera...</p>
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-sm">{errorMsg}</p>
            </div>
          )}
        </div>

        {lastCode && (
          <p className="text-center text-xs text-muted-foreground">
            Último lido: <span className="font-mono font-semibold">{lastCode}</span>
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full">
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
