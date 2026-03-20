import { describe, expect, it } from 'vitest';
import { detectProcessSignature } from '../../electron/main/discovery/process-signatures';

describe('detectProcessSignature', () => {
  it('detects nodejs process', () => {
    const match = detectProcessSignature('/usr/bin/node server.js');
    expect(match?.type).toBe('nodejs');
    expect(match?.confidence).toBe('medium');
  });

  it('detects django process', () => {
    const match = detectProcessSignature('python manage.py runserver');
    expect(match?.type).toBe('django');
  });

  it('returns null for unknown process', () => {
    const match = detectProcessSignature('/usr/bin/custom-binary --serve');
    expect(match).toBeNull();
  });
});
