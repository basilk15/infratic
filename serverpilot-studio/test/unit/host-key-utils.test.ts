import { describe, expect, it } from 'vitest';
import { canonicalHost, toSha256Fingerprint } from '../../electron/main/ssh/host-key-utils';

describe('host-key utils', () => {
  it('canonicalizes host and port', () => {
    expect(canonicalHost('localhost', 22)).toBe('localhost:22');
  });

  it('normalizes sha256 prefix for string fingerprint', () => {
    expect(toSha256Fingerprint('abc')).toBe('SHA256:abc');
    expect(toSha256Fingerprint('SHA256:def')).toBe('SHA256:def');
  });

  it('hashes buffer fingerprints into SHA256 format', () => {
    const fp = toSha256Fingerprint(Buffer.from('abc'));
    expect(fp.startsWith('SHA256:')).toBe(true);
  });
});
