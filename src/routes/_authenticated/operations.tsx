import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, GraduationCap, MapPin, RefreshCw, School } from "lucide-react";
import { schoolApi } from "@/lib/school-api";

export const Route = createFileRoute("/_authenticated/operations")({ component: OperationsPage });

function OperationsPage() {
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
  const refresh = () => {
    void branches.refetch();
    void classrooms.refetch();
    void devices.refetch();
  };
  const classroomsByBranch = new Map<string, Record<string, unknown>[]>();
  for (const classroom of classrooms.data ?? []) {
    const key = String(classroom.branch_id ?? "unassigned");
    classroomsByBranch.set(key, [...(classroomsByBranch.get(key) ?? []), classroom]);
  }
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/65">
            Administration / topology
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            School structure.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Branches, classrooms, and receivers are real relationships in the database—not labels
            the frontend guesses.
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 self-start rounded-2xl border border-white/12 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05] md:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${branches.isFetching ? "animate-spin" : ""}`} /> Refresh
          structure
        </button>
      </div>
      <section className="grid gap-4 sm:grid-cols-3">
        <InfoCard icon={Building2} label="Branches" value={String(branches.data?.length ?? 0)} />
        <InfoCard
          icon={GraduationCap}
          label="Classrooms"
          value={String(classrooms.data?.length ?? 0)}
        />
        <InfoCard
          icon={School}
          label="Assigned receivers"
          value={String(devices.data?.filter((device) => device.classroom_id).length ?? 0)}
        />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {(branches.data ?? []).map((branch) => {
          const branchId = String(branch.id);
          const rooms = classroomsByBranch.get(branchId) ?? [];
          return (
            <article
              key={branchId}
              className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 sm:p-6"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-200">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{String(branch.name)}</h2>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-600">
                        {String(branch.code)}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-200">
                      {branch.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-6 space-y-2">
                {rooms.map((room) => (
                  <div
                    key={String(room.id)}
                    className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/15 px-4 py-3"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] text-slate-400">
                      <GraduationCap className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-200">
                        {String(room.name)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {String(room.code)}
                        {room.grade ? ` · Grade ${String(room.grade)}` : ""}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-slate-600">
                      {String(room.active_device_count ?? 0)} devices
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-700" />
                  </div>
                ))}
                {!rooms.length && (
                  <p className="rounded-2xl border border-dashed border-white/10 p-4 text-xs text-slate-600">
                    No classrooms assigned to this branch yet.
                  </p>
                )}
              </div>
            </article>
          );
        })}
        {!branches.data?.length && (
          <div className="rounded-[2rem] border border-dashed border-white/10 p-12 text-center text-sm text-slate-500 lg:col-span-2">
            {schoolApi.isConfigured
              ? "No branches found for this organization."
              : "Connect the frontend to a deployed backend to load structure."}
          </div>
        )}
      </section>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <Icon className="h-5 w-5 text-cyan-200" />
      <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}
