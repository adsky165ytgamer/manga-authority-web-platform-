import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/85 backdrop-blur-sm p-4 pt-12 overflow-y-auto animate-fade-in-slow" onClick={onClose}>
      <div className="metal-card w-full max-w-lg p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="silver-text font-display text-lg font-bold tracking-wider">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-silver-bright"><X className="h-5 w-5" /></button>
        </div>
        {children}
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
