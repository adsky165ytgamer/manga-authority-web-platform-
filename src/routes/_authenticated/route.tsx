import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import {
  BellRing,
  ChevronDown,
  ClipboardList,
  Cpu,
  LayoutDashboard,
  LogOut,
  RadioTower,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { schoolApi } from "@/lib/school-api";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = schoolApi.getUserSession();
    if (!session) throw redirect({ to: "/auth" });
    try {
      const user = await schoolApi.me();
      return { user };
    } catch {
      schoolApi.setUserSession(null);
      throw redirect({ to: "/auth" });
    }
  },
  component: AuthedLayout,
});

const navigation = [
  { to: "/home", label: "Overview", icon: LayoutDashboard },
  { to: "/notices", label: "Notice center", icon: BellRing },
  { to: "/operations", label: "School structure", icon: ClipboardList },
  { to: "/devices", label: "Devices", icon: Cpu },
  { to: "/diagnostics", label: "Diagnostics", icon: SlidersHorizontal },
  { to: "/receiver", label: "Receiver lab", icon: RadioTower },
] as const;

function AuthedLayout() {
  const router = useRouter();
  const { user } = Route.useRouteContext();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await schoolApi.logout();
    await router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-[#07101a] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(56,149,177,0.10),transparent_34%),radial-gradient(circle_at_0%_100%,rgba(244,161,72,0.07),transparent_30%)]" />
      <div className="relative flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col border-r border-white/10 bg-[#08121d]/95 px-4 py-5 backdrop-blur-xl transition-transform lg:static lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center gap-3 px-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950">
              <RadioTower className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-white">NoticeFlow</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Command center
              </p>
            </div>
          </div>
          <div className="mt-9 px-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
              Workspace
            </p>
            <div className="mt-3 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className="group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-white/[0.055] hover:text-white"
                    activeProps={{
                      className:
                        "group flex items-center gap-3 rounded-2xl bg-cyan-300/[0.11] px-3 py-3 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-300/15",
                    }}
                  >
                    <Icon className="h-[17px] w-[17px] text-slate-500 transition group-hover:text-cyan-200" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="mt-auto space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <ShieldCheck className="h-4 w-4 text-emerald-300" /> Backend connected
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                Live data, scoped permissions, and durable sync are active.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/15 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-cyan-100">
                {(user.name || "S").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{user.name}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {user.role.replaceAll("_", " ").toLowerCase()}
                </p>
              </div>
              <button
                onClick={signOut}
                title="Sign out"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-white/10 hover:text-rose-200"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>
        {mobileOpen && (
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-white/8 bg-[#07101a]/80 px-5 py-4 backdrop-blur-xl lg:px-9">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  className="rounded-xl border border-white/10 p-2 text-slate-400 lg:hidden"
                  onClick={() => setMobileOpen(true)}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <div>
                  <p className="hidden text-[10px] font-bold uppercase tracking-[0.22em] text-slate-600 sm:block">
                    School operations / live workspace
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.8)]" />{" "}
                    Protected session
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2 text-xs text-slate-400 sm:flex">
                  <UsersRound className="h-4 w-4 text-cyan-200/70" />{" "}
                  <span>{user.email ?? "Organization user"}</span>
                </div>
                <Link
                  to="/profile"
                  className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:border-cyan-200/30 hover:text-cyan-100"
                >
                  <Settings2 className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </header>
          <div className="mx-auto max-w-[1500px] px-5 py-7 lg:px-9 lg:py-9">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
