import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/change-password-form";
import { SettingsProfileForm } from "@/components/settings-profile-form";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await prisma.profile.findUnique({ where: { userId: user.id }, select: { bio: true } });

  return (
    <div className="space-y-8">
      <section>
        <h2 className="display mb-3 text-base uppercase tracking-[0.05em]">Profile</h2>
        <p className="mb-4 text-sm text-muted">Signed in as {user.email}.</p>
        <SettingsProfileForm initialDisplayName={user.displayName} initialBio={profile?.bio ?? ""} />
      </section>

      <section className="border-t border-line pt-8">
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
