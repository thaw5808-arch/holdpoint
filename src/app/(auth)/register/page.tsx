"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register } from "@/lib/actions/auth";
import { ContinueWithGoogle, OrDivider } from "@/components/continue-with-google";

export default function RegisterPage() {
  const [state, action, pending] = useActionState(register, undefined);

  return (
    <div>
      <p className="eyebrow mb-2">Take your spot</p>
      <h1 className="display mb-6 text-2xl uppercase tracking-[0.04em]">Create account</h1>

      <ContinueWithGoogle />
      <OrDivider />

      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="displayName" className="eyebrow mb-1.5 block">
            Display name
          </label>
          <input id="displayName" name="displayName" required className="input" />
        </div>
        <div>
          <label htmlFor="username" className="eyebrow mb-1.5 block">
            Username
          </label>
          <input
            id="username"
            name="username"
            required
            className="input"
            pattern="[a-zA-Z0-9_]+"
            aria-describedby="username-hint"
          />
          <p id="username-hint" className="mt-1 text-[0.6875rem] text-faint">
            This becomes your channel address: holdpoint.gg/watch/yourname
          </p>
        </div>
        <div>
          <label htmlFor="email" className="eyebrow mb-1.5 block">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="eyebrow mb-1.5 block">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="input"
          />
        </div>

        {state?.error && (
          <p role="alert" className="border border-live/50 bg-live/10 px-3 py-2 text-sm text-live">
            {state.error}
          </p>
        )}

        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Already here?{" "}
        <Link href="/login" className="text-signal hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
