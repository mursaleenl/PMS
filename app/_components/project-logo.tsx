"use client";

import { useRef, useState } from "react";

export function ProjectLogoUpload({ value, onChange, compact = false }: { value?: string; compact?: boolean; onChange: (value: string | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return <div className={`project-logo-upload${compact ? " project-logo-upload-compact" : ""}`}>
    {compact && <button className="button button-quiet" type="button" title="PNG, JPG, or WebP · Up to 512 KB" onClick={() => input.current?.click()}>{value ? "Edit logo" : "Add logo"}</button>}
    <label className="field" style={compact ? {display: "none"} : undefined}>Project logo (optional)
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 512 * 1024) { setError("Choose a PNG, JPG, or WebP image up to 512 KB."); return; }
        try {
          const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
          const image = new Image(); image.src = data; await image.decode();
          onChange(data); setError("");
        } catch { setError("This image could not be opened. Choose another file."); }
      }} />
      <small>PNG, JPG, or WebP · Up to 512 KB</small>
    </label>
    {value && !compact && <div className="project-logo-preview"><img src={value} alt="Project logo preview" /><button className="button button-quiet" type="button" onClick={() => onChange(undefined)}>Remove logo</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
