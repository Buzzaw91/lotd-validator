import pino from "pino";

/**
 * Create a logger scoped to a named component.
 * Uses human-readable output by default; set LOG_LEVEL env var to control.
 */
export function createLogger(component: string) {
  return pino({
    name: component,
    level: process.env.LOG_LEVEL ?? "info",
    transport: {
      target: "pino/file",
      options: { destination: 1 }, // stdout
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
