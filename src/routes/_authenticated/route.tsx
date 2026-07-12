import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { emailToUsername } from "@/lib/username";
import { Menu, X, Home, Upload, User, Info, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const username = emailToUsername(user.email);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const nav = [
    { to: "/home", label: "Home", icon: Home },
    { to: "/upload", label: "Upload Manga", icon: Upload },
    { to: "/profile", label: "Profile", icon: User },
    { to: "/about", label: "About", icon: Info },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-black/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/home" className="flex items-center gap-2">
            <span className="silver-text font-display text-lg font-bold tracking-widest">
              MANGA <span className="text-silver">/</span> AUTHORITY
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-silver-bright hover:bg-white/5 transition"
                activeProps={{ className: "text-silver-bright bg-white/5" }}
              >
                {n.label}
              </Link>
            ))}
            <button
              onClick={signOut}
              className="ml-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-destructive transition inline-flex items-center gap-1.5"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </nav>
          <button
            className="md:hidden metal-border rounded-md p-2"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <div className="md:hidden border-t border-border/70 bg-black/95 animate-fade-in">
            <nav className="mx-auto flex max-w-6xl flex-col px-4 py-2">
              {nav.map((n) => {
                const Icon = n.icon;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-muted-foreground hover:text-silver-bright hover:bg-white/5"
                    activeProps={{ className: "text-silver-bright bg-white/5" }}
                  >
                    <Icon className="h-4 w-4" /> {n.label}
                  </Link>
                );
              })}
              <div className="mt-2 border-t border-border/60 pt-2 pb-3 flex items-center justify-between">
                <span className="px-3 text-xs text-muted-foreground">@{username}</span>
                <button
                  onClick={signOut}
                  className="mr-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-destructive inline-flex items-center gap-1.5"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 animate-fade-in">
        <Outlet />
      </main>
      <footer className="mt-16 border-t border-border/70">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-muted-foreground">
          ONE TEAM · ONE VISION · ONE STORY
        </div>
      </footer>
    </div>
  );
}
