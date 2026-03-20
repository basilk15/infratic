export const log = (scope: string, ...args: unknown[]): void => {
  const timestamp = new Date().toISOString();
  // Phase 1 logger: keep console output simple and searchable
  console.log(`[${timestamp}] [${scope}]`, ...args);
};

export const logError = (scope: string, message: string, err: unknown): void => {
  if (err instanceof Error) {
    console.error(`[${new Date().toISOString()}] [${scope}] ${message}`, err.message, err.stack);
    return;
  }

  console.error(`[${new Date().toISOString()}] [${scope}] ${message}`, err);
};
