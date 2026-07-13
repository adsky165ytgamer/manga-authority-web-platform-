import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signPaths } from "@/lib/storage";
import { ChevronLeft, ChevronRight, ArrowLeft, List, X, Search } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/manga/$id/chapter/$chapterId")({
  component: ReaderPage,
});

async function loadChapter(mangaId: string, chapterId: string) {
  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, chapter_number, chapter_title, manga_id")
    .eq("id", chapterId).maybeSingle();
  if (!chapter) return null;

  const { data: manga } = await supabase
    .from("manga").select("id, title").eq("id", mangaId).maybeSingle();

  const { data: pages } = await supabase
    .from("pages").select("id, image_url, page_order")
    .eq("chapter_id", chapterId).order("page_order", { ascending: true });

  const { data: siblings } = await supabase
    .from("chapters").select("id, chapter_number, chapter_title")
    .eq("manga_id", mangaId).order("chapter_number", { ascending: true });

  const pageUrls = pages && pages.length > 0 ? await signPaths(pages.map((p) => p.image_url)) : [];

  const idx = siblings?.findIndex((c) => c.id === chapterId) ?? -1;
  const prev = idx > 0 ? siblings![idx - 1] : null;
  const next = idx >= 0 && idx < (siblings?.length ?? 0) - 1 ? siblings![idx + 1] : null;

  return { chapter, manga, pageUrls, prev, next, siblings: siblings ?? [] };
}

function ReaderPage() {
  const { id, chapterId } = Route.useParams();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["reader", id, chapterId],
    queryFn: () => loadChapter(id, chapterId),
  });

  if (isLoading) return <div className="text-center text-muted-foreground py-16">Loading…</div>;
  if (!data) return <div className="text-center text-muted-foreground py-16">Chapter not found</div>;

  const { chapter, manga, pageUrls, prev, next, siblings } = data;

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to="/manga/$id" params={{ id }} className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-silver/70 hover:text-silver-bright transition">
          <ArrowLeft className="h-4 w-4" /> {manga?.title ?? "Back"}
        </Link>
        <button
          onClick={() => setSelectorOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-widest silver-text hover:bg-white/5 metal-border transition"
        >
          <List className="h-3.5 w-3.5" /> CH {chapter.chapter_number}
        </button>
      </div>

      <NavRow prev={prev} next={next} mangaId={id} onOpenSelector={() => setSelectorOpen(true)} />

      <div className="mt-4 space-y-1 sm:space-y-2 bg-black">
        {pageUrls.map((url, i) => (
          <img
            key={`${chapterId}-${i}`}
            src={url}
            alt={`Page ${i + 1}`}
            className="w-full mx-auto max-w-3xl block"
            loading={i < 2 ? "eager" : "lazy"}
            decoding={i < 2 ? "sync" : "async"}
            fetchPriority={i === 0 ? "high" : "auto"}
          />
        ))}
        {pageUrls.length === 0 && (
          <div className="metal-card p-10 text-center text-muted-foreground">No pages in this chapter.</div>
        )}
      </div>

      <div className="mt-6">
        <NavRow prev={prev} next={next} mangaId={id} onOpenSelector={() => setSelectorOpen(true)} />
      </div>

      {selectorOpen && (
        <ChapterSelector
          mangaId={id}
          current={chapterId}
          chapters={siblings}
          onClose={() => setSelectorOpen(false)}
        />
      )}
    </div>
  );
}

function NavRow({ prev, next, mangaId, onOpenSelector }: {
  prev: { id: string; chapter_number: number } | null;
  next: { id: string; chapter_number: number } | null;
  mangaId: string;
  onOpenSelector: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      {prev ? (
        <Link to="/manga/$id/chapter/$chapterId" params={{ id: mangaId, chapterId: prev.id }} className="btn-metal hover:btn-metal-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold tracking-widest uppercase">
          <ChevronLeft className="h-4 w-4" /> Prev
        </Link>
      ) : <span className="w-[80px]" />}
      <button
        onClick={onOpenSelector}
        className="btn-metal hover:btn-metal-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold tracking-widest uppercase"
      >
        <List className="h-4 w-4" /> Chapters
      </button>
      {next ? (
        <Link to="/manga/$id/chapter/$chapterId" params={{ id: mangaId, chapterId: next.id }} className="btn-metal hover:btn-metal-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold tracking-widest uppercase">
          Next <ChevronRight className="h-4 w-4" />
        </Link>
      ) : <span className="w-[80px]" />}
    </div>
  );
}

function ChapterSelector({ mangaId, current, chapters, onClose }: {
  mangaId: string;
  current: string;
  chapters: { id: string; chapter_number: number; chapter_title: string | null }[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return chapters;
    return chapters.filter((c) =>
      String(c.chapter_number).includes(s) ||
      (c.chapter_title?.toLowerCase().includes(s) ?? false)
    );
  }, [chapters, q]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/85 backdrop-blur-sm p-4 pt-16 animate-fade-in-slow" onClick={onClose}>
      <div className="metal-card w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border/70 flex items-center justify-between">
          <h3 className="silver-text font-display text-lg font-bold tracking-wider">CHAPTERS</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-silver-bright"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-3 border-b border-border/70 relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-silver/60" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full bg-black/60 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-silver-bright placeholder:text-muted-foreground focus:border-silver/50 focus:outline-none"
          />
        </div>
        <div className="overflow-y-auto p-2 space-y-1">
          {filtered.map((c) => {
            const active = c.id === current;
            return (
              <button
                key={c.id}
                onClick={() => { onClose(); navigate({ to: "/manga/$id/chapter/$chapterId", params: { id: mangaId, chapterId: c.id } }); }}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md transition ${active ? "bg-silver/10 border border-silver/30" : "hover:bg-white/5 border border-transparent"}`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded metal-border bg-black/60 silver-text font-display font-bold text-sm`}>
                  {c.chapter_number}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm ${active ? "text-silver-bright font-semibold" : "text-silver/90"}`}>
                    Chapter {c.chapter_number}{c.chapter_title ? ` · ${c.chapter_title}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8">No chapters match.</div>
          )}
        </div>
      </div>
    </div>
  );
}
