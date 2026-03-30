type LogLevel = "debug" | "info" | "warn" | "error";

interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isProduction = process.env.NODE_ENV === "production";
const minLevel =
  LEVELS[(process.env.LOG_LEVEL as LogLevel) ?? "info"] ?? LEVELS.info;

function formatDev(
  level: LogLevel,
  component: string,
  msg: string,
  data?: Record<string, unknown>,
): string {
  const ts = new Date().toISOString();
  const prefix = `${ts} [${level.toUpperCase().padEnd(5)}] [${component}]`;
  const base = `${prefix} ${msg}`;
  return data ? `${base} ${JSON.stringify(data)}` : base;
}

function formatProd(
  level: LogLevel,
  component: string,
  msg: string,
  data?: Record<string, unknown>,
): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component,
    msg,
    ...data,
  });
}

const format = isProduction ? formatProd : formatDev;

export function createLogger(component: string): Logger {
  function log(
    level: LogLevel,
    msg: string,
    data?: Record<string, unknown>,
  ): void {
    if (LEVELS[level] < minLevel) return;
    const line = format(level, component, msg, data);
    if (level === "warn" || level === "error") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
  };
}
