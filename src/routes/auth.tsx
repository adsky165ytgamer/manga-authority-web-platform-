import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Loader2,
  LockKeyhole,
  Mail,
  RadioTower,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SchoolApiError, schoolApi } from "@/lib/school-api";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    if (!schoolApi.getUserSession()) return;
    let valid = false;
    try {
      await schoolApi.me();
      valid = true;
    } catch {
      schoolApi.setUserSession(null);
    }
    if (valid) throw redirect({ to: "/home" });
  },
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await schoolApi.login(email.trim(), password);
      toast.success("Secure session established");
      await router.navigate({ to: "/home", replace: true });
    } catch (error) {
      toast.error(error instanceof SchoolApiError ? error.message : "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#07101a] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(70,160,190,0.18),transparent_30%),radial-gradient(circle_at_85%_78%,rgba(219,146,65,0.14),transparent_28%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-12">
        <section className="hidden lg:block">
          <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/80">
            <RadioTower className="h-4 w-4 text-cyan-300" /> School operations network
          </div>
          <p className="mb-5 max-w-xl text-sm font-semibold uppercase tracking-[0.32em] text-amber-200/70">
            NoticeFlow / command center
          </p>
          <h1 className="max-w-3xl text-6xl font-semibold leading-[0.98] tracking-[-0.055em] text-white xl:text-7xl">
            One trusted signal for every classroom.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300/75">
            Create, target, deliver, and acknowledge school notices from a single operational
            surface built for unreliable networks and real devices.
          </p>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {[
              [ShieldCheck, "Server authoritative"],
              [Building2, "Multi-branch"],
              [LockKeyhole, "Audit ready"],
            ].map(([Icon, label]) => {
              const Mark = Icon as typeof ShieldCheck;
              return (
                <div
                  key={label as string}
                  className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
                >
                  <Mark className="h-5 w-5 text-cyan-300" />
                  <p className="mt-4 text-xs font-medium leading-5 text-slate-300">
                    {label as string}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/70">
              NoticeFlow command center
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              School operations, in sync.
            </h1>
          </div>
          <div className="rounded-[2rem] border border-white/12 bg-slate-950/80 p-7 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
            <div className="mb-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950">
                  <RadioTower className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-tight text-white">NoticeFlow</p>
                  <p className="text-xs text-slate-400">School notice platform</p>
                </div>
              </div>
              <h2 className="mt-8 text-2xl font-semibold tracking-tight text-white">
                Welcome back
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Sign in with the account provisioned for your organization.
              </p>
            </div>
            {!schoolApi.isConfigured && (
              <div className="mb-6 flex gap-3 rounded-2xl border border-amber-200/20 bg-amber-100/[0.06] p-4 text-sm text-amber-100/80">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                <p>
                  Set{" "}
                  <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">
                    VITE_SCHOOL_API_URL
                  </code>{" "}
                  to point this UI at the deployed backend.
                </p>
              </div>
            )}
            <form className="space-y-5" onSubmit={submit}>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Work email
                </span>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.045] py-3.5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@school.org"
                    required
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Password
                </span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.045] py-3.5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Your secure password"
                    minLength={8}
                    required
                  />
                </span>
              </label>
              <button
                disabled={loading || !schoolApi.isConfigured}
                className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Enter command center{" "}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>
            <p className="mt-6 text-center text-xs leading-5 text-slate-500">
              Accounts are created and scoped by an organization administrator. There is no public
              self-registration.
            </p>
          </div>
          <p className="mt-6 text-center text-xs text-slate-600">
            Offline-first receivers · server-authoritative delivery · auditable acknowledgements
          </p>
        </section>
      </div>
    </main>
  );
}
