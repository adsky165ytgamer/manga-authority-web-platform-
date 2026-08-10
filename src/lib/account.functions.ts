import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deleteMangaForAccount } from "@/lib/manga-admin";

async function purgeFolder(prefix: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bucket = supabaseAdmin.storage.from("manga");

  async function walk(path: string): Promise<void> {
    let offset = 0;
    while (true) {
      const { data, error } = await bucket.list(path, { limit: 1000, offset });
      if (error) throw error;
      if (!data?.length) break;

      const files = data.filter((item) => item.id).map((item) => path ? `${path}/${item.name}` : item.name);
      if (files.length) {
        const { error: removeError } = await bucket.remove(files);
        if (removeError) throw removeError;
      }

      const folders = data.filter((item) => !item.id).map((item) => path ? `${path}/${item.name}` : item.name);
      for (const folder of folders) await walk(folder);
      if (data.length < 1000) break;
      offset += data.length;
    }
  }

  await walk(prefix);
}

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Delete all currently owned series through the same storage-aware path used by the UI.
    const { data: manga, error: mangaError } = await supabaseAdmin
      .from("manga")
      .select("id")
      .eq("created_by", userId);
    if (mangaError) throw mangaError;
    for (const item of manga ?? []) await deleteMangaForAccount(item.id, userId);

    // Music has its own ownership lifecycle, so remove its storage objects first.
    const { data: music, error: musicQueryError } = await supabaseAdmin
      .from("music")
      .select("audio_url")
      .eq("created_by", userId);
    if (musicQueryError) throw musicQueryError;
    const musicPaths = (music ?? []).map((item) => item.audio_url).filter(Boolean);
    if (musicPaths.length) {
      const { error } = await supabaseAdmin.storage.from("manga").remove(musicPaths);
      if (error) throw error;
    }
    const { error: musicDeleteError } = await supabaseAdmin.from("music").delete().eq("created_by", userId);
    if (musicDeleteError) throw musicDeleteError;

    const { error: reviewError } = await supabaseAdmin.from("reviews").delete().eq("created_by", userId);
    if (reviewError) throw reviewError;
    const { error: roleError } = await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    if (roleError) throw roleError;
    const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("id", userId);
    if (profileError) throw profileError;

    // Catch old/legacy files that are still under this member's original storage prefix.
    await purgeFolder(userId);

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) throw new Error(authError.message);
    return { ok: true };
  });
