export type DiagnosticSeverity = "info" | "warn" | "error";

export interface ParserDiagnostic {
  severity: DiagnosticSeverity;
  pageSlug: string;
  section?: string;
  message: string;
  /** Raw HTML snippet for debugging (capped at 500 chars) */
  snippet?: string;
}

export function formatDiagnostic(d: ParserDiagnostic): string {
  const prefix = d.severity === "error" ? "❌" : d.severity === "warn" ? "⚠️" : "ℹ️";
  const location = d.section ? `${d.pageSlug} > ${d.section}` : d.pageSlug;
  return `${prefix} [${location}] ${d.message}`;
}

export function formatDiagnostics(ds: ParserDiagnostic[]): string {
  if (ds.length === 0) return "No diagnostics.";
  return ds.map(formatDiagnostic).join("\n");
}
