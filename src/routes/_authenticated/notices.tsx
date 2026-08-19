import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  Check,
  ChevronDown,
  Clock3,
  Loader2,
  Megaphone,
  RotateCcw,
  Send,
  ShieldAlert,
  Target,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { schoolApi, type SchoolNotice } from "@/lib/school-api";

export const Route = createFileRoute("/_authenticated/notices")({ component: NoticesPage });

type TargetType = "ORGANIZATION" | "BRANCH" | "CLASSROOM" | "DEVICE";

function NoticesPage() {
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"NORMAL" | "HIGH" | "EMERGENCY">("NORMAL");
  const [targetType, setTargetType] = useState<TargetType>("CLASSROOM");
  const [targetId, setTargetId] = useState("");
  const notices = useQuery({
    queryKey: ["school-notices"],
    queryFn: schoolApi.notices,
    enabled: schoolApi.isConfigured,
  });
  const branches = useQuery({
    queryKey: ["school-branches"],
    queryFn: schoolApi.branches,
    enabled: schoolApi.isConfigured,
  });
  const classrooms = useQuery({
    queryKey: ["school-classrooms"],
    queryFn: schoolApi.classrooms,
    enabled: schoolApi.isConfigured,
  });
  const devices = useQuery({
    queryKey: ["school-devices"],
    queryFn: schoolApi.devices,
    enabled: schoolApi.isConfigured,
  });
  const types = useQuery({
    queryKey: ["school-notice-types"],
    queryFn: schoolApi.noticeTypes,
    enabled: schoolApi.isConfigured,
  });
  const create = useMutation({
    mutationFn: schoolApi.createNotice,
    onSuccess: (result) => {
      toast.success(
        `Notice queued for ${result.recipientCount} receiver${result.recipientCount === 1 ? "" : "s"}`,
      );
      setTitle("");
      setDescription("");
      setTargetId("");
      void queryClient.invalidateQueries({ queryKey: ["school-notices"] });
      void queryClient.invalidateQueries({ queryKey: ["school-diagnostics"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const retract = useMutation({
    mutationFn: schoolApi.retractNotice,
    onSuccess: () => {
      toast.success("Notice retracted");
      void queryClient.invalidateQueries({ queryKey: ["school-notices"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const options = useMemo(
    () =>
      targetType === "BRANCH"
        ? (branches.data ?? [])
        : targetType === "CLASSROOM"
          ? (classrooms.data ?? [])
          : (devices.data ?? []),
    [targetType, branches.data, classrooms.data, devices.data],
  );
  const optionLabel = (item: Record<string, unknown>) =>
    String(item.name ?? item.label ?? item.title ?? "Unnamed");
  const optionId = (item: Record<string, unknown>) => String(item.id ?? "");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: Record<string, unknown> = { title, description, priority, targetType };
    if (targetType === "BRANCH") input.targetBranchId = targetId;
    if (targetType === "CLASSROOM") input.targetClassroomId = targetId;
    if (targetType === "DEVICE") input.targetDeviceId = targetId;
    create.mutate(input);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/65">
            Communications / sender
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            Notice center.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Create one authoritative message, target it precisely, and watch the delivery state
            resolve across the network.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-xs text-slate-400">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-300" /> Backend-first
          delivery
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 sm:p-7">
          <button
            className="flex w-full items-start justify-between text-left"
            onClick={() => setComposerOpen((value) => !value)}
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Compose signal
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">New school notice</h2>
            </div>
            <ChevronDown
              className={`mt-1 h-5 w-5 text-slate-500 transition ${composerOpen ? "rotate-180" : ""}`}
            />
          </button>
          {composerOpen && (
            <form onSubmit={submit} className="mt-7 space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Title
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Tomorrow is a holiday"
                  required
                  maxLength={200}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-200/50 focus:ring-4 focus:ring-cyan-200/10"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Message
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What should receivers display?"
                  required
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-200/50 focus:ring-4 focus:ring-cyan-200/10"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Priority"
                  value={priority}
                  onChange={(value) => setPriority(value as typeof priority)}
                  options={["NORMAL", "HIGH", "EMERGENCY"]}
                />
                <SelectField
                  label="Target type"
                  value={targetType}
                  onChange={(value) => {
                    setTargetType(value as TargetType);
                    setTargetId("");
                  }}
                  options={["ORGANIZATION", "BRANCH", "CLASSROOM", "DEVICE"]}
                />
              </div>
              {targetType !== "ORGANIZATION" && (
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Target
                  </span>
                  <select
                    value={targetId}
                    onChange={(event) => setTargetId(event.target.value)}
                    required
                    className="w-full appearance-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-200/50"
                  >
                    <option value="">Choose a {targetType.toLowerCase()}</option>
                    {options.map((item) => (
                      <option key={optionId(item)} value={optionId(item)}>
                        {optionLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex items-start gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4 text-xs leading-5 text-slate-400">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                <span>
                  The server validates this relationship and snapshots the matched receivers before
                  it commits the revision.
                </span>
              </div>
              <button
                disabled={create.isPending || !schoolApi.isConfigured}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {create.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}{" "}
                Publish notice
              </button>
            </form>
          )}
        </section>
        <section className="rounded-[2rem] border border-white/10 bg-[#0a1622] p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Delivery history
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Recent notices</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{notices.data?.notices.length ?? 0} loaded</span>
              <BellRing className="h-4 w-4 text-cyan-200/70" />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {(notices.data?.notices ?? []).map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                onRetract={() => retract.mutate(notice.id)}
                retracting={retract.isPending}
              />
            ))}
            {!notices.data?.notices.length && (
              <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
                <Megaphone className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-4 text-sm text-slate-500">
                  Your notice feed will appear here after the first publish.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-200/50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
function NoticeCard({
  notice,
  onRetract,
  retracting,
}: {
  notice: SchoolNotice;
  onRetract: () => void;
  retracting: boolean;
}) {
  const status = notice.isDeleted
    ? { label: "Retracted", className: "bg-rose-300/10 text-rose-200" }
    : notice.expired
      ? { label: "Expired", className: "bg-amber-300/10 text-amber-200" }
      : { label: "Active", className: "bg-emerald-300/10 text-emerald-200" };
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 transition hover:bg-white/[0.045]">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${notice.priority === "EMERGENCY" ? "bg-rose-300/10 text-rose-200" : "bg-cyan-300/10 text-cyan-200"}`}
        >
          {notice.priority === "EMERGENCY" ? (
            <ShieldAlert className="h-4 w-4" />
          ) : (
            <BellRing className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-white">{notice.title}</h3>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{notice.description}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.14em] text-slate-600">
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" /> {notice.targetType}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {notice.recipientCount ?? 0} matched
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" /> rev {notice.revision}
            </span>
            <span>{new Date(notice.createdAt).toLocaleString()}</span>
          </div>
        </div>
        {!notice.isDeleted && (
          <button
            onClick={onRetract}
            disabled={retracting}
            className="rounded-xl border border-white/10 p-2 text-slate-500 transition hover:border-rose-200/30 hover:text-rose-200 disabled:opacity-50"
            title="Retract notice"
          >
            {retracting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </article>
  );
}
