import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Permanently deletes the signed-in member's account and everything they own.
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Remove owned storage objects (covers, pages, audio) under the member's folder.
    async function purgeFolder(prefix: string) {
      const { data } = await supabaseAdmin.storage.from("manga").list(prefix, { limit: 1000 });
      if (!data) return;
      const files = data.filter((f) => f.id).map((f) => `${prefix}/${f.name}`);
      if (files.length) await supabaseAdmin.storage.from("manga").remove(files);
      for (const folder of data.filter((f) => !f.id)) {
        await purgeFolder(`${prefix}/${folder.name}`);
      }
    }
    await purgeFolder(userId);

    await supabaseAdmin.from("music").delete().eq("created_by", userId);
    await supabaseAdmin.from("reviews").delete().eq("created_by", userId);
    await supabaseAdmin.from("manga").delete().eq("created_by", userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
