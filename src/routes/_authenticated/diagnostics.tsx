import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  ServerCog,
  Wifi,
} from "lucide-react";
import { schoolApi } from "@/lib/school-api";

export const Route = createFileRoute("/_authenticated/diagnostics")({ component: DiagnosticsPage });

function DiagnosticsPage() {
  const diagnostics = useQuery({
    queryKey: ["school-diagnostics"],
    queryFn: schoolApi.diagnostics,
    enabled: schoolApi.isConfigured,
    refetchInterval: 30_000,
  });
  const events = useQuery({
    queryKey: ["school-delivery-events"],
    queryFn: schoolApi.deliveryEvents,
    enabled: schoolApi.isConfigured,
    refetchInterval: 30_000,
  });
  const data = diagnostics.data;
  const deviceStats = data?.devices as
    { total?: number; enabled?: number; online?: number } | undefined;
  const noticeStats = data?.notices as
    { total?: number; active?: number; latest_revision?: number } | undefined;
  const refresh = () => {
    void diagnostics.refetch();
    void events.refetch();
  };
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/65">
            Observability / server truth
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            Diagnostics.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            An operational explanation of what the backend knows: devices, revisions, delivery
            attempts, and acknowledgements.
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 self-start rounded-2xl border border-white/12 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05] md:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${diagnostics.isFetching ? "animate-spin" : ""}`} />{" "}
          Refresh signals
        </button>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={ServerCog}
          label="API state"
          value={schoolApi.isConfigured ? "Connected" : "Not configured"}
          sub={schoolApi.isConfigured ? "Backend URL available" : "Set VITE_SCHOOL_API_URL"}
          tone={schoolApi.isConfigured ? "emerald" : "amber"}
        />
        <Kpi
          icon={Wifi}
          label="Online receivers"
          value={String(deviceStats?.online ?? "—")}
          sub={`${deviceStats?.total ?? 0} total devices`}
          tone="cyan"
        />
        <Kpi
          icon={Database}
          label="Latest revision"
          value={String(noticeStats?.latest_revision ?? "—")}
          sub={`${noticeStats?.active ?? 0} active notices`}
          tone="white"
        />
        <Kpi
          icon={CheckCircle2}
          label="Ack / 24 hours"
          value={String(data?.acknowledgementsLast24Hours ?? "—")}
          sub="Server received"
          tone="emerald"
        />
      </section>
      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Traffic summary
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">Last 24 hours</h2>
            </div>
          </div>
          <div className="mt-7 space-y-4">
            {(
              (data?.deliveryEventsLast24Hours as
                { event_type: string; count: number }[] | undefined) ?? []
            ).map((event) => (
              <div key={event.event_type} className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-cyan-300/70"
                    style={{ width: `${Math.min(Number(event.count) * 8, 100)}%` }}
                  />
                </div>
                <span className="w-28 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {event.event_type.replaceAll("_", " ")}
                </span>
                <span className="w-10 text-right text-xs font-semibold text-white">
                  {event.count}
                </span>
              </div>
            ))}
            {!data?.deliveryEventsLast24Hours && (
              <p className="text-sm text-slate-600">No event data loaded.</p>
            )}
          </div>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-[#0a1622] p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Audit stream
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Recent delivery events</h2>
            </div>
            <Clock3 className="h-5 w-5 text-slate-600" />
          </div>
          <div className="mt-6 space-y-2">
            {(events.data ?? []).slice(0, 8).map((event, index) => (
              <div
                key={`${String(event.id)}-${index}`}
                className="flex items-center gap-3 rounded-2xl border border-white/7 bg-white/[0.025] px-4 py-3"
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${String(event.event_type).includes("FAILED") ? "bg-rose-300/10 text-rose-200" : "bg-emerald-300/10 text-emerald-200"}`}
                >
                  {String(event.event_type).includes("FAILED") ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white">
                    {String(event.event_type).replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-slate-600">
                    {String(event.device_label ?? "Organization event")} ·{" "}
                    {event.occurred_at ? new Date(String(event.occurred_at)).toLocaleString() : "—"}
                  </p>
                </div>
              </div>
            ))}
            {!events.data?.length && (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 p-7 text-sm text-slate-600">
                <Database className="h-4 w-4" /> Delivery events will appear after the first notice
                flow.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub: string;
  tone: "cyan" | "white" | "emerald" | "amber";
}) {
  const color = {
    cyan: "text-cyan-200",
    white: "text-white",
    emerald: "text-emerald-200",
    amber: "text-amber-200",
  }[tone];
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <Icon className={`h-5 w-5 ${color}`} />
      <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
      <p className="mt-2 text-xs text-slate-600">{sub}</p>
    </div>
  );
}
