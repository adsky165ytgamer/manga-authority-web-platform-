import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BatteryMedium,
  CheckCircle2,
  Cpu,
  MonitorPlay,
  RefreshCw,
  Smartphone,
  Tv2,
  WifiOff,
} from "lucide-react";
import { schoolApi, type DeviceRow } from "@/lib/school-api";

export const Route = createFileRoute("/_authenticated/devices")({ component: DevicesPage });

function DevicesPage() {
  const devices = useQuery({
    queryKey: ["school-devices"],
    queryFn: schoolApi.devices,
    enabled: schoolApi.isConfigured,
    refetchInterval: 30_000,
  });
  const rows = devices.data ?? [];
  const online = rows.filter((device) => device.status === "ONLINE").length;
  const recent = rows.filter((device) => device.status === "RECENTLY_ONLINE").length;
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/65">
            Infrastructure / receivers
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            Device fleet.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            The server derives each device's state from its heartbeat. No client can mark itself
            online without reaching the backend.
          </p>
        </div>
        <button
          onClick={() => void devices.refetch()}
          className="inline-flex items-center gap-2 self-start rounded-2xl border border-white/12 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05] md:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${devices.isFetching ? "animate-spin" : ""}`} /> Refresh
          fleet
        </button>
      </div>
      <section className="grid gap-4 sm:grid-cols-3">
        <Summary icon={CheckCircle2} label="Online now" value={String(online)} tone="emerald" />
        <Summary icon={BatteryMedium} label="Recently online" value={String(recent)} tone="amber" />
        <Summary
          icon={WifiOff}
          label="Offline"
          value={String(Math.max(rows.length - online - recent, 0))}
          tone="rose"
        />
      </section>
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035]">
        <div className="hidden grid-cols-[1.6fr_1fr_0.8fr_0.8fr] gap-4 border-b border-white/8 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600 md:grid">
          <span>Device</span>
          <span>Assignment</span>
          <span>Software</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-white/7">
          {rows.map((device) => (
            <DeviceRow device={device} key={device.id} />
          ))}
          {!rows.length && (
            <div className="p-12 text-center text-sm text-slate-500">
              {schoolApi.isConfigured
                ? "No devices enrolled yet."
                : "Set VITE_SCHOOL_API_URL to view the live fleet."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DeviceRow({ device }: { device: DeviceRow }) {
  const icon = device.device_type.includes("TV")
    ? Tv2
    : device.device_type.includes("PANEL")
      ? MonitorPlay
      : Smartphone;
  const Icon = icon;
  const status =
    device.status === "ONLINE"
      ? { label: "Online", color: "text-emerald-200", dot: "bg-emerald-300" }
      : device.status === "RECENTLY_ONLINE"
        ? { label: "Recently online", color: "text-amber-200", dot: "bg-amber-300" }
        : { label: "Offline", color: "text-rose-200", dot: "bg-rose-300" };
  return (
    <div className="grid gap-4 px-5 py-5 md:grid-cols-[1.6fr_1fr_0.8fr_0.8fr] md:items-center md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{device.label}</p>
          <p className="mt-1 truncate text-xs uppercase tracking-[0.14em] text-slate-600">
            {device.device_type.replaceAll("_", " ")}
          </p>
        </div>
      </div>
      <div className="pl-[52px] text-xs text-slate-400 md:pl-0">
        <p>{device.classroom_name ?? "Unassigned"}</p>
        <p className="mt-1 text-[11px] text-slate-600">{device.branch_name ?? "No branch"}</p>
      </div>
      <div className="pl-[52px] text-xs text-slate-500 md:pl-0">
        <p>{device.app_version ?? "Version unknown"}</p>
        <p className="mt-1 text-[11px] text-slate-600">
          {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "Never seen"}
        </p>
      </div>
      <div
        className={`flex items-center gap-2 pl-[52px] text-xs font-semibold md:pl-0 ${status.color}`}
      >
        <span
          className={`h-2 w-2 rounded-full ${status.dot} ${device.status === "ONLINE" ? "shadow-[0_0_10px_rgba(110,231,183,0.8)]" : ""}`}
        />
        {status.label}
      </div>
    </div>
  );
}
function Summary({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  tone: "emerald" | "amber" | "rose";
}) {
  const color = { emerald: "text-emerald-200", amber: "text-amber-200", rose: "text-rose-200" }[
    tone
  ];
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <Icon className={`h-5 w-5 ${color}`} />
      <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}
