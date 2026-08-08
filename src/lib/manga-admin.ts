import { supabase } from "@/integrations/supabase/client";

// Deletes a manga together with its chapters, pages and stored files.
export async function deleteMangaCompletely(mangaId: string) {
  const { data: chapters } = await supabase.from("chapters").select("id, pdf_url, audio_url").eq("manga_id", mangaId);
  const chapterIds = (chapters ?? []).map((c) => c.id);

  const paths: string[] = [];
  for (const c of chapters ?? []) {
    if (c.pdf_url) paths.push(c.pdf_url);
    if (c.audio_url) paths.push(c.audio_url);
  }
  if (chapterIds.length) {
    const { data: pages } = await supabase.from("pages").select("image_url").in("chapter_id", chapterIds);
    for (const p of pages ?? []) if (p.image_url) paths.push(p.image_url);
  }
  const { data: manga } = await supabase.from("manga").select("cover_image").eq("id", mangaId).maybeSingle();
  if (manga?.cover_image) paths.push(manga.cover_image);

  if (paths.length) await supabase.storage.from("manga").remove(paths);

  if (chapterIds.length) await supabase.from("pages").delete().in("chapter_id", chapterIds);
  await supabase.from("chapters").delete().eq("manga_id", mangaId);
  const { error } = await supabase.from("manga").delete().eq("id", mangaId);
  if (error) throw error;
}

export async function transferMangaOwnership(mangaId: string, fromUser: string, toUser: string) {
  const { error } = await supabase.from("manga").update({ created_by: toUser }).eq("id", mangaId);
  if (error) throw error;
  await supabase.from("ownership_transfers").insert({ manga_id: mangaId, from_user: fromUser, to_user: toUser });
}
