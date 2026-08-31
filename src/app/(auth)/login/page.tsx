"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { login } from "@/lib/actions/auth";
import { ContinueWithGoogle, OrDivider } from "@/components/continue-with-google";

// useSearchParams() opts a client page into a Suspense boundary — split
// into its own component so only this bit suspends, not the whole form.
function GoogleOAuthError() {
  const oauthError = useSearchParams().get("error");
  if (!oauthError) return null;
  return (
    <p role="alert" className="mb-4 border border-live/50 bg-live/10 px-3 py-2 text-sm text-live">
      Couldn&apos;t sign in with Google. Try again.
    </p>
  );
}

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div>
      <p className="eyebrow mb-2">Welcome back</p>
      <h1 className="display mb-6 text-2xl uppercase tracking-[0.04em]">Log in</h1>

      <Suspense fallback={null}>
        <GoogleOAuthError />
      </Suspense>

      <ContinueWithGoogle />
      <OrDivider />

      <form action={action} className="space-y-4">
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
            autoComplete="current-password"
            required
            className="input"
          />
        </div>

        {state?.error && (
          <p role="alert" className="border border-live/50 bg-live/10 px-3 py-2 text-sm text-live">
            {state.error}
          </p>
        )}

        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Checking…" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        No account yet?{" "}
        <Link href="/register" className="text-signal hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
