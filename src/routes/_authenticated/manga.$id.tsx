import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signPath, uploadFile } from "@/lib/storage";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Plus, ChevronRight, Loader2, ImagePlus, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manga/$id")({
  component: MangaDetail,
});

async function loadManga(id: string) {
  const { data: manga, error } = await supabase
    .from("manga")
    .select("id, title, description, genre, cover_image, created_by, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!manga) return null;

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, chapter_number, chapter_title, created_at")
    .eq("manga_id", id)
    .order("chapter_number", { ascending: true });

  const { data: authorProfile } = await supabase
    .from("profiles").select("username").eq("id", manga.created_by).maybeSingle();

  const coverUrl = await signPath(manga.cover_image);
  return { manga, chapters: chapters ?? [], coverUrl, author: authorProfile?.username ?? "unknown" };
}

function MangaDetail() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["manga", id],
    queryFn: () => loadManga(id),
  });

  if (isLoading) return <div className="text-center text-muted-foreground py-16">Loading…</div>;
  if (!data) return <div className="text-center text-muted-foreground py-16">Manga not found</div>;

  const { manga, chapters, coverUrl, author } = data;
  const canEdit = manga.created_by === user.id;

  return (
    <div className="animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 mb-8">
        <div className="metal-card overflow-hidden aspect-[3/4] w-full max-w-[220px] mx-auto md:mx-0">
          {coverUrl ? (
            <img src={coverUrl} alt={manga.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-silver/40"><BookOpen className="h-12 w-12" /></div>
          )}
        </div>
        <div>
          <h1 className="silver-text font-display text-3xl sm:text-4xl font-bold tracking-wider">{manga.title}</h1>
          {manga.genre && <div className="mt-1 text-xs uppercase tracking-[0.25em] text-silver/70">{manga.genre}</div>}
          {manga.description && <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{manga.description}</p>}
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Info label="Author" value={`@${author}`} />
            <Info label="Status" value="Ongoing" />
            <Info label="Chapters" value={String(chapters.length)} />
            <Info label="Added" value={new Date(manga.created_at).toLocaleDateString()} />
          </dl>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="silver-text font-display text-xl font-bold tracking-widest">CHAPTERS</h2>
        {canEdit && (
          <button onClick={() => setAddOpen(true)} className="btn-metal hover:btn-metal-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold tracking-widest uppercase">
            <Plus className="h-4 w-4" /> Add Chapter
          </button>
        )}
      </div>

      <div className="space-y-2">
        {chapters.length === 0 && (
          <div className="metal-card p-6 text-center text-sm text-muted-foreground">No chapters yet.</div>
        )}
        {chapters.map((c) => (
          <Link
            key={c.id}
            to="/manga/$id/chapter/$chapterId"
            params={{ id: manga.id, chapterId: c.id }}
            className="metal-card group flex items-center gap-3 p-4 hover:border-silver/40 transition"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md metal-border bg-black/60 silver-text font-display font-bold">
              {c.chapter_number}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-silver-bright font-medium truncate">Chapter {c.chapter_number}{c.chapter_title ? ` · ${c.chapter_title}` : ""}</div>
              <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-silver/60 group-hover:text-silver-bright transition" />
          </Link>
        ))}
      </div>

      {addOpen && (
        <AddChapterModal
          mangaId={manga.id}
          userId={user.id}
          onClose={() => setAddOpen(false)}
          onDone={() => { qc.invalidateQueries({ queryKey: ["manga", id] }); qc.invalidateQueries({ queryKey: ["manga-list"] }); setAddOpen(false); }}
          nextNumber={(chapters[chapters.length - 1]?.chapter_number ?? 0) + 1}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.2em] text-silver/60">{label}</dt>
      <dd className="text-silver-bright text-sm mt-0.5">{value}</dd>
    </div>
  );
}

function AddChapterModal({ mangaId, userId, onClose, onDone, nextNumber }: {
  mangaId: string; userId: string; onClose: () => void; onDone: () => void; nextNumber: number;
}) {
  const [number, setNumber] = useState<string>(String(nextNumber));
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  function onFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...arr]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(number);
    if (!Number.isFinite(num) || num <= 0) { toast.error("Enter a valid chapter number"); return; }
    if (files.length === 0) { toast.error("Add at least one page"); return; }
    setLoading(true);
    try {
      const { data: chap, error } = await supabase.from("chapters").insert({
        manga_id: mangaId,
        chapter_number: num,
        chapter_title: title.trim() || null,
      }).select("id").single();
      if (error) throw error;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.name.split(".").pop() ?? "jpg";
        const path = `${userId}/manga/${mangaId}/chapters/${chap.id}/${String(i + 1).padStart(4, "0")}.${ext}`;
        await uploadFile(path, f);
        const { error: pageErr } = await supabase.from("pages").insert({
          chapter_id: chap.id,
          image_url: path,
          page_order: i + 1,
        });
        if (pageErr) throw pageErr;
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      toast.success("Chapter uploaded");
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in-slow">
      <div className="metal-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="silver-text font-display text-xl font-bold tracking-wider">ADD CHAPTER</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-silver-bright"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Number"><input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="decimal" className="input-metal" required /></Field>
            <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="input-metal" placeholder="Optional" /></Field>
          </div>
          <Field label={`Pages (${files.length})`}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-black/40 px-4 py-4 hover:border-silver/50 transition">
              <ImagePlus className="h-6 w-6 text-silver" />
              <div className="text-sm">
                <div className="text-silver-bright font-medium">Upload page images</div>
                <div className="text-xs text-muted-foreground">Select multiple — pages upload in order</div>
              </div>
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
            </label>
          </Field>
          {files.length > 0 && (
            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="relative aspect-[3/4] rounded overflow-hidden metal-border">
                  <img src={URL.createObjectURL(f)} className="h-full w-full object-cover" alt={`page ${i + 1}`} />
                  <span className="absolute bottom-0 right-0 bg-black/70 px-1 text-[10px] font-bold text-silver-bright">{i + 1}</span>
                </div>
              ))}
            </div>
          )}
          {loading && progress > 0 && (
            <div className="h-1.5 w-full rounded bg-neutral-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-silver to-silver-bright transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          <button type="submit" disabled={loading} className="btn-metal hover:btn-metal-hover w-full rounded-lg py-3 text-sm font-bold tracking-[0.2em] disabled:opacity-60">
            {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Uploading… {progress}%</span> : "UPLOAD CHAPTER"}
          </button>
        </form>
      </div>
      <style>{`
        .input-metal { width:100%; background:#0a0a0a; border:1px solid #2b2b2b; border-radius:.5rem; padding:.55rem .75rem; color:#E8E8E8; font-size:.9rem; outline:none; }
        .input-metal:focus { border-color:#6a6a6a; box-shadow:0 0 0 3px rgba(192,192,192,0.12); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-silver">{label}</span>
      {children}
    </label>
  );
}
