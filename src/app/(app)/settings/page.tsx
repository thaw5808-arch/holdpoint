import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/change-password-form";
import { getCurrentUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <p className="eyebrow mb-2">Settings</p>
      <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">Account</h1>
      <p className="mb-6 text-sm text-muted">Signed in as {user.email}.</p>

      <section>
        <h2 className="display mb-3 text-base uppercase tracking-[0.05em]">Change password</h2>
        {user.passwordHash ? (
          <ChangePasswordForm />
        ) : (
          <p className="text-sm text-muted">
            This account signs in with Google, so there&apos;s no password to change.
          </p>
        )}
      </section>
    </div>
  );
}
