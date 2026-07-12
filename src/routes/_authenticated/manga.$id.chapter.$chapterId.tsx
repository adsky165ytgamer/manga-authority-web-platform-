import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signPaths } from "@/lib/storage";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";

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
    .from("chapters").select("id, chapter_number")
    .eq("manga_id", mangaId).order("chapter_number", { ascending: true });

  const pageUrls = pages && pages.length > 0 ? await signPaths(pages.map((p) => p.image_url)) : [];

  const idx = siblings?.findIndex((c) => c.id === chapterId) ?? -1;
  const prev = idx > 0 ? siblings![idx - 1] : null;
  const next = idx >= 0 && idx < (siblings?.length ?? 0) - 1 ? siblings![idx + 1] : null;

  return { chapter, manga, pageUrls, prev, next };
}

function ReaderPage() {
  const { id, chapterId } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["reader", id, chapterId],
    queryFn: () => loadChapter(id, chapterId),
  });

  if (isLoading) return <div className="text-center text-muted-foreground py-16">Loading…</div>;
  if (!data) return <div className="text-center text-muted-foreground py-16">Chapter not found</div>;

  const { chapter, manga, pageUrls, prev, next } = data;

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to="/manga/$id" params={{ id }} className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-silver/70 hover:text-silver-bright">
          <ArrowLeft className="h-4 w-4" /> {manga?.title ?? "Back"}
        </Link>
        <div className="silver-text font-display text-sm font-bold tracking-widest">CH {chapter.chapter_number}</div>
      </div>

      <NavRow prev={prev} next={next} mangaId={id} label="top" />

      <div className="mt-4 space-y-1 sm:space-y-2 bg-black">
        {pageUrls.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`Page ${i + 1}`}
            className="w-full mx-auto max-w-3xl block"
            loading={i < 3 ? "eager" : "lazy"}
          />
        ))}
        {pageUrls.length === 0 && (
          <div className="metal-card p-10 text-center text-muted-foreground">No pages in this chapter.</div>
        )}
      </div>

      <div className="mt-6">
        <NavRow prev={prev} next={next} mangaId={id} label="bottom" />
      </div>
    </div>
  );
}

function NavRow({ prev, next, mangaId }: {
  prev: { id: string; chapter_number: number } | null;
  next: { id: string; chapter_number: number } | null;
  mangaId: string; label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      {prev ? (
        <Link to="/manga/$id/chapter/$chapterId" params={{ id: mangaId, chapterId: prev.id }} className="btn-metal hover:btn-metal-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold tracking-widest uppercase">
          <ChevronLeft className="h-4 w-4" /> Prev · {prev.chapter_number}
        </Link>
      ) : <span />}
      {next ? (
        <Link to="/manga/$id/chapter/$chapterId" params={{ id: mangaId, chapterId: next.id }} className="btn-metal hover:btn-metal-hover ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold tracking-widest uppercase">
          Next · {next.chapter_number} <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}
