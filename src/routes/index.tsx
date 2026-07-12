import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    // Splash then redirect handled client-side via component
  },
  component: Splash,
});

function Splash() {
  const [phase, setPhase] = useState<"in" | "shine" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("shine"), 500);
    const t2 = setTimeout(() => setPhase("out"), 1800);
    const t3 = setTimeout(async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        window.location.replace("/home");
      } else {
        window.location.replace("/auth");
      }
    }, 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <div className={`relative text-center transition-opacity duration-500 ${phase === "out" ? "opacity-0" : "opacity-100"}`}>
        <div className="mb-2 flex items-center justify-center gap-3">
          <span className="h-px w-8 bg-silver/60" />
          <span className="silver-text font-display text-xs tracking-[0.4em]">THE</span>
          <span className="h-px w-8 bg-silver/60" />
        </div>
        <h1 className="silver-text font-display text-5xl sm:text-7xl font-extrabold tracking-widest animate-fade-in">
          MANGA
        </h1>
        <div className="mt-2 silver-text font-display text-lg sm:text-2xl tracking-[0.4em] animate-fade-in-slow">
          AUTHORITY
        </div>
        {phase !== "in" && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="shine-overlay" />
          </div>
        )}
      </div>
    </div>
  );
}

// Prevent unused import warning
void redirect;
