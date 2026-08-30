import type { EmailInput } from "../../types/index.js";

function needsEncodedWord(value: string): boolean {
  return /[^\x20-\x7E]/.test(value);
}

function encodeHeaderValue(value: string): string {
  if (!needsEncodedWord(value)) {
    return value;
  }
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

function formatAddressList(addresses: string[]): string {
  return addresses.join(", ");
}

export function buildMimeMessage(input: EmailInput): string {
  const lines: string[] = [];
  lines.push(`To: ${formatAddressList(input.to)}`);

  if (input.cc && input.cc.length > 0) {
    lines.push(`Cc: ${formatAddressList(input.cc)}`);
  }

  if (input.bcc && input.bcc.length > 0) {
    lines.push(`Bcc: ${formatAddressList(input.bcc)}`);
  }

  lines.push(`Subject: ${encodeHeaderValue(input.subject)}`);
  lines.push("MIME-Version: 1.0");

  const bodyType = input.bodyType ?? "text";
  if (bodyType === "html") {
    lines.push('Content-Type: text/html; charset="UTF-8"');
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
  }

  lines.push("");
  lines.push(input.body);

  return lines.join("\r\n");
}

export function toBase64Url(mime: string): string {
  return Buffer.from(mime, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function encodeEmailForGmail(input: EmailInput): string {
  return toBase64Url(buildMimeMessage(input));
}
