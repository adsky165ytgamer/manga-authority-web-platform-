import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signPaths, uploadFile } from "@/lib/storage";
import { Field, MetalStyles, Modal, PageTitle } from "@/components/metal";
import { Music2, Plus, Trash2, Search, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/music")({
  head: () => ({
    meta: [
      { title: "Music Archive — The Manga Authority" },
      { name: "description", content: "Original soundtracks and themes produced for our manga projects." },
      { property: "og:title", content: "Music Archive — The Manga Authority" },
      { property: "og:description", content: "Original soundtracks and themes produced for our manga projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MusicPage,
});

async function loadMusic() {
  const { data } = await supabase
    .from("music")
    .select("id, title, artist, description, audio_url, created_by, created_at, manga_id")
    .order("created_at", { ascending: false });
  const tracks = data ?? [];
  const urls = await signPaths(tracks.map((t) => t.audio_url));
  return tracks.map((t, i) => ({ ...t, url: urls[i] }));
}

function MusicPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["music"], queryFn: loadMusic });

  const tracks = (data ?? []).filter((t) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return t.title.toLowerCase().includes(s) || (t.artist?.toLowerCase().includes(s) ?? false);
  });

  async function remove(id: string, path: string) {
    if (!confirm("Delete this track?")) return;
    try {
      await supabase.storage.from("manga").remove([path]);
      const { error } = await supabase.from("music").delete().eq("id", id);
      if (error) throw error;
      toast.success("Track deleted");
      qc.invalidateQueries({ queryKey: ["music"] });
    } catch (err: any) { toast.error(err?.message ?? "Delete failed"); }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-end justify-between gap-3">
        <PageTitle title="MUSIC" subtitle="Original scores and themes — separate from narration." />
        <button onClick={() => setAddOpen(true)} className="btn-metal hover:btn-metal-hover mb-6 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-silver/60" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tracks…" className="input-metal pl-9" />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Loading…</div>
      ) : tracks.length === 0 ? (
        <div className="metal-card p-10 text-center text-muted-foreground">No tracks in the archive yet.</div>
      ) : (
        <div className="space-y-3">
          {tracks.map((t) => (
            <article key={t.id} className="metal-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded metal-border bg-black/60 text-silver">
                  <Music2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-silver-bright">{t.title}</h2>
                  {t.artist && <div className="truncate text-[11px] uppercase tracking-widest text-silver/60">{t.artist}</div>}
                </div>
                {t.created_by === user.id && (
                  <button onClick={() => remove(t.id, t.audio_url)} className="rounded-md p-2 text-destructive/80 hover:bg-destructive/10 hover:text-destructive" aria-label="Delete track">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {t.description && <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{t.description}</p>}
              <audio controls preload="none" src={t.url} className="mt-3 w-full" />
            </article>
          ))}
        </div>
      )}

      {addOpen && (
        <AddTrackModal userId={user.id} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); qc.invalidateQueries({ queryKey: ["music"] }); }} />
      )}
      <MetalStyles />
    </div>
  );
}

function AddTrackModal({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Title required"); return; }
    if (!file) { toast.error("Audio file required"); return; }
    setLoading(true);
    try {
      const ext = file.name.split(".").pop() ?? "mp3";
      const path = `${userId}/music/${Date.now()}.${ext}`;
      await uploadFile(path, file);
      const { error } = await supabase.from("music").insert({
        title: title.trim(),
        artist: artist.trim() || null,
        description: description.trim() || null,
        audio_url: path,
        created_by: userId,
      });
      if (error) throw error;
      toast.success("Track added");
      onDone();
    } catch (err: any) { toast.error(err?.message ?? "Upload failed"); }
    finally { setLoading(false); }
  }

  return (
    <Modal title="ADD TRACK" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="input-metal" required /></Field>
        <Field label="Artist"><input value={artist} onChange={(e) => setArtist(e.target.value)} className="input-metal" placeholder="Producer name" /></Field>
        <Field label="Notes"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-metal resize-none" /></Field>
        <Field label="Audio file" hint="MP3, WAV or M4A">
          <input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="input-metal" />
        </Field>
        <button disabled={loading} className="btn-metal hover:btn-metal-hover w-full rounded-lg py-3 text-sm font-bold tracking-[0.2em] disabled:opacity-60">
          {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</span> : "ADD TRACK"}
        </button>
      </form>
    </Modal>
  );
}
