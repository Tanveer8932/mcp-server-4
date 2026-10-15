export const TOOL_NAMES = [
  "gmail_create_draft",
  "gmail_send_email",
  "google_docs_append_content",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** Tools registered when ENABLED_TOOLS is unset. Sending email is opt-in. */
export const DEFAULT_ENABLED_TOOLS: readonly ToolName[] = [
  "gmail_create_draft",
  "google_docs_append_content",
];

export function parseEnabledTools(raw: string | undefined): ToolName[] {
  if (!raw || raw.trim() === "") {
    return [...DEFAULT_ENABLED_TOOLS];
  }

  const names = raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  const unknown = names.filter((name) => !(TOOL_NAMES as readonly string[]).includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `Invalid ENABLED_TOOLS: unknown tool(s) ${unknown.join(", ")}. Expected any of ${TOOL_NAMES.join(", ")}.`,
    );
  }
  if (names.length === 0) {
    throw new Error("Invalid ENABLED_TOOLS: at least one tool must be enabled.");
  }

  return [...new Set(names)] as ToolName[];
}
