import { createFileRoute } from "@tanstack/react-router";
import { Crown, Shield, PenTool, FileSearch, Music } from "lucide-react";

export const Route = createFileRoute("/_authenticated/about")({
  component: AboutPage,
});

const founders = [
  { n: "01", role: "Leader & Author", name: "Tarun", Icon: Crown },
  { n: "02", role: "Manager", name: "Bharath", Icon: Shield },
  { n: "03", role: "Writer", name: "Hanvith", Icon: PenTool },
  { n: "04", role: "Reviewer", name: "Abhinay", Icon: FileSearch },
  { n: "05", role: "Music Producer", name: "Dhanush", Icon: Music },
];

function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8 text-center">
        <div className="mb-2 flex items-center justify-center gap-3">
          <span className="h-px w-8 bg-silver/60" />
          <span className="silver-text font-display text-[10px] tracking-[0.4em]">THE</span>
          <span className="h-px w-8 bg-silver/60" />
        </div>
        <h1 className="silver-text font-display text-4xl sm:text-6xl font-extrabold tracking-widest">MANGA</h1>
        <div className="mt-1 silver-text font-display text-lg sm:text-2xl tracking-[0.4em]">AUTHORITY</div>
      </div>

      <div className="metal-card px-4 py-3 mb-6 text-center">
        <div className="silver-text font-display text-lg font-bold tracking-[0.3em]">GROUP MEMBERS</div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-silver/70">Founders of Manga Authority</div>
      </div>

      <div className="space-y-3">
        {founders.map((f, i) => (
          <div
            key={f.n}
            className="metal-card p-4 sm:p-5 flex items-center gap-4 animate-fade-in"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg metal-border bg-black/60">
              <span className="silver-text font-display text-xl font-bold">{f.n}</span>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md metal-border bg-black/60">
              <f.Icon className="h-6 w-6 text-silver" />
            </div>
            <div className="min-w-0 flex-1 border-l border-border pl-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-silver/70">{f.role}</div>
              <div className="silver-text font-display text-2xl font-bold tracking-wider truncate">{f.name.toUpperCase()}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="metal-card mt-8 p-6 text-center">
        <div className="text-xs uppercase tracking-[0.25em] text-silver/70">These members are the</div>
        <div className="silver-text font-display text-2xl sm:text-3xl font-extrabold tracking-widest mt-1">★ OFFICIAL FOUNDERS ★</div>
        <div className="mt-1 text-xs uppercase tracking-[0.25em] text-silver/70">of Manga Authority</div>
      </div>

      <div className="mt-8 text-center text-[11px] uppercase tracking-[0.35em] text-silver/60">
        One team · One vision · One story
      </div>
    </div>
  );
}
