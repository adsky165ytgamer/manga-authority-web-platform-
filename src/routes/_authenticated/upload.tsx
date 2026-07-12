import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/lib/storage";
import { toast } from "sonner";
import { Loader2, ImagePlus } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
});

const schema = z.object({
  title: z.string().trim().min(1, "Title required").max(120),
  description: z.string().trim().max(1000).optional(),
  genre: z.string().trim().max(80).optional(),
});

function UploadPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function onCoverChange(f: File | null) {
    setCover(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ title, description, genre });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    try {
      let coverPath: string | null = null;
      if (cover) {
        const ext = cover.name.split(".").pop() ?? "jpg";
        coverPath = `${user.id}/covers/${Date.now()}.${ext}`;
        await uploadFile(coverPath, cover);
      }
      const { data, error } = await supabase.from("manga").insert({
        title: title.trim(),
        description: description.trim() || null,
        genre: genre.trim() || null,
        cover_image: coverPath,
        created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      toast.success("Manga created");
      router.navigate({ to: "/manga/$id", params: { id: data.id } });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create manga");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="silver-text font-display text-3xl sm:text-4xl font-bold tracking-wider">CREATE MANGA</h1>
        <p className="mt-1 text-sm text-muted-foreground">Add a new series to the archive.</p>
      </div>

      <form onSubmit={submit} className="metal-card p-6 sm:p-8 space-y-5 animate-fade-in">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className="input-metal" placeholder="Mortal King" />
        </Field>
        <Field label="Genre">
          <input value={genre} onChange={(e) => setGenre(e.target.value)} className="input-metal" placeholder="Fantasy · Action" />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="input-metal resize-none" placeholder="A short synopsis…" />
        </Field>
        <Field label="Cover Image">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-black/40 px-4 py-4 hover:border-silver/50 transition">
            {preview ? (
              <img src={preview} alt="cover preview" className="h-20 w-16 object-cover rounded" />
            ) : (
              <div className="flex h-20 w-16 items-center justify-center rounded bg-neutral-900 text-silver/60">
                <ImagePlus className="h-6 w-6" />
              </div>
            )}
            <div className="text-sm text-muted-foreground">
              <div className="text-silver-bright font-medium">{cover ? cover.name : "Choose cover image"}</div>
              <div className="text-xs">JPG, PNG or WEBP</div>
            </div>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onCoverChange(e.target.files?.[0] ?? null)} />
          </label>
        </Field>

        <button type="submit" disabled={loading} className="btn-metal hover:btn-metal-hover w-full rounded-lg py-3 text-sm font-bold tracking-[0.2em] disabled:opacity-60">
          {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating…</span> : "CREATE MANGA"}
        </button>
      </form>
      <style>{`
        .input-metal { width:100%; background:#0a0a0a; border:1px solid #2b2b2b; border-radius:.5rem; padding:.65rem .85rem; color:#E8E8E8; font-size:.9rem; outline:none; transition:border-color .2s, box-shadow .2s; }
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
