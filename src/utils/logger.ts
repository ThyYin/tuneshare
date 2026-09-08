function format(level: string, args: unknown[]): unknown[] {
  return [`[${level}]`, ...args];
}

export const logger = {
  info: (...args: unknown[]) => console.log(...format('info', args)),
  warn: (...args: unknown[]) => console.warn(...format('warn', args)),
  error: (...args: unknown[]) => console.error(...format('error', args)),
};
