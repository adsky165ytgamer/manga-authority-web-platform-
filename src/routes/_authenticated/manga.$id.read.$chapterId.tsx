import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signPath } from "@/lib/storage";
import { ArrowLeft, ChevronLeft, ChevronRight, Minus, Plus, Headphones, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manga/$id/read/$chapterId")({
  component: ReadingMode,
});

async function loadReading(mangaId: string, chapterId: string) {
  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, chapter_number, chapter_title, text_content, audio_url, pdf_url")
    .eq("id", chapterId).maybeSingle();
  if (!chapter) return null;

  const { data: manga } = await supabase.from("manga").select("id, title").eq("id", mangaId).maybeSingle();
  const { data: siblings } = await supabase
    .from("chapters").select("id, chapter_number").eq("manga_id", mangaId).order("chapter_number", { ascending: true });

  const idx = siblings?.findIndex((c) => c.id === chapterId) ?? -1;
  const prev = idx > 0 ? siblings![idx - 1] : null;
  const next = idx >= 0 && idx < (siblings?.length ?? 0) - 1 ? siblings![idx + 1] : null;

  const audioUrl = await signPath(chapter.audio_url);
  const pdfUrl = await signPath(chapter.pdf_url);

  return { chapter, manga, prev, next, audioUrl, pdfUrl };
}

function ReadingMode() {
  const { id, chapterId } = Route.useParams();
  const [size, setSize] = useState(17);
  const { data, isLoading } = useQuery({
    queryKey: ["reading", id, chapterId],
    queryFn: () => loadReading(id, chapterId),
  });

  if (isLoading) return <div className="py-16 text-center text-muted-foreground">Loading…</div>;
  if (!data) return <div className="py-16 text-center text-muted-foreground">Chapter not found</div>;

  const { chapter, manga, prev, next, audioUrl, pdfUrl } = data;

  return (
    <div className="animate-fade-in mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to="/manga/$id" params={{ id }} className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-silver/70 hover:text-silver-bright">
          <ArrowLeft className="h-4 w-4" /> {manga?.title ?? "Back"}
        </Link>
        <div className="flex items-center gap-1">
          <button onClick={() => setSize((s) => Math.max(13, s - 1))} className="metal-border rounded-md p-2 text-silver/80 hover:text-silver-bright" aria-label="Smaller text"><Minus className="h-3.5 w-3.5" /></button>
          <span className="w-8 text-center text-xs text-silver/60">{size}</span>
          <button onClick={() => setSize((s) => Math.min(28, s + 1))} className="metal-border rounded-md p-2 text-silver/80 hover:text-silver-bright" aria-label="Larger text"><Plus className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <h1 className="silver-text font-display text-2xl font-bold tracking-wider">
        Chapter {chapter.chapter_number}{chapter.chapter_title ? ` · ${chapter.chapter_title}` : ""}
      </h1>

      {audioUrl && (
        <div className="metal-card mt-4 p-3">
          <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-silver/70">
            <Headphones className="h-3.5 w-3.5" /> Narration
          </div>
          <audio controls preload="none" src={audioUrl} className="w-full" />
        </div>
      )}

      {pdfUrl && (
        <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn-metal hover:btn-metal-hover mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-widest">
          <FileText className="h-4 w-4" /> Open original PDF
        </a>
      )}

      <div className="metal-card mt-5 p-5 sm:p-7">
        {chapter.text_content ? (
          <div
            className="whitespace-pre-wrap text-silver-bright/90"
            style={{ fontSize: `${size}px`, lineHeight: 1.85 }}
          >
            {chapter.text_content}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            No text version for this chapter yet. Add it from the chapter's content editor on the series page.
          </p>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        {prev ? (
          <Link to="/manga/$id/read/$chapterId" params={{ id, chapterId: prev.id }} className="btn-metal hover:btn-metal-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-widest">
            <ChevronLeft className="h-4 w-4" /> Prev
          </Link>
        ) : <span />}
        <Link to="/manga/$id/chapter/$chapterId" params={{ id, chapterId }} className="text-xs uppercase tracking-widest text-silver/70 hover:text-silver-bright">
          Page view
        </Link>
        {next ? (
          <Link to="/manga/$id/read/$chapterId" params={{ id, chapterId: next.id }} className="btn-metal hover:btn-metal-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-widest">
            Next <ChevronRight className="h-4 w-4" />
          </Link>
        ) : <span />}
      </div>
    </div>
  );
}
