import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function movePath(path: string, fromUser: string, toUser: string) {
  const prefix = `${fromUser}/`;
  if (!path.startsWith(prefix)) {
    throw new Error(`Storage path is not owned by the current manga owner: ${path}`);
  }
  return `${toUser}/${path.slice(prefix.length)}`;
}

async function removeStoragePaths(paths: string[]) {
  if (!paths.length) return;
  const admin = await getAdmin();
  const { error } = await admin.storage.from("manga").remove([...new Set(paths)]);
  if (error) throw error;
}

async function deleteMangaInternal(mangaId: string, expectedOwner?: string) {
  const admin = await getAdmin();
  const { data: manga, error: mangaError } = await admin
    .from("manga")
    .select("id, created_by, cover_image")
    .eq("id", mangaId)
    .maybeSingle();
  if (mangaError) throw mangaError;
  if (!manga) return;
  if (expectedOwner && manga.created_by !== expectedOwner) {
    throw new Error("You no longer own this series.");
  }

  const { data: chapters, error: chaptersError } = await admin
    .from("chapters")
    .select("id, pdf_url, audio_url")
    .eq("manga_id", mangaId);
  if (chaptersError) throw chaptersError;

  const chapterIds = (chapters ?? []).map((c) => c.id);
  const paths: string[] = [];
  if (manga.cover_image) paths.push(manga.cover_image);
  for (const chapter of chapters ?? []) {
    if (chapter.pdf_url) paths.push(chapter.pdf_url);
    if (chapter.audio_url) paths.push(chapter.audio_url);
  }

  if (chapterIds.length) {
    const { data: pages, error: pagesError } = await admin
      .from("pages")
      .select("image_url")
      .in("chapter_id", chapterIds);
    if (pagesError) throw pagesError;
    for (const page of pages ?? []) if (page.image_url) paths.push(page.image_url);
  }

  // Storage is cleaned before the database rows are removed. If storage fails,
  // the database remains intact and the user can retry the operation.
  await removeStoragePaths(paths);

  const { error: deleteError } = await admin.from("manga").delete().eq("id", mangaId);
  if (deleteError) throw deleteError;
}

export const deleteMangaCompletely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ mangaId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const admin = await getAdmin();
    const { data: manga, error } = await admin
      .from("manga")
      .select("created_by")
      .eq("id", data.mangaId)
      .maybeSingle();
    if (error) throw error;
    if (!manga) throw new Error("Series not found.");

    const isOwner = manga.created_by === context.userId;
    const { data: canManageContent } = await (context.supabase as any).rpc("can_manage_content");
    if (!isOwner && !canManageContent) throw new Error("You are not allowed to delete this series.");

    await deleteMangaInternal(data.mangaId, isOwner ? context.userId : undefined);
    return { ok: true };
  });

export const transferMangaOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ mangaId: z.string().uuid(), toUser: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    if (context.userId === data.toUser) throw new Error("The target member is already the owner.");

    const admin = await getAdmin();
    const { data: manga, error: mangaError } = await admin
      .from("manga")
      .select("id, created_by, cover_image")
      .eq("id", data.mangaId)
      .maybeSingle();
    if (mangaError) throw mangaError;
    if (!manga) throw new Error("Series not found.");

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", data.toUser)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new Error("Target member not found.");

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (manga.created_by !== context.userId && !isAdmin) {
      throw new Error("Only the current owner or an admin can transfer this series.");
    }

    const fromUser = manga.created_by;
    const { data: chapters, error: chaptersError } = await admin
      .from("chapters")
      .select("id, pdf_url, audio_url")
      .eq("manga_id", data.mangaId);
    if (chaptersError) throw chaptersError;

    const { data: pages, error: pagesError } = await admin
      .from("pages")
      .select("id, image_url, chapter_id, chapters!inner(manga_id)")
      .eq("chapters.manga_id", data.mangaId);
    if (pagesError) throw pagesError;

    const paths = [
      ...(manga.cover_image ? [manga.cover_image] : []),
      ...(chapters ?? []).flatMap((c) => [c.pdf_url, c.audio_url].filter(Boolean) as string[]),
      ...(pages ?? []).map((p) => p.image_url),
    ];
    const moved: Array<{ from: string; to: string }> = [];

    try {
      for (const from of [...new Set(paths)]) {
        const to = movePath(from, fromUser, data.toUser);
        const { error } = await admin.storage.from("manga").move(from, to);
        if (error) throw error;
        moved.push({ from, to });
      }

      const adminClient = admin as any;
      const { error: transferError } = await adminClient.rpc("transfer_manga_ownership", {
        p_manga_id: data.mangaId,
        p_to_user: data.toUser,
        p_from_user: fromUser,
        p_actor_user: context.userId,
        p_old_prefix: `${fromUser}/`,
        p_new_prefix: `${data.toUser}/`,
      });
      if (transferError) throw transferError;
    } catch (error) {
      for (const item of moved.reverse()) {
        try { await admin.storage.from("manga").move(item.to, item.from); } catch { /* best-effort rollback */ }
      }
      throw error;
    }

    return { ok: true };
  });

export async function deleteMangaForAccount(mangaId: string, ownerId: string) {
  await deleteMangaInternal(mangaId, ownerId);
}
