import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/85 backdrop-blur-sm animate-fade-in-slow sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="metal-card flex h-[100dvh] w-full max-w-lg flex-col rounded-none sm:h-auto sm:max-h-[88vh] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#242424] px-4 py-3 sm:px-6 sm:py-4">
          <h3 className="silver-text min-w-0 truncate font-display text-base font-bold tracking-wider sm:text-lg">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-silver-bright">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          {children}
        </div>
        <MetalStyles />
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-silver">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="silver-text font-display text-3xl sm:text-4xl font-bold tracking-wider">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function MetalStyles() {
  return (
    <style>{`
      .input-metal { width:100%; background:#0a0a0a; border:1px solid #2b2b2b; border-radius:.5rem; padding:.6rem .8rem; color:#E8E8E8; font-size:.9rem; outline:none; transition:border-color .2s, box-shadow .2s; }
      .input-metal:focus { border-color:#6a6a6a; box-shadow:0 0 0 3px rgba(192,192,192,0.12); }
    `}</style>
  );
}
