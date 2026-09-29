"use client";
import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="label">NIK / No. HP / Email</span>
        <input name="identifier" className="input" autoComplete="username" required autoFocus />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" className="input" autoComplete="current-password" required />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full py-2.5" disabled={pending}>
        {pending ? "Memeriksa…" : "Masuk"}
      </button>
      <div className="text-center">
        <Link href="/lupa-password" className="text-xs text-brand-600 hover:underline">
          Lupa password?
        </Link>
      </div>
    </form>
  );
}
