export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export const COMMAND_TIMEOUT_MS = 15_000;

export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number = COMMAND_TIMEOUT_MS,
  timeoutMessage: string = `Operation timed out after ${timeoutMs}ms`
): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};
