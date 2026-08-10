import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { emailToUsername } from "@/lib/username";
import { deleteMangaCompletely, transferMangaOwnership } from "@/lib/manga-admin";
import { deleteMyAccount } from "@/lib/account.functions";
import { Field, MetalStyles, Modal, PageTitle } from "@/components/metal";
import { Loader2, Trash2, ArrowLeftRight, BookOpen, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account Tools — The Manga Authority" },
      { name: "description", content: "Manage your member profile, your series, ownership transfers and account deletion." },
      { property: "og:title", content: "Account Tools — The Manga Authority" },
      { property: "og:description", content: "Manage your member profile, your series, ownership transfers and account deletion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountPage,
});

async function loadAccount(userId: string) {
  const { data: profile } = await supabase
    .from("profiles").select("id, username, bio, role_title, contribution").eq("id", userId).maybeSingle();
  const { data: manga } = await supabase
    .from("manga").select("id, title, status, created_at").eq("created_by", userId).order("created_at", { ascending: false });
  return { profile, manga: manga ?? [] };
}

function AccountPage() {
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  const qc = useQueryClient();
  const router = useRouter();
  const deleteAccount = useServerFn(deleteMyAccount);
  const deleteManga = useServerFn(deleteMangaCompletely);

  const { data, isLoading } = useQuery({ queryKey: ["account", user.id], queryFn: () => loadAccount(user.id) });
  const [bio, setBio] = useState<string | null>(null);
  const [contribution, setContribution] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [transfer, setTransfer] = useState<{ id: string; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isLoading || !data) return <div className="py-16 text-center text-muted-foreground">Loading…</div>;

  const profile = data.profile;
  const bioVal = bio ?? profile?.bio ?? "";
  const contribVal = contribution ?? profile?.contribution ?? "";

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { error } = await supabase.from("profiles").update({
        bio: bioVal.trim() || null,
        contribution: contribVal.trim() || null,
      }).eq("id", user.id);
      if (error) throw error;
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["account", user.id] });
      qc.invalidateQueries({ queryKey: ["members"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Update failed");
    } finally { setSavingProfile(false); }
  }

  async function removeManga(id: string, title: string) {
    if (!confirm(`Delete "${title}" and every chapter, page and file inside it? This cannot be undone.`)) return;
    try {
      await deleteManga({ data: { mangaId: id } });
      toast.success("Manga deleted");
      qc.invalidateQueries({ queryKey: ["account", user.id] });
      qc.invalidateQueries({ queryKey: ["manga-list"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
  }

  async function removeAccount() {
    setDeleting(true);
    try {
      await deleteAccount({ data: undefined } as any);
      await supabase.auth.signOut();
      toast.success("Account deleted");
      router.navigate({ to: "/auth", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not delete account");
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <PageTitle title="ACCOUNT TOOLS" subtitle={`Signed in as @${emailToUsername(user.email)}`} />

      <form onSubmit={saveProfile} className="metal-card p-5 sm:p-6 space-y-4">
        <h2 className="silver-text font-display text-lg font-bold tracking-wider">MEMBER PROFILE</h2>
        <Field label="Official role" hint="Assigned by Authority management; this is not user-editable">
          <div className="input-metal text-silver-bright">{profile?.role_title ?? "Member"}</div>
        </Field>
        <Field label="Biography">
          <textarea value={bioVal} onChange={(e) => setBio(e.target.value)} rows={4} className="input-metal resize-none" placeholder="Who you are inside the Authority…" />
        </Field>
        <Field label="Contribution">
          <textarea value={contribVal} onChange={(e) => setContribution(e.target.value)} rows={3} className="input-metal resize-none" placeholder="What you handle on the team…" />
        </Field>
        <button disabled={savingProfile} className="btn-metal hover:btn-metal-hover w-full rounded-lg py-3 text-sm font-bold tracking-[0.2em] disabled:opacity-60">
          {savingProfile ? "Saving…" : "SAVE PROFILE"}
        </button>
      </form>

      <div className="metal-card mt-6 p-5 sm:p-6">
        <h2 className="silver-text font-display text-lg font-bold tracking-wider">MY SERIES</h2>
        <div className="mt-4 space-y-2">
          {data.manga.length === 0 && <p className="text-sm text-muted-foreground">You don't own any series yet.</p>}
          {data.manga.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border/70 bg-black/40 px-3 py-2.5">
              <BookOpen className="h-4 w-4 shrink-0 text-silver/60" />
              <Link to="/manga/$id" params={{ id: m.id }} className="min-w-0 flex-1 truncate text-sm text-silver-bright hover:underline">
                {m.title}
              </Link>
              <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-silver/50">{m.status}</span>
              <button
                onClick={() => setTransfer({ id: m.id, title: m.title })}
                className="rounded-md p-2 text-silver/70 hover:text-silver-bright hover:bg-white/5"
                aria-label="Transfer ownership"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => removeManga(m.id, m.title)}
                className="rounded-md p-2 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                aria-label="Delete manga"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="metal-card mt-6 border-destructive/40 p-5 sm:p-6">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-bold tracking-wider text-destructive">
          <ShieldAlert className="h-5 w-5" /> DANGER ZONE
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Deleting your account permanently removes your profile, your series, their chapters and every uploaded file. This cannot be undone.
        </p>
        <button
          onClick={() => setConfirmDelete(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-destructive/60 px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 transition"
        >
          <Trash2 className="h-4 w-4" /> Delete my account
        </button>
      </div>

      {transfer && (
        <TransferModal
          manga={transfer}
          fromUser={user.id}
          onClose={() => setTransfer(null)}
          onDone={() => { setTransfer(null); qc.invalidateQueries({ queryKey: ["account", user.id] }); }}
        />
      )}

      {confirmDelete && (
        <Modal title="DELETE ACCOUNT" onClose={() => !deleting && setConfirmDelete(false)}>
          <p className="text-sm text-muted-foreground">
            This is permanent. Everything you own will be erased from the archive.
          </p>
          <div className="mt-5 flex gap-2">
            <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="btn-metal hover:btn-metal-hover flex-1 rounded-lg py-3 text-sm font-bold tracking-widest disabled:opacity-60">
              CANCEL
            </button>
            <button onClick={removeAccount} disabled={deleting} className="flex-1 rounded-lg border border-destructive/60 py-3 text-sm font-bold tracking-widest text-destructive hover:bg-destructive/10 disabled:opacity-60">
              {deleting ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> DELETING…</span> : "DELETE FOREVER"}
            </button>
          </div>
        </Modal>
      )}

      <MetalStyles />
    </div>
  );
}

function TransferModal({ manga, fromUser, onClose, onDone }: {
  manga: { id: string; title: string };
  fromUser: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const transferOwnership = useServerFn(transferMangaOwnership);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; username: string }[]>([]);
  const [target, setTarget] = useState<{ id: string; username: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(value: string) {
    setQ(value);
    setTarget(null);
    if (value.trim().length < 2) { setResults([]); return; }
    const { data } = await supabase.from("profiles").select("id, username").ilike("username", `%${value.trim()}%`).neq("id", fromUser).limit(6);
    setResults(data ?? []);
  }

  async function submit() {
    if (!target) { toast.error("Pick a member"); return; }
    setLoading(true);
    try {
      await transferOwnership({ data: { mangaId: manga.id, toUser: target.id } });
      toast.success(`Ownership transferred to @${target.username}`);
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Transfer failed");
    } finally { setLoading(false); }
  }

  return (
    <Modal title="TRANSFER OWNERSHIP" onClose={onClose}>
      <p className="mb-4 text-sm text-muted-foreground">Hand <span className="text-silver-bright">{manga.title}</span> to another member.</p>
      <Field label="Member">
        <input value={q} onChange={(e) => search(e.target.value)} className="input-metal" placeholder="Search username…" autoFocus />
      </Field>
      {results.length > 0 && !target && (
        <div className="mt-2 metal-card p-1 space-y-1">
          {results.map((r) => (
            <button key={r.id} onClick={() => { setTarget(r); setQ(r.username); setResults([]); }} className="w-full rounded px-3 py-1.5 text-left text-xs text-silver-bright hover:bg-white/5">
              @{r.username}
            </button>
          ))}
        </div>
      )}
      <button onClick={submit} disabled={loading || !target} className="btn-metal hover:btn-metal-hover mt-5 w-full rounded-lg py-3 text-sm font-bold tracking-[0.2em] disabled:opacity-50">
        {loading ? "Transferring…" : "TRANSFER"}
      </button>
    </Modal>
  );
}
