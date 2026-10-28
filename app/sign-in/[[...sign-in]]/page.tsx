"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setError("Supabase is not configured yet."); return; }
    setSubmitting(true); setError("");
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) { setError(result.error.message); setSubmitting(false); return; }
    router.replace(from);
  }

  return (
    <main className="auth-page">
      <div className="auth-brand">
        <span className="brand-mark">
          <img src="/evecture-logo.png" alt="EVECTURE" width={32} height={32} className="brand-logo-img" />
        </span>
        <span>
          <strong>EVECTURE</strong>
          <small>PROJECT WORKSPACE</small>
        </span>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h1>Sign in</h1>
        <p>Use the email and password provided by your administrator.</p>
        <label className="field">
          Email address
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="access-denied"><div className="panel"><p>Loading sign in…</p></div></div>}>
      <SignInForm />
    </Suspense>
  );
}
