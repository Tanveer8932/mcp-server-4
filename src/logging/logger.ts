export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const SENSITIVE_KEYS = new Set([
  "accessToken",
  "refreshToken",
  "clientSecret",
  "access_token",
  "refresh_token",
  "client_secret",
  "authorization",
  "token",
  "body",
  "content",
  "bcc",
]);

function redactFields(fields: LogFields): LogFields {
  const redacted: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEYS.has(key)) {
      if (typeof value === "string") {
        redacted[`${key}Length`] = value.length;
      } else if (Array.isArray(value)) {
        redacted[`${key}Count`] = value.length;
      } else {
        redacted[key] = "[REDACTED]";
      }
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}

export class Logger {
  constructor(private readonly level: LogLevel = "info") {}

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private write(level: LogLevel, message: string, fields: LogFields = {}): void {
    if (!this.shouldLog(level)) {
      return;
    }
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...redactFields(fields),
    };
    const output = JSON.stringify(entry);
    if (level === "error" || level === "warn") {
      console.error(output);
    } else {
      console.error(output);
    }
  }

  debug(message: string, fields?: LogFields): void {
    this.write("debug", message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.write("warn", message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.write("error", message, fields);
  }
}
