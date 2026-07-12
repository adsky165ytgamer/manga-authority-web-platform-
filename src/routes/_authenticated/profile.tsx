import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { emailToUsername } from "@/lib/username";
import { BookOpen, Layers, Shield, User as UserIcon, Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

async function loadProfile(userId: string, email: string | undefined) {
  const [profileRes, roleRes, mangaRes, chapRes] = await Promise.all([
    supabase.from("profiles").select("username, created_at").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("manga").select("id", { count: "exact", head: true }).eq("created_by", userId),
    supabase.from("chapters").select("id, manga!inner(created_by)", { count: "exact", head: true }).eq("manga.created_by", userId),
  ]);
  return {
    username: profileRes.data?.username ?? emailToUsername(email),
    createdAt: profileRes.data?.created_at ?? null,
    roles: (roleRes.data ?? []).map((r) => r.role),
    mangaCount: mangaRes.count ?? 0,
    chapterCount: chapRes.count ?? 0,
  };
}

function ProfilePage() {
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  const { data, isLoading } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: () => loadProfile(user.id, user.email),
  });

  const role = data?.roles.includes("admin") ? "Admin" : data?.roles.includes("uploader") ? "Uploader" : "Member";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="silver-text font-display text-3xl sm:text-4xl font-bold tracking-wider">PROFILE</h1>
      </div>

      {isLoading || !data ? (
        <div className="text-center text-muted-foreground py-16">Loading…</div>
      ) : (
        <div className="metal-card p-6 sm:p-8 animate-fade-in">
          <div className="flex items-center gap-4 pb-6 border-b border-border">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-neutral-800 to-black metal-border">
              <UserIcon className="h-8 w-8 text-silver" />
            </div>
            <div>
              <div className="silver-text font-display text-2xl font-bold tracking-wide">@{data.username}</div>
              <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-silver/80">
                <Shield className="h-3.5 w-3.5" /> {role}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat icon={Calendar} label="Joined" value={data.createdAt ? new Date(data.createdAt).toLocaleDateString() : "—"} />
            <Stat icon={BookOpen} label="Manga" value={String(data.mangaCount)} />
            <Stat icon={Layers} label="Chapters" value={String(data.chapterCount)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return (
    <div className="metal-border rounded-lg bg-black/40 p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-silver/70">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 silver-text font-display text-2xl font-bold">{value}</div>
    </div>
  );
}
