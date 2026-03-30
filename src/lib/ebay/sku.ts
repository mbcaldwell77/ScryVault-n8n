type BookFormat = "HC" | "TPB" | "MMPB";

function inferBookFormat(title: string, subtitle: string | null, description: string | null): BookFormat {
  const text = `${title} ${subtitle || ""} ${description || ""}`.toLowerCase();
  if (text.includes("mass market")) return "MMPB";
  if (text.includes("paperback") || text.includes("trade paperback")) return "TPB";
  return "HC";
}

function slugTitleSnippet(title: string): string {
  const cleaned = title.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const fallback = cleaned.length > 0 ? cleaned : "BOOK";
  return fallback.slice(0, 8);
}

export function buildRoadmapSku(input: {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  format?: BookFormat;
  webEnabled?: boolean;
  isFirstEdition?: boolean;
  uniqueSuffix: string;
}): string {
  const parts: string[] = [];

  if (input.webEnabled) {
    parts.push("WEB");
  }

  parts.push(
    input.format ||
    inferBookFormat(input.title, input.subtitle || null, input.description || null),
  );

  if (input.isFirstEdition) {
    parts.push("1ST");
  }

  parts.push(slugTitleSnippet(input.title));
  parts.push(input.uniqueSuffix.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-6) || "XXXXXX");

  return parts.join("-").slice(0, 50);
}
