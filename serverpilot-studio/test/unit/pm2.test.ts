import { describe, expect, it } from 'vitest';
import { parsePm2Jlist } from '../../electron/main/discovery/pm2';

describe('parsePm2Jlist', () => {
  it('parses valid pm2 json', () => {
    const output = JSON.stringify([
      {
        name: 'api',
        pid: 211,
        pm2_env: {
          status: 'online',
          pm_out_log_path: '/tmp/out.log',
          pm_err_log_path: '/tmp/err.log'
        }
      }
    ]);

    const parsed = parsePm2Jlist(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      name: 'api',
      pid: 211,
      status: 'running'
    });
  });

  it('returns empty list for invalid json', () => {
    const parsed = parsePm2Jlist('not-json');
    expect(parsed).toEqual([]);
  });
});
