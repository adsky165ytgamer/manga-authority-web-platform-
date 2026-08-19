import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cpu,
  Layers3,
  Plus,
  RadioTower,
  RefreshCw,
  ServerCog,
  Wifi,
} from "lucide-react";
import { schoolApi, type DeviceRow, type SchoolNotice } from "@/lib/school-api";

export const Route = createFileRoute("/_authenticated/home")({ component: HomePage });

function HomePage() {
  const session = schoolApi.getUserSession();
  const org = useQuery({
    queryKey: ["school-org", session?.user.organizationId],
    queryFn: () => schoolApi.organization(session!.user.organizationId),
    enabled: Boolean(session) && schoolApi.isConfigured,
  });
  const devices = useQuery({
    queryKey: ["school-devices"],
    queryFn: schoolApi.devices,
    enabled: schoolApi.isConfigured,
    refetchInterval: 30_000,
  });
  const notices = useQuery({
    queryKey: ["school-notices"],
    queryFn: schoolApi.notices,
    enabled: schoolApi.isConfigured,
    refetchInterval: 30_000,
  });
  const diagnostics = useQuery({
    queryKey: ["school-diagnostics"],
    queryFn: schoolApi.diagnostics,
    enabled: schoolApi.isConfigured,
    refetchInterval: 30_000,
  });
  const rows = (devices.data ?? []) as DeviceRow[];
  const recent = (notices.data?.notices ?? []) as SchoolNotice[];
  const online = rows.filter((device) => device.status === "ONLINE").length;
  const attention = rows.filter((device) => device.status === "OFFLINE").length;
  const acknowledgement = Number(
    (diagnostics.data?.acknowledgementsLast24Hours as number | undefined) ?? 0,
  );
  const latestRevision = String(
    (diagnostics.data?.notices as { latest_revision?: number } | undefined)?.latest_revision ?? "—",
  );
  const organizationName = String(org.data?.name ?? "Your organization");

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/65">
            {organizationName} / command center
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            Good morning, {session?.user.name?.split(" ")[0] ?? "operator"}.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            See the health of every branch, send the next signal, and know exactly what each
            receiver has done with it.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/notices"
            className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
          >
            <Plus className="h-4 w-4" /> Create notice
          </Link>
          <Link
            to="/diagnostics"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/12 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05]"
          >
            <Activity className="h-4 w-4" /> View diagnostics
          </Link>
        </div>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Cpu}
          label="Devices online"
          value={devices.isLoading ? "—" : `${online}/${rows.length}`}
          hint={attention ? `${attention} need attention` : "All receivers healthy"}
          tone={attention ? "amber" : "cyan"}
        />
        <Stat
          icon={BellRing}
          label="Notices in feed"
          value={notices.isLoading ? "—" : String(recent.length)}
          hint={`Latest revision ${latestRevision}`}
          tone="white"
        />
        <Stat
          icon={CheckCircle2}
          label="Acknowledged today"
          value={diagnostics.isLoading ? "—" : String(acknowledgement)}
          hint="Server-confirmed receipts"
          tone="emerald"
        />
        <Stat
          icon={Wifi}
          label="Network state"
          value={schoolApi.isConfigured ? "Connected" : "Setup"}
          hint={schoolApi.isConfigured ? "Live API configured" : "Add API URL to connect"}
          tone={schoolApi.isConfigured ? "emerald" : "amber"}
        />
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Latest activity
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Notice delivery feed</h2>
            </div>
            <Link
              to="/notices"
              className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-200 hover:text-cyan-100"
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-6 space-y-2">
            {recent.slice(0, 5).map((notice) => (
              <NoticeRow key={notice.id} notice={notice} />
            ))}
            {!recent.length && (
              <EmptyState
                icon={BellRing}
                text={
                  schoolApi.isConfigured
                    ? "No notices have been created for this organization yet."
                    : "Connect the frontend to the backend to load live notices."
                }
              />
            )}
          </div>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-cyan-300/[0.11] via-white/[0.035] to-amber-200/[0.07] p-5 sm:p-7">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950/50 text-cyan-200">
            <ServerCog className="h-5 w-5" />
          </div>
          <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100/60">
            Operational principle
          </p>
          <h2 className="mt-3 text-2xl font-semibold leading-tight text-white">
            Realtime is a wake-up call. Sync is the source of truth.
          </h2>
          <p className="mt-4 text-sm leading-6 text-slate-300/70">
            Even when a receiver loses Wi-Fi, the revision cursor brings it back to the exact state
            the server expects.
          </p>
          <Link
            to="/receiver"
            className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-cyan-100 hover:text-white"
          >
            Open receiver lab <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <section className="rounded-[2rem] border border-white/10 bg-[#0a1622] p-5 sm:p-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
              Receiver heartbeat
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Network at a glance</h2>
          </div>
          <button
            onClick={() => {
              void devices.refetch();
              void diagnostics.refetch();
            }}
            className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:border-cyan-200/30 hover:text-cyan-100"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${devices.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {rows.slice(0, 6).map((device) => (
            <DeviceMini key={device.id} device={device} />
          ))}
          {!rows.length && (
            <EmptyState icon={Cpu} text="No enrolled devices are visible in this organization." />
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  hint: string;
  tone: "cyan" | "white" | "emerald" | "amber";
}) {
  const colors = {
    cyan: "text-cyan-200",
    white: "text-white",
    emerald: "text-emerald-200",
    amber: "text-amber-200",
  };
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <Icon className={`h-4 w-4 ${colors[tone]}`} />
      </div>
      <p className={`mt-5 text-3xl font-semibold tracking-tight ${colors[tone]}`}>{value}</p>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
function NoticeRow({ notice }: { notice: SchoolNotice }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/7 bg-black/10 px-4 py-3 transition hover:bg-white/[0.04]">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${notice.priority === "EMERGENCY" ? "bg-rose-300/10 text-rose-200" : notice.priority === "HIGH" ? "bg-amber-300/10 text-amber-200" : "bg-cyan-300/10 text-cyan-200"}`}
      >
        <BellRing className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{notice.title}</p>
        <p className="mt-1 truncate text-xs text-slate-500">
          {notice.targetType.toLowerCase()} · {notice.recipientCount ?? 0} receivers · revision{" "}
          {notice.revision}
        </p>
      </div>
      <span
        className={`hidden rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest sm:block ${notice.isDeleted ? "bg-rose-300/10 text-rose-200" : "bg-emerald-300/10 text-emerald-200"}`}
      >
        {notice.isDeleted ? "Retracted" : notice.expired ? "Expired" : "Live"}
      </span>
    </div>
  );
}
function DeviceMini({ device }: { device: DeviceRow }) {
  const color =
    device.status === "ONLINE"
      ? "bg-emerald-300"
      : device.status === "RECENTLY_ONLINE"
        ? "bg-amber-300"
        : "bg-rose-300";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3">
      <span
        className={`h-2 w-2 rounded-full ${color} ${device.status === "ONLINE" ? "shadow-[0_0_12px_rgba(110,231,183,0.8)]" : ""}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white">{device.label}</p>
        <p className="mt-1 truncate text-[11px] text-slate-500">
          {device.classroom_name ?? device.branch_name ?? "Unassigned"}
        </p>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-slate-600">
        {device.status.replaceAll("_", " ")}
      </span>
    </div>
  );
}
function EmptyState({ icon: Icon, text }: { icon: typeof BellRing; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 px-4 py-7 text-sm text-slate-500">
      <Icon className="h-4 w-4 shrink-0 text-slate-600" />
      {text}
    </div>
  );
}
