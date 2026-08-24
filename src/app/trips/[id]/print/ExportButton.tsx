'use client';

export function ExportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      // Hardcoded, not `bg-accent text-accent-fg`: the print page (ADR-0007)
      // is forced light regardless of the viewer's theme, but `dark:` variants
      // still apply — a dark-theme user got near-black-on-near-black (~1.17:1).
      className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
    >
      Export PDF
    </button>
  );
}
