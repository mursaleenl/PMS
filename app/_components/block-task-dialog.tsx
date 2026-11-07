"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";

export function BlockTaskDialog({ title, initialReason, onConfirm, onClose }: { title: string; initialReason?: string; onConfirm: (reason: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState(initialReason || "");
  const [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    node?.querySelector("textarea")?.focus();
    return () => {
      node?.close();
      requestAnimationFrame(() => { if (previousFocus?.isConnected) previousFocus.focus(); });
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) { setError("Enter a reason for blocking this task."); return; }
    onConfirm(reason.trim());
  }

  return <dialog ref={dialog} className="assign-task-dialog task-blocker-dialog" aria-labelledby="block-task-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id="block-task-title">Block task</h2><button className="icon-button" type="button" aria-label="Close blocking form" onClick={onClose}><X size={18} /></button></header>
    <p>{title}</p>
    <form onSubmit={submit}>
      <label className="field required">Reason<textarea name="reason" required rows={4} maxLength={2000} value={reason} onChange={event => { setReason(event.target.value); setError(""); }} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">Block task</button></div>
    </form>
  </dialog>;
}
