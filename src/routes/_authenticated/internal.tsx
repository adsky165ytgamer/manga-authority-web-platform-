import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Field, MetalStyles, Modal, PageTitle } from "@/components/metal";
import { ClipboardCheck, FlaskConical, Plus, Trash2, CheckCircle2, Circle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/internal")({
  head: () => ({
    meta: [
      { title: "Review & R&D — The Manga Authority" },
      { name: "description", content: "Internal review notes and the research & development board for upcoming projects." },
      { property: "og:title", content: "Review & R&D — The Manga Authority" },
      { property: "og:description", content: "Internal review notes and the research & development board." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InternalPage,
});

type Tab = "review" | "rnd";

async function loadBoard(userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const canReview = (roles ?? []).some((item) => ["admin", "leader", "manager", "sub_manager", "reviewer"].includes(item.role));
  if (!canReview) return { authorized: false, entries: [], manga: [] };

  const { data } = await supabase
    .from("reviews")
    .select("id, manga_id, chapter_id, issue, location, issue_type, description, status, created_by, created_at")
    .order("created_at", { ascending: false });
  const { data: manga } = await supabase.from("manga").select("id, title").order("title");
  return { authorized: true, entries: data ?? [], manga: manga ?? [] };
}

function InternalPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("review");
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["internal-board", user.id], queryFn: () => loadBoard(user.id) });

  if (data && !data.authorized) {
    return (
      <div className="animate-fade-in">
        <PageTitle title="REVIEW & R&D" subtitle="Internal quality control and the idea laboratory." />
        <div className="metal-card p-10 text-center text-sm text-muted-foreground">This section is restricted to authorized Authority staff.</div>
      </div>
    );
  }

  const entries = (data?.entries ?? []).filter((e) => (tab === "rnd" ? e.issue_type === "idea" : e.issue_type !== "idea"));
  const mangaTitles = new Map((data?.manga ?? []).map((m) => [m.id, m.title]));

  function refresh() { qc.invalidateQueries({ queryKey: ["internal-board"] }); }

  async function toggleStatus(id: string, status: string) {
    const next = status === "resolved" ? "open" : "resolved";
    const { error } = await supabase.from("reviews").update({ status: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    refresh();
  }

  return (
    <div className="animate-fade-in">
      <PageTitle title="REVIEW & R&D" subtitle="Internal quality control and the idea laboratory." />

      <div className="mb-5 flex gap-2">
        <TabButton active={tab === "review"} onClick={() => setTab("review")} icon={ClipboardCheck} label="Review" />
        <TabButton active={tab === "rnd"} onClick={() => setTab("rnd")} icon={FlaskConical} label="R&D" />
        <button onClick={() => setAddOpen(true)} className="btn-metal hover:btn-metal-hover ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest">
          <Plus className="h-4 w-4" /> New
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="metal-card p-10 text-center text-muted-foreground">
          {tab === "review" ? "No review notes yet." : "No research ideas logged yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <article key={e.id} className="metal-card p-4">
              <div className="flex items-start gap-3">
                <button onClick={() => toggleStatus(e.id, e.status)} className="mt-0.5 text-silver/70 hover:text-silver-bright" aria-label="Toggle status">
                  {e.status === "resolved" ? <CheckCircle2 className="h-4 w-4 text-silver-bright" /> : <Circle className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className={`text-sm font-semibold ${e.status === "resolved" ? "text-silver/50 line-through" : "text-silver-bright"}`}>{e.issue}</h2>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-widest text-silver/50">
                    <Link to="/manga/$id" params={{ id: e.manga_id }} className="hover:text-silver-bright">{mangaTitles.get(e.manga_id) ?? "series"}</Link>
                    {e.location && <span>· {e.location}</span>}
                    {e.issue_type && <span>· {e.issue_type}</span>}
                  </div>
                  {e.description && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{e.description}</p>}
                </div>
                {e.created_by === user.id && (
                  <button onClick={() => remove(e.id)} className="rounded-md p-2 text-destructive/80 hover:bg-destructive/10 hover:text-destructive" aria-label="Delete entry">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {addOpen && (
        <AddEntryModal
          userId={user.id}
          manga={data?.manga ?? []}
          defaultIdea={tab === "rnd"}
          onClose={() => setAddOpen(false)}
          onDone={() => { setAddOpen(false); refresh(); }}
        />
      )}
      <MetalStyles />
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-widest transition ${active ? "border-silver bg-silver/10 text-silver-bright" : "border-border text-silver/60 hover:border-silver/40"}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function AddEntryModal({ userId, manga, defaultIdea, onClose, onDone }: {
  userId: string;
  manga: { id: string; title: string }[];
  defaultIdea: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mangaId, setMangaId] = useState(manga[0]?.id ?? "");
  const [issue, setIssue] = useState("");
  const [location, setLocation] = useState("");
  const [issueType, setIssueType] = useState(defaultIdea ? "idea" : "art");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const types = defaultIdea ? ["idea"] : ["art", "text", "translation", "pacing", "continuity", "other"];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!mangaId) { toast.error("Create a series first"); return; }
    if (!issue.trim()) { toast.error("Title required"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.from("reviews").insert({
        manga_id: mangaId,
        issue: issue.trim(),
        location: location.trim() || null,
        issue_type: issueType,
        description: description.trim() || null,
        created_by: userId,
      });
      if (error) throw error;
      toast.success("Entry added");
      onDone();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <Modal title={defaultIdea ? "NEW R&D ENTRY" : "NEW REVIEW NOTE"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Series">
          <select value={mangaId} onChange={(e) => setMangaId(e.target.value)} className="input-metal">
            {manga.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </Field>
        <Field label="Title"><input value={issue} onChange={(e) => setIssue(e.target.value)} className="input-metal" required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location" hint="Chapter / page"><input value={location} onChange={(e) => setLocation(e.target.value)} className="input-metal" placeholder="Ch 4 · p12" /></Field>
          <Field label="Type">
            <select value={issueType} onChange={(e) => setIssueType(e.target.value)} className="input-metal">
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Details"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="input-metal resize-none" /></Field>
        <button disabled={loading} className="btn-metal hover:btn-metal-hover w-full rounded-lg py-3 text-sm font-bold tracking-[0.2em] disabled:opacity-60">
          {loading ? "Saving…" : "SAVE"}
        </button>
      </form>
    </Modal>
  );
}
