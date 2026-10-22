"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

type ToastMessage = { message: string; actionLabel?: string; onAction?: () => void };

export function showToast(detail: ToastMessage) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<ToastMessage>("evecture:toast", { detail }));
}

export function ToastHub() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => {
    let timeout: number | undefined;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<ToastMessage>).detail;
      setToast(detail);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setToast(null), 5000);
    };
    window.addEventListener("evecture:toast", receive);
    return () => { window.removeEventListener("evecture:toast", receive); window.clearTimeout(timeout); };
  }, []);

  if (!toast) return null;
  return <div className="toast-hub" role="status" aria-live="polite"><span className="toast-check"><Check size={15} /></span><span className="toast-copy">{toast.message}</span>{toast.onAction && <button type="button" className="toast-action" onClick={() => { toast.onAction?.(); setToast(null); }}>{toast.actionLabel || "Undo"}</button>}<button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button></div>;
}
