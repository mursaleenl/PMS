import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return <main className="auth-page"><div className="auth-brand"><span className="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 7h20M6 16h16M6 25h20"/><path d="M22 12l4 4-4 4"/></svg></span><span><strong>evecture</strong><small>STUDIO WORKSPACE</small></span></div><SignIn /></main>;
}
