import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signPaths } from "@/lib/storage";
import { BookOpen, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

type MangaCard = {
  id: string;
  title: string;
  description: string | null;
  genre: string | null;
  cover_image: string | null;
  chapter_count: number;
  coverUrl: string | null;
};

async function loadManga(): Promise<MangaCard[]> {
  const { data: mangas, error } = await supabase
    .from("manga")
    .select("id, title, description, genre, cover_image, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!mangas || mangas.length === 0) return [];

  const ids = mangas.map((m) => m.id);
  const { data: chapters } = await supabase
    .from("chapters")
    .select("manga_id")
    .in("manga_id", ids);
  const counts = new Map<string, number>();
  chapters?.forEach((c) => counts.set(c.manga_id, (counts.get(c.manga_id) ?? 0) + 1));

  const covers = mangas.map((m) => m.cover_image).filter(Boolean) as string[];
  const signed = await signPaths(covers);
  const coverMap = new Map<string, string>();
  covers.forEach((c, i) => coverMap.set(c, signed[i]));

  return mangas.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    genre: m.genre,
    cover_image: m.cover_image,
    chapter_count: counts.get(m.id) ?? 0,
    coverUrl: m.cover_image ? coverMap.get(m.cover_image) ?? null : null,
  }));
}

function HomePage() {
  const { data, isLoading } = useQuery({ queryKey: ["manga-list"], queryFn: loadManga });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="silver-text font-display text-3xl sm:text-4xl font-bold tracking-wider">LIBRARY</h1>
          <p className="mt-1 text-sm text-muted-foreground">The Manga Authority archive.</p>
        </div>
        <Link
          to="/upload"
          className="btn-metal hover:btn-metal-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold tracking-widest uppercase"
        >
          <Plus className="h-4 w-4" /> New
        </Link>
      </div>

      {isLoading && <div className="text-center text-muted-foreground py-16">Loading…</div>}

      {!isLoading && data && data.length === 0 && (
        <div className="metal-card p-10 text-center animate-fade-in">
          <BookOpen className="mx-auto h-10 w-10 text-silver mb-3" />
          <h2 className="silver-text font-display text-xl font-semibold">No manga yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Upload the first series to begin the archive.</p>
          <Link to="/upload" className="btn-metal hover:btn-metal-hover mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold tracking-widest uppercase">
            <Plus className="h-4 w-4" /> Upload Manga
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {data?.map((m) => (
          <Link
            key={m.id}
            to="/manga/$id"
            params={{ id: m.id }}
            className="metal-card group overflow-hidden transition hover:shadow-[0_0_28px_-8px_rgba(192,192,192,0.35)] hover:-translate-y-0.5 duration-300"
          >
            <div className="aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-neutral-900 to-black">
              {m.coverUrl ? (
                <img src={m.coverUrl} alt={m.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-silver/40">
                  <BookOpen className="h-12 w-12" />
                </div>
              )}
            </div>
            <div className="p-4">
              <h3 className="silver-text font-display text-lg font-bold tracking-wide truncate">{m.title}</h3>
              {m.genre && <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-silver/70">{m.genre}</p>}
              {m.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{m.description}</p>}
              <div className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-silver/60">
                {m.chapter_count} Chapter{m.chapter_count === 1 ? "" : "s"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
