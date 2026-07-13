import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signPath, uploadFile } from "@/lib/storage";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Plus, ChevronRight, Loader2, ImagePlus, X, Search, Pencil, Trash2, MoreVertical, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manga/$id")({
  component: MangaDetail,
});

const STATUSES = ["ongoing", "completed", "hiatus", "cancelled"] as const;
type Status = typeof STATUSES[number];

async function loadManga(id: string) {
  const { data: manga, error } = await supabase
    .from("manga")
    .select("id, title, description, genre, status, cover_image, created_by, created_at")
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
  return { manga: manga as any, chapters: chapters ?? [], coverUrl, author: authorProfile?.username ?? "unknown" };
}

async function checkAdmin(userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}

function MangaDetail() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [chapterSearch, setChapterSearch] = useState("");
  const [editChapter, setEditChapter] = useState<{ id: string; chapter_number: number; chapter_title: string | null } | null>(null);
  const [replaceChapter, setReplaceChapter] = useState<{ id: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["manga", id],
    queryFn: () => loadManga(id),
  });
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user.id],
    queryFn: () => checkAdmin(user.id),
  });

  const filteredChapters = useMemo(() => {
    const chapters = data?.chapters ?? [];
    const s = chapterSearch.trim().toLowerCase();
    if (!s) return chapters;
    return chapters.filter((c) =>
      String(c.chapter_number).includes(s) ||
      (c.chapter_title?.toLowerCase().includes(s) ?? false)
    );
  }, [data, chapterSearch]);

  if (isLoading) return <div className="text-center text-muted-foreground py-16">Loading…</div>;
  if (!data) return <div className="text-center text-muted-foreground py-16">Manga not found</div>;

  const { manga, chapters, coverUrl, author } = data;
  const canEdit = manga.created_by === user.id || !!isAdmin;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["manga", id] });
    qc.invalidateQueries({ queryKey: ["manga-list"] });
  }

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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="silver-text font-display text-3xl sm:text-4xl font-bold tracking-wider break-words">{manga.title}</h1>
              {manga.genre && <div className="mt-1 text-xs uppercase tracking-[0.25em] text-silver/70">{manga.genre}</div>}
            </div>
            {canEdit && (
              <button
                onClick={() => setEditOpen(true)}
                className="btn-metal hover:btn-metal-hover inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold tracking-widest uppercase shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
          </div>
          {manga.description && <p className="mt-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{manga.description}</p>}
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <InfoRow label="Author" value={`@${author}`} />
            <InfoRow label="Status" value={(manga.status ?? "ongoing").toString()} />
            <InfoRow label="Chapters" value={String(chapters.length)} />
            <InfoRow label="Added" value={new Date(manga.created_at).toLocaleDateString()} />
          </dl>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="silver-text font-display text-xl font-bold tracking-widest">CHAPTERS</h2>
        {canEdit && (
          <button onClick={() => setAddOpen(true)} className="btn-metal hover:btn-metal-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold tracking-widest uppercase">
            <Plus className="h-4 w-4" /> Add
          </button>
        )}
      </div>

      {chapters.length > 0 && (
        <div className="mb-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-silver/60" />
          <input
            value={chapterSearch}
            onChange={(e) => setChapterSearch(e.target.value)}
            placeholder="Search chapters…"
            className="w-full bg-black/60 border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-silver-bright placeholder:text-muted-foreground focus:border-silver/50 focus:outline-none focus:ring-2 focus:ring-silver/10 transition"
          />
        </div>
      )}

      <div className="space-y-2">
        {chapters.length === 0 && (
          <div className="metal-card p-6 text-center text-sm text-muted-foreground">No chapters yet.</div>
        )}
        {filteredChapters.map((c) => (
          <div key={c.id} className="metal-card group flex items-center gap-1 p-2 sm:p-3 hover:border-silver/40 transition">
            <Link
              to="/manga/$id/chapter/$chapterId"
              params={{ id: manga.id, chapterId: c.id }}
              className="flex items-center gap-3 min-w-0 flex-1"
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
            {canEdit && (
              <ChapterMenu
                onRename={() => setEditChapter(c)}
                onReplace={() => setReplaceChapter({ id: c.id })}
                onDelete={async () => {
                  if (!confirm(`Delete Chapter ${c.chapter_number}? This removes all pages.`)) return;
                  try {
                    const { data: pgs } = await supabase.from("pages").select("image_url").eq("chapter_id", c.id);
                    const paths = (pgs ?? []).map((p) => p.image_url);
                    if (paths.length) await supabase.storage.from("manga").remove(paths);
                    const { error } = await supabase.from("chapters").delete().eq("id", c.id);
                    if (error) throw error;
                    toast.success("Chapter deleted");
                    refresh();
                  } catch (err: any) { toast.error(err?.message ?? "Delete failed"); }
                }}
              />
            )}
          </div>
        ))}
        {filteredChapters.length === 0 && chapters.length > 0 && (
          <div className="text-center text-sm text-muted-foreground py-6">No chapters match.</div>
        )}
      </div>

      {addOpen && (
        <AddChapterModal
          mangaId={manga.id}
          userId={user.id}
          onClose={() => setAddOpen(false)}
          onDone={() => { refresh(); setAddOpen(false); }}
          nextNumber={(chapters[chapters.length - 1]?.chapter_number ?? 0) + 1}
        />
      )}
      {editOpen && (
        <EditMangaModal
          manga={{
            id: manga.id,
            title: manga.title,
            description: manga.description,
            genre: manga.genre,
            status: (manga.status ?? "ongoing") as Status,
            created_by: manga.created_by,
          }}
          isAdmin={!!isAdmin}
          onClose={() => setEditOpen(false)}
          onDone={() => { refresh(); setEditOpen(false); }}
        />
      )}
      {editChapter && (
        <RenameChapterModal
          chapter={editChapter}
          onClose={() => setEditChapter(null)}
          onDone={() => { refresh(); setEditChapter(null); }}
        />
      )}
      {replaceChapter && (
        <ReplacePagesModal
          chapterId={replaceChapter.id}
          mangaId={manga.id}
          userId={user.id}
          onClose={() => setReplaceChapter(null)}
          onDone={() => { refresh(); setReplaceChapter(null); }}
        />
      )}

      <style>{`
        .input-metal { width:100%; background:#0a0a0a; border:1px solid #2b2b2b; border-radius:.5rem; padding:.55rem .75rem; color:#E8E8E8; font-size:.9rem; outline:none; }
        .input-metal:focus { border-color:#6a6a6a; box-shadow:0 0 0 3px rgba(192,192,192,0.12); }
      `}</style>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.2em] text-silver/60">{label}</dt>
      <dd className="text-silver-bright text-sm mt-0.5 capitalize">{value}</dd>
    </div>
  );
}

function ChapterMenu({ onRename, onReplace, onDelete }: { onRename: () => void; onReplace: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="p-2 rounded-md text-silver/70 hover:text-silver-bright hover:bg-white/5 transition"
        aria-label="Chapter actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] metal-card p-1 animate-fade-in">
            <MenuItem icon={Pencil} label="Rename" onClick={() => { setOpen(false); onRename(); }} />
            <MenuItem icon={RefreshCw} label="Replace pages" onClick={() => { setOpen(false); onReplace(); }} />
            <MenuItem icon={Trash2} label="Delete" danger onClick={() => { setOpen(false); onDelete(); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium hover:bg-white/5 transition ${danger ? "text-destructive" : "text-silver-bright"}`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function EditMangaModal({ manga, isAdmin, onClose, onDone }: {
  manga: { id: string; title: string; description: string | null; genre: string | null; status: Status; created_by: string };
  isAdmin: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(manga.title);
  const [description, setDescription] = useState(manga.description ?? "");
  const [genre, setGenre] = useState(manga.genre ?? "");
  const [status, setStatus] = useState<Status>(manga.status);
  const [ownerQuery, setOwnerQuery] = useState("");
  const [newOwnerId, setNewOwnerId] = useState<string | null>(null);
  const [ownerResults, setOwnerResults] = useState<{ id: string; username: string }[]>([]);
  const [loading, setLoading] = useState(false);

  async function searchOwners(q: string) {
    setOwnerQuery(q);
    if (q.trim().length < 2) { setOwnerResults([]); return; }
    const { data } = await supabase.from("profiles").select("id, username").ilike("username", `%${q.trim()}%`).limit(6);
    setOwnerResults(data ?? []);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Title required"); return; }
    setLoading(true);
    try {
      const update: any = {
        title: title.trim(),
        description: description.trim() || null,
        genre: genre.trim() || null,
        status,
      };
      if (newOwnerId && newOwnerId !== manga.created_by) update.created_by = newOwnerId;
      const { error } = await supabase.from("manga").update(update).eq("id", manga.id);
      if (error) throw error;
      toast.success("Manga updated");
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Update failed");
    } finally { setLoading(false); }
  }

  return (
    <Modal title="EDIT MANGA" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="input-metal" required /></Field>
        <Field label="Genre"><input value={genre} onChange={(e) => setGenre(e.target.value)} className="input-metal" /></Field>
        <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="input-metal resize-none" /></Field>
        <Field label="Status">
          <div className="grid grid-cols-4 gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-md px-2 py-2 text-[10px] uppercase tracking-widest font-bold border transition ${status === s ? "border-silver bg-silver/10 text-silver-bright" : "border-border text-silver/60 hover:border-silver/40"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
        {isAdmin && (
          <Field label="Transfer Ownership (optional)">
            <input value={ownerQuery} onChange={(e) => { searchOwners(e.target.value); setNewOwnerId(null); }} className="input-metal" placeholder="Search username…" />
            {ownerResults.length > 0 && !newOwnerId && (
              <div className="mt-2 metal-card p-1 space-y-1">
                {ownerResults.map((r) => (
                  <button key={r.id} type="button" onClick={() => { setNewOwnerId(r.id); setOwnerQuery(r.username); setOwnerResults([]); }} className="w-full text-left px-3 py-1.5 rounded text-xs text-silver-bright hover:bg-white/5">
                    @{r.username}
                  </button>
                ))}
              </div>
            )}
            {newOwnerId && <div className="mt-1 text-[11px] text-silver/70">New owner: @{ownerQuery}</div>}
          </Field>
        )}
        <button type="submit" disabled={loading} className="btn-metal hover:btn-metal-hover w-full rounded-lg py-3 text-sm font-bold tracking-[0.2em] disabled:opacity-60">
          {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving…</span> : "SAVE CHANGES"}
        </button>
      </form>
    </Modal>
  );
}

function RenameChapterModal({ chapter, onClose, onDone }: {
  chapter: { id: string; chapter_number: number; chapter_title: string | null };
  onClose: () => void; onDone: () => void;
}) {
  const [number, setNumber] = useState(String(chapter.chapter_number));
  const [title, setTitle] = useState(chapter.chapter_title ?? "");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(number);
    if (!Number.isFinite(num) || num <= 0) { toast.error("Valid chapter number required"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.from("chapters").update({
        chapter_number: num,
        chapter_title: title.trim() || null,
      }).eq("id", chapter.id);
      if (error) throw error;
      toast.success("Chapter updated");
      onDone();
    } catch (err: any) { toast.error(err?.message ?? "Update failed"); }
    finally { setLoading(false); }
  }

  return (
    <Modal title="EDIT CHAPTER" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Number"><input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="decimal" className="input-metal" required /></Field>
          <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="input-metal" placeholder="Optional" /></Field>
        </div>
        <button type="submit" disabled={loading} className="btn-metal hover:btn-metal-hover w-full rounded-lg py-3 text-sm font-bold tracking-[0.2em] disabled:opacity-60">
          {loading ? "Saving…" : "SAVE"}
        </button>
      </form>
    </Modal>
  );
}

function ReplacePagesModal({ chapterId, mangaId, userId, onClose, onDone }: {
  chapterId: string; mangaId: string; userId: string; onClose: () => void; onDone: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) { toast.error("Add at least one page"); return; }
    if (!confirm("This will delete all existing pages and replace them.")) return;
    setLoading(true);
    try {
      const { data: existing } = await supabase.from("pages").select("image_url").eq("chapter_id", chapterId);
      const oldPaths = (existing ?? []).map((p) => p.image_url);
      if (oldPaths.length) await supabase.storage.from("manga").remove(oldPaths);
      await supabase.from("pages").delete().eq("chapter_id", chapterId);

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.name.split(".").pop() ?? "jpg";
        const path = `${userId}/manga/${mangaId}/chapters/${chapterId}/${Date.now()}-${String(i + 1).padStart(4, "0")}.${ext}`;
        await uploadFile(path, f);
        const { error } = await supabase.from("pages").insert({ chapter_id: chapterId, image_url: path, page_order: i + 1 });
        if (error) throw error;
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      toast.success("Pages replaced");
      onDone();
    } catch (err: any) { toast.error(err?.message ?? "Replace failed"); }
    finally { setLoading(false); }
  }

  return (
    <Modal title="REPLACE PAGES" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={`New Pages (${files.length})`}>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-black/40 px-4 py-4 hover:border-silver/50 transition">
            <ImagePlus className="h-6 w-6 text-silver" />
            <div className="text-sm">
              <div className="text-silver-bright font-medium">Upload replacement pages</div>
              <div className="text-xs text-muted-foreground">All existing pages will be removed</div>
            </div>
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files).filter((f) => f.type.startsWith("image/")) : [])} />
          </label>
        </Field>
        {loading && progress > 0 && (
          <div className="h-1.5 w-full rounded bg-neutral-800 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-silver to-silver-bright transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        <button type="submit" disabled={loading} className="btn-metal hover:btn-metal-hover w-full rounded-lg py-3 text-sm font-bold tracking-[0.2em] disabled:opacity-60">
          {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {progress}%</span> : "REPLACE PAGES"}
        </button>
      </form>
    </Modal>
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
    } finally { setLoading(false); }
  }

  return (
    <Modal title="ADD CHAPTER" onClose={onClose}>
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
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in-slow" onClick={onClose}>
      <div className="metal-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="silver-text font-display text-xl font-bold tracking-wider">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-silver-bright"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
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
