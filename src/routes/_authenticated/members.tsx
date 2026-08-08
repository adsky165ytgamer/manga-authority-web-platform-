import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle } from "@/components/metal";
import { Crown, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/members")({
  head: () => ({
    meta: [
      { title: "Members — The Manga Authority" },
      { name: "description", content: "The people behind The Manga Authority: leaders, managers, writers, reviewers and music producers." },
      { property: "og:title", content: "Members — The Manga Authority" },
      { property: "og:description", content: "The people behind The Manga Authority." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MembersPage,
});

async function loadMembers() {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, bio, role_title, contribution, created_at")
    .order("created_at", { ascending: true });
  return profiles ?? [];
}

function MembersPage() {
  const { data, isLoading } = useQuery({ queryKey: ["members"], queryFn: loadMembers });

  if (isLoading) return <div className="py-16 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="animate-fade-in">
      <PageTitle title="MEMBERS" subtitle="Every member of the Authority and what they hold." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(data ?? []).map((m, i) => (
          <article key={m.id} className="metal-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full metal-border bg-black/60 text-silver">
                {i === 0 ? <Crown className="h-5 w-5" /> : <User className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <h2 className="truncate silver-text font-display text-lg font-bold tracking-wider">@{m.username}</h2>
                <div className="text-[10px] uppercase tracking-[0.25em] text-silver/60">{m.role_title ?? "Member"}</div>
              </div>
            </div>
            {m.bio && <p className="mt-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{m.bio}</p>}
            {m.contribution && (
              <p className="mt-3 border-t border-border/60 pt-3 text-xs text-silver/70 whitespace-pre-wrap">
                <span className="text-[10px] uppercase tracking-[0.2em] text-silver/50">Contribution · </span>
                {m.contribution}
              </p>
            )}
          </article>
        ))}
        {(data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No members yet.</p>}
      </div>
    </div>
  );
}
