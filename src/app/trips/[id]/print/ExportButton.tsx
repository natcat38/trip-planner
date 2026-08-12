'use client';

export function ExportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838]"
    >
      Export PDF
    </button>
  );
}
