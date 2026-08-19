import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CircleDot,
  CloudOff,
  Cpu,
  Loader2,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { schoolApi, type DeviceSession, type SchoolNotice } from "@/lib/school-api";

export const Route = createFileRoute("/_authenticated/receiver")({ component: ReceiverLabPage });

function ReceiverLabPage() {
  const queryClient = useQueryClient();
  const userSession = schoolApi.getUserSession();
  const [deviceSession, setDeviceSession] = useState<DeviceSession | null>(() =>
    schoolApi.getDeviceSession(),
  );
  const [label, setLabel] = useState("9A Classroom Display");
  const [deviceType, setDeviceType] = useState("RECEIVER_PANEL");
  const [enrollmentSecret, setEnrollmentSecret] = useState("");
  const [after, setAfter] = useState(0);
  const [syncedNotices, setSyncedNotices] = useState<SchoolNotice[]>([]);
  const config = useQuery({
    queryKey: ["receiver-config", deviceSession?.deviceId],
    queryFn: () => schoolApi.deviceConfig(deviceSession!.accessToken),
    enabled: Boolean(deviceSession),
    refetchInterval: 60_000,
  });
  const register = useMutation({
    mutationFn: () =>
      schoolApi.registerDevice({
        deviceInstallationId: crypto.randomUUID(),
        deviceType,
        label,
        organizationId: userSession?.user.organizationId,
        capabilities: ["OVERLAY", "WEBSOCKET", "NOTIFICATIONS", "TOUCH"],
        enrollmentSecret: enrollmentSecret || undefined,
      }),
    onSuccess: (session) => {
      schoolApi.setDeviceSession(session);
      setDeviceSession(session);
      setAfter(0);
      setSyncedNotices([]);
      toast.success("Receiver enrolled with the backend");
    },
    onError: (error) => toast.error(error.message),
  });
  const sync = useMutation({
    mutationFn: () => schoolApi.sync(deviceSession!.accessToken, after),
    onSuccess: (result) => {
      setSyncedNotices((current) => [...current, ...result.notices]);
      setAfter(result.nextAfter);
      toast.success(
        result.notices.length
          ? `${result.notices.length} change${result.notices.length === 1 ? "" : "s"} recovered`
          : "Receiver is already caught up",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const acknowledge = useMutation({
    mutationFn: (noticeId: string) => schoolApi.acknowledge(deviceSession!.accessToken, noticeId),
    onSuccess: () => {
      toast.success("Acknowledgement received by server");
      void queryClient.invalidateQueries({ queryKey: ["school-notices"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const syncNotices = sync.mutate;
  useEffect(() => {
    if (!deviceSession) return;
    const timer = window.setInterval(() => {
      syncNotices();
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [deviceSession, syncNotices]);
  const assignment = config.data?.assignment as
    { role?: string; effectiveFrom?: string } | null | undefined;
  const classroom = config.data?.classroom as { name?: string; code?: string } | null | undefined;
  const organization = config.data?.organization as { name?: string } | null | undefined;
  const displayed = useMemo(() => [...syncedNotices].reverse(), [syncedNotices]);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/65">
          Lab / Android receiver contract
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
          Receiver lab.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          This is a real client-side harness for the receiver contract: enroll a device, read server
          configuration, recover revisions, and send idempotent acknowledgements.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200">
              <RadioTower className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Enrollment
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">Provision a receiver</h2>
            </div>
          </div>
          {deviceSession ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.05] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                  <CircleDot className="h-4 w-4" /> Device session active
                </div>
                <p className="mt-2 break-all text-[11px] leading-5 text-slate-500">
                  {deviceSession.deviceId}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Mini label="Type" value={deviceType.replaceAll("_", " ")} />
                <Mini label="Revision cursor" value={String(after)} />
                <Mini label="Classroom" value={classroom?.name ?? "Unassigned"} />
                <Mini label="Assignment" value={assignment?.role ?? "Pending"} />
              </div>
              <button
                onClick={() => {
                  schoolApi.setDeviceSession(null);
                  setDeviceSession(null);
                  setSyncedNotices([]);
                  setAfter(0);
                }}
                className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-rose-200"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Clear local receiver session
              </button>
            </div>
          ) : (
            <form
              className="mt-6 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                register.mutate();
              }}
            >
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Device label
                </span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-200/50"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Device type
                </span>
                <select
                  value={deviceType}
                  onChange={(event) => setDeviceType(event.target.value)}
                  className="w-full appearance-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-200/50"
                >
                  <option>RECEIVER_PANEL</option>
                  <option>RECEIVER_TV</option>
                  <option>RECEIVER_PHONE</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Enrollment secret{" "}
                  <span className="normal-case tracking-normal text-slate-600">(production)</span>
                </span>
                <input
                  type="password"
                  value={enrollmentSecret}
                  onChange={(event) => setEnrollmentSecret(event.target.value)}
                  placeholder="Provided by your platform administrator"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-200/50"
                />
              </label>
              <div className="rounded-2xl border border-amber-200/15 bg-amber-200/[0.05] p-4 text-xs leading-5 text-slate-400">
                The first enrollment is stored against your signed-in organization's UUID. An
                administrator can assign this device to a branch or classroom after enrollment.
              </div>
              <button
                disabled={register.isPending || !schoolApi.isConfigured}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 py-3.5 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {register.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Cpu className="h-4 w-4" />
                )}{" "}
                Enroll real receiver
              </button>
            </form>
          )}
        </section>
        <section className="rounded-[2rem] border border-white/10 bg-[#0a1622] p-5 sm:p-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Receiver screen
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Server-delivered notices</h2>
              <p className="mt-2 text-xs text-slate-500">
                {organization?.name ?? "Organization pending"} ·{" "}
                {classroom?.name ?? "No classroom assignment yet"}
              </p>
            </div>
            <button
              onClick={() => sync.mutate()}
              disabled={!deviceSession || sync.isPending}
              className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.05] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} /> Sync
              now
            </button>
          </div>
          <div className="mt-7 space-y-3">
            {displayed.map((notice) => (
              <div
                key={`${notice.id}-${notice.revision}`}
                className={`rounded-2xl border p-5 ${notice.isDeleted ? "border-rose-200/15 bg-rose-200/[0.04]" : notice.priority === "EMERGENCY" ? "border-rose-200/25 bg-rose-200/[0.08]" : "border-cyan-200/15 bg-cyan-200/[0.045]"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-black/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-100/70">
                        {notice.priority}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-slate-600">
                        revision {notice.revision}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-white">{notice.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300/75">{notice.description}</p>
                  </div>
                  {notice.isDeleted ? (
                    <span className="text-xs font-semibold text-rose-200">Retracted</span>
                  ) : (
                    <button
                      onClick={() => acknowledge.mutate(notice.id)}
                      disabled={acknowledge.isPending}
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-900 hover:bg-cyan-100 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Done
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!displayed.length && (
              <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
                <CloudOff className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-4 text-sm font-semibold text-slate-500">
                  {deviceSession
                    ? "No revisions have been recovered yet."
                    : "Enroll a receiver to begin."}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  The receiver always trusts the sync cursor, not a WebSocket history.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.025] px-5 py-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2">
          <Wifi className="h-4 w-4 text-emerald-200" /> Device auth
        </span>
        <span className="inline-flex items-center gap-2">
          <WifiOff className="h-4 w-4 text-amber-200" /> Retry-safe sync
        </span>
        <span className="inline-flex items-center gap-2">
          <Check className="h-4 w-4 text-cyan-200" /> Idempotent acknowledgement
        </span>
      </div>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-600">{label}</p>
      <p className="mt-2 truncate text-xs font-semibold text-slate-300">{value}</p>
    </div>
  );
}
