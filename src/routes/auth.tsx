import { createFileRoute, useRouter, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usernameToEmail } from "@/lib/username";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/home" });
  },
  component: AuthPage,
});

const schema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(32).regex(/^[a-zA-Z0-9_.-]+$/, "Only letters, numbers, . _ -"),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ username, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (mode === "register" && password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const email = usernameToEmail(username);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username.trim().toLowerCase() },
            emailRedirectTo: `${window.location.origin}/home`,
          },
        });
        if (error) throw error;
      }
      router.navigate({ to: "/home", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-2 flex items-center justify-center gap-3">
            <span className="h-px w-6 bg-silver/60" />
            <span className="silver-text font-display text-[10px] tracking-[0.4em]">THE</span>
            <span className="h-px w-6 bg-silver/60" />
          </div>
          <h1 className="silver-text font-display text-4xl font-extrabold tracking-widest">MANGA</h1>
          <div className="mt-1 silver-text font-display text-sm tracking-[0.35em]">AUTHORITY</div>
        </div>

        <div className="metal-card p-6 sm:p-8 animate-fade-in">
          <div className="mb-6 grid grid-cols-2 rounded-lg bg-black/60 p-1 metal-border">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md py-2 text-xs font-semibold tracking-widest uppercase transition ${
                  mode === m ? "bg-gradient-to-b from-white/15 to-white/5 text-silver-bright" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? "Login" : "Register"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Username">
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-metal"
                placeholder="tarun"
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-metal"
                placeholder="••••••••"
                required
              />
            </Field>
            {mode === "register" && (
              <Field label="Confirm Password">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="input-metal"
                  placeholder="••••••••"
                  required
                />
              </Field>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-metal hover:btn-metal-hover w-full rounded-lg py-3 text-sm font-bold tracking-[0.2em] disabled:opacity-60"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Please wait…</span>
              ) : mode === "login" ? "LOGIN" : "CREATE ACCOUNT"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Private access — for Manga Authority members only.
          </p>
        </div>
      </div>
      <style>{`
        .input-metal {
          width: 100%;
          background: #0a0a0a;
          border: 1px solid #2b2b2b;
          border-radius: 0.5rem;
          padding: 0.65rem 0.85rem;
          color: #E8E8E8;
          font-size: 0.9rem;
          outline: none;
          transition: border-color .2s, box-shadow .2s;
        }
        .input-metal:focus {
          border-color: #6a6a6a;
          box-shadow: 0 0 0 3px rgba(192,192,192,0.12);
        }
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
