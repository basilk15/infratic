import { createHash } from 'node:crypto';

export const canonicalHost = (host: string, port: number): string => `${host}:${port}`;

export const toSha256Fingerprint = (input: Buffer | string): string => {
  if (Buffer.isBuffer(input)) {
    const digest = createHash('sha256').update(input).digest('base64');
    return `SHA256:${digest}`;
  }

  return input.startsWith('SHA256:') ? input : `SHA256:${input}`;
};
