"use client";

import {compressImage} from "@/lib/image-compression";
import { useRef, useState } from "react";

export function ProjectLogoUpload({ value, onChange, compact = false, onProcessingChange }: { value?: string; compact?: boolean; onProcessingChange?:(busy:boolean)=>void; onChange: (value: string | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false);
  const [error, setError] = useState("");
  return <div className={`project-logo-upload${compact ? " project-logo-upload-compact" : ""}`}>
    {compact && <button className="button button-quiet" type="button" title="PNG, JPG, or WebP · Optimized before saving" disabled={busy} onClick={() => input.current?.click()}>{busy?"Optimizing…":value ? "Edit logo" : "Add logo"}</button>}
    <label className="field" style={compact ? {display: "none"} : undefined}>Project logo (optional)
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setBusy(true);setError("");onProcessingChange?.(true);
        try {const image=await compressImage(file,{maxDimension:384,maxBytes:100*1024});onChange(image.dataUrl);}
        catch(cause){setError(cause instanceof Error?cause.message:"This image could not be opened. Choose another file.");}
        finally{setBusy(false);onProcessingChange?.(false);}
      }} />
      <small>PNG, JPG, or WebP · Up to 20 MB; optimized before saving</small>
    </label>
    {value && !compact && <div className="project-logo-preview"><img src={value} alt="Project logo preview" /><button className="button button-quiet" type="button" onClick={() => onChange(undefined)}>Remove logo</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
