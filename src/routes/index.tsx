import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, BellRing, CheckCircle2, Cpu, RadioTower, ShieldCheck } from "lucide-react";
import { schoolApi } from "@/lib/school-api";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    if (schoolApi.getUserSession()) throw redirect({ to: "/home" });
  },
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#07101a] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(53,160,183,0.18),transparent_33%),radial-gradient(circle_at_90%_90%,rgba(216,142,59,0.13),transparent_28%)]" />
      <div className="relative mx-auto max-w-7xl px-6 pb-12 pt-6 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950">
              <RadioTower className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">NoticeFlow</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                School operations
              </p>
            </div>
          </div>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-200/40 hover:bg-white/[0.05]"
          >
            Sign in <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </header>
        <section className="grid min-h-[690px] items-center gap-14 py-20 lg:grid-cols-[1.08fr_0.92fr] lg:py-28">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/80">
              <span className="h-2 w-2 rounded-full bg-emerald-300" /> Built for real school
              networks
            </div>
            <h1 className="max-w-3xl text-6xl font-semibold leading-[0.95] tracking-[-0.06em] text-white sm:text-7xl xl:text-8xl">
              Every room on the same page.
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-slate-300/75">
              A dependable notice command center for organizations with multiple branches,
              classrooms, Android receivers, and teachers who need a signal they can trust.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
              >
                Open command center <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/12 px-5 py-3.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05]"
              >
                See the flow
              </a>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-6 gap-y-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Offline-first receivers
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Server-authoritative targeting
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Durable acknowledgements
              </span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-8 rounded-[3rem] bg-cyan-300/10 blur-3xl" />
            <div className="relative rounded-[2rem] border border-white/12 bg-slate-950/80 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="rounded-[1.4rem] border border-white/10 bg-[#0c1723] p-5">
                <div className="flex items-center justify-between border-b border-white/8 pb-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      Live network pulse
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">Thursday / 08:42</p>
                  </div>
                  <span className="rounded-full bg-emerald-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-200">
                    Healthy
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Metric label="Active devices" value="128" accent="text-cyan-200" />
                  <Metric label="Delivered today" value="1,842" accent="text-white" />
                  <Metric label="Acknowledged" value="94.8%" accent="text-emerald-200" />
                  <Metric label="Needs attention" value="07" accent="text-amber-200" />
                </div>
                <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200">
                      <BellRing className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">
                        Assembly moved to 10:30
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">Mahabubnagar / 24 receivers</p>
                    </div>
                    <span className="text-[10px] text-slate-500">2m</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">9A Display</p>
                    <p className="mt-1 text-[11px] text-emerald-200/80">Synced · revision 1,204</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section
          id="how-it-works"
          className="grid gap-4 border-t border-white/8 pt-10 md:grid-cols-3"
        >
          <Feature
            icon={ShieldCheck}
            title="Permissioned by design"
            text="Roles, organizations, branches, and scopes prevent accidental cross-school delivery."
          />
          <Feature
            icon={BellRing}
            title="One durable signal"
            text="Create once, wake receivers instantly, and recover every change through sync."
          />
          <Feature
            icon={RadioTower}
            title="See what happened"
            text="Delivery events, heartbeat status, and acknowledgements keep operations explainable."
          />
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tracking-tight ${accent}`}>{value}</p>
    </div>
  );
}
function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-6">
      <Icon className="h-5 w-5 text-cyan-200" />
      <h2 className="mt-5 text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}
