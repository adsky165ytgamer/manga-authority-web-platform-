import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Mail, ShieldCheck, UserRound } from "lucide-react";
import { schoolApi } from "@/lib/school-api";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

function ProfilePage() {
  const session = schoolApi.getUserSession();
  const profile = useQuery({
    queryKey: ["school-profile"],
    queryFn: schoolApi.me,
    enabled: schoolApi.isConfigured,
  });
  const user = profile.data ?? session?.user;
  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/65">
          Workspace / identity
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
          Your operator profile.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          This identity controls what your organization, branch, and classroom scopes can do in the
          platform.
        </p>
      </div>
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <div className="flex flex-col gap-5 border-b border-white/8 pb-7 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-300/10 text-cyan-200">
            <UserRound className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-white">
              {user?.name ?? "Unknown operator"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{user?.email ?? "Email unavailable"}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-emerald-200 sm:ml-auto">
            <ShieldCheck className="h-3.5 w-3.5" /> {user?.role?.replaceAll("_", " ") ?? "Viewer"}
          </span>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <Detail icon={Building2} label="Organization ID" value={user?.organizationId ?? "—"} />
          <Detail icon={Mail} label="Signed-in email" value={user?.email ?? "—"} />
        </div>
      </section>
      <div className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.05] p-5 text-sm leading-6 text-slate-400">
        <span className="font-semibold text-cyan-100">Security note:</span> sender actions are
        checked again by the backend. The UI never decides whether a user may target an
        organization, branch, classroom, or device.
      </div>
    </div>
  );
}
function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
      <Icon className="h-4 w-4 text-cyan-200" />
      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
        {label}
      </p>
      <p className="mt-2 break-all text-xs font-medium text-slate-300">{value}</p>
    </div>
  );
}
