import { redirect } from "next/navigation";
import { SettingsPreferencesForm } from "@/components/settings-preferences-form";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function SettingsPreferencesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const preference = await prisma.playerPreference.findUnique({ where: { userId: user.id } });

  return (
    <div>
      <h2 className="display mb-1 text-base uppercase tracking-[0.05em]">Setup &amp; goals</h2>
      <p className="mb-4 text-sm text-muted">
        Region and language decide who you can actually play with. Goals shape what home shows you.
      </p>
      <SettingsPreferencesForm
        initialRegion={preference?.region}
        initialLanguages={preference?.languages}
        initialPlatforms={preference?.platforms}
        initialGoals={preference?.goals}
      />
    </div>
  );
}
