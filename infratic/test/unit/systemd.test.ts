import { describe, expect, it } from 'vitest';
import { parseSystemctlList } from '../../electron/main/discovery/systemd';

describe('parseSystemctlList', () => {
  it('parses active and failed units', () => {
    const output = `
nginx.service loaded active running NGINX
auth.service loaded failed failed Auth
noise.target loaded active active Noise
`;

    const parsed = parseSystemctlList(output);
    expect(parsed).toEqual([
      { unit: 'nginx.service', activeState: 'active' },
      { unit: 'auth.service', activeState: 'failed' }
    ]);
  });
});
