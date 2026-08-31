import Link from "next/link";
import { Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_460px]">
      <section className="relative hidden overflow-hidden border-r border-line lg:block">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 15% 10%, rgba(203,255,77,0.10), transparent 55%), linear-gradient(160deg, #0a0f0d, #101a14)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-signal) 1px, transparent 1px), linear-gradient(90deg, var(--color-signal) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Link href="/">
            <Wordmark />
          </Link>
          <div className="max-w-md">
            <p className="eyebrow mb-3">The point you hold</p>
            <h1 className="display text-4xl uppercase leading-[1.05] tracking-[0.02em]">
              Watch. Team up.
              <br />
              <span className="text-signal">Compete.</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Your channels, your squad, your bracket and your record — in one place, whether
              anyone is live right now or not.
            </p>
          </div>
          <p className="tabular text-[0.6875rem] text-faint">
            SEA · NA · EU · 24 games · 8 open tournaments
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </div>
  );
}
