"use client";

import { useState, useTransition } from "react";
import { changePasswordAction } from "@/lib/actions/auth";

/**
 * Self-service password change. changePasswordAction re-verifies the
 * current password with bcrypt and re-applies signup's strength rule
 * server-side regardless of what this form does client-side — the
 * `minLength`/`required` attributes here are just so a bad new password
 * doesn't even round-trip, not the actual boundary.
 *
 * On success every other session for this account gets signed out (the
 * action's own doing), so this shows that off explicitly rather than just
 * a generic "saved" — it's the part of "changing your password" someone
 * doing this because a session was stolen actually cares about.
 */
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await changePasswordAction(currentPassword, newPassword, confirmPassword);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="currentPassword" className="eyebrow mb-1.5 block">
          Current password
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="newPassword" className="eyebrow mb-1.5 block">
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="input"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="eyebrow mb-1.5 block">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="input"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="border border-live/50 bg-live/10 px-3 py-2 text-sm text-live">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="border border-signal/50 bg-signal/10 px-3 py-2 text-sm text-signal">
          Password changed. You&rsquo;ve been signed out everywhere else — this tab stays signed in.
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
