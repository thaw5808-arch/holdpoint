import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <p className="eyebrow mb-2">Settings</p>
      <h1 className="display mb-5 text-2xl uppercase tracking-[0.04em]">Account</h1>
      <SettingsNav />
      {children}
    </div>
  );
}
