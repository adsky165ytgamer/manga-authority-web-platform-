import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signPaths } from "@/lib/storage";
import { BookOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

type MangaCard = {
  id: string;
  title: string;
  genre: string | null;
  status: string;
  cover_image: string | null;
  chapter_count: number;
  coverUrl: string | null;
};

async function loadManga(): Promise<MangaCard[]> {
  const { data: mangas, error } = await supabase
    .from("manga")
    .select("id, title, genre, status, cover_image, created_at")
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

  return mangas.map((m: any) => ({
    id: m.id,
    title: m.title,
    genre: m.genre,
    status: m.status ?? "ongoing",
    cover_image: m.cover_image,
    chapter_count: counts.get(m.id) ?? 0,
    coverUrl: m.cover_image ? coverMap.get(m.cover_image) ?? null : null,
  }));
}

function HomePage() {
  const { data, isLoading } = useQuery({ queryKey: ["manga-list"], queryFn: loadManga });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((m) =>
      m.title.toLowerCase().includes(s) ||
      (m.genre?.toLowerCase().includes(s) ?? false)
    );
  }, [data, q]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="silver-text font-display text-3xl sm:text-4xl font-bold tracking-wider">LIBRARY</h1>
        <p className="mt-1 text-sm text-muted-foreground">The Manga Authority archive.</p>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-silver/60" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or genre…"
          className="w-full bg-black/60 border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-silver-bright placeholder:text-muted-foreground focus:border-silver/50 focus:outline-none focus:ring-2 focus:ring-silver/10 transition"
        />
      </div>

      {isLoading && <div className="text-center text-muted-foreground py-16">Loading…</div>}

      {!isLoading && data && data.length === 0 && (
        <div className="metal-card p-10 text-center animate-fade-in">
          <BookOpen className="mx-auto h-10 w-10 text-silver mb-3" />
          <h2 className="silver-text font-display text-xl font-semibold">No manga yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">The archive is empty.</p>
        </div>
      )}

      {!isLoading && filtered.length === 0 && data && data.length > 0 && (
        <div className="text-center text-sm text-muted-foreground py-10">No matches for &ldquo;{q}&rdquo;.</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
        {filtered.map((m) => (
          <Link
            key={m.id}
            to="/manga/$id"
            params={{ id: m.id }}
            className="metal-card group overflow-hidden transition hover:shadow-[0_0_28px_-8px_rgba(192,192,192,0.35)] hover:-translate-y-0.5 duration-300"
          >
            <div className="aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-neutral-900 to-black relative">
              {m.coverUrl ? (
                <img src={m.coverUrl} alt={m.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-silver/40">
                  <BookOpen className="h-12 w-12" />
                </div>
              )}
              <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest text-silver-bright border border-silver/20">
                {m.status}
              </div>
            </div>
            <div className="p-3">
              <h3 className="silver-text font-display text-sm sm:text-base font-bold tracking-wide truncate">{m.title}</h3>
              {m.genre && <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-silver/70 truncate">{m.genre}</p>}
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-silver/50">
                {m.chapter_count} Ch
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
