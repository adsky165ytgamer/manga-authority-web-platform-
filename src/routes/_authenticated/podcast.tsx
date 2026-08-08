import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signPaths } from "@/lib/storage";
import { PageTitle } from "@/components/metal";
import { Headphones, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/podcast")({
  head: () => ({
    meta: [
      { title: "Podcast & Narration — The Manga Authority" },
      { name: "description", content: "Listen to narrated chapters and recorded episodes from The Manga Authority." },
      { property: "og:title", content: "Podcast & Narration — The Manga Authority" },
      { property: "og:description", content: "Listen to narrated chapters and recorded episodes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PodcastPage,
});

async function loadEpisodes() {
  const { data } = await supabase
    .from("chapters")
    .select("id, manga_id, chapter_number, chapter_title, audio_url, created_at")
    .not("audio_url", "is", null)
    .order("created_at", { ascending: false });
  const chapters = data ?? [];
  if (chapters.length === 0) return [];

  const { data: manga } = await supabase.from("manga").select("id, title");
  const titles = new Map((manga ?? []).map((m) => [m.id, m.title]));
  const urls = await signPaths(chapters.map((c) => c.audio_url as string));

  return chapters.map((c, i) => ({
    ...c,
    url: urls[i],
    mangaTitle: titles.get(c.manga_id) ?? "Unknown series",
  }));
}

function PodcastPage() {
  const { data, isLoading } = useQuery({ queryKey: ["podcast"], queryFn: loadEpisodes });

  return (
    <div className="animate-fade-in">
      <PageTitle title="PODCAST" subtitle="Narrated chapters and recorded episodes." />
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Loading…</div>
      ) : (data ?? []).length === 0 ? (
        <div className="metal-card p-10 text-center text-muted-foreground">
          No narration uploaded yet. Add audio to a chapter from its series page.
        </div>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((e) => (
            <article key={e.id} className="metal-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded metal-border bg-black/60 text-silver">
                  <Headphones className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-silver-bright">
                    {e.mangaTitle} · Chapter {e.chapter_number}
                  </h2>
                  {e.chapter_title && <div className="truncate text-[11px] text-silver/60">{e.chapter_title}</div>}
                </div>
                <Link
                  to="/manga/$id/chapter/$chapterId"
                  params={{ id: e.manga_id, chapterId: e.id }}
                  className="rounded-md p-2 text-silver/70 hover:bg-white/5 hover:text-silver-bright"
                  aria-label="Open chapter"
                >
                  <BookOpen className="h-4 w-4" />
                </Link>
              </div>
              <audio controls preload="none" src={e.url} className="mt-3 w-full" />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
