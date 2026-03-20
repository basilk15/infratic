import { describe, expect, it } from 'vitest';
import { parseSsOutput } from '../../electron/main/discovery/port-scanner';

describe('parseSsOutput', () => {
  it('parses modern ss output lines', () => {
    const output = `
Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
tcp   LISTEN 0      511    0.0.0.0:3000      0.0.0.0:*     users:(("node",pid=1234,fd=20))
`;

    const parsed = parseSsOutput(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      transport: 'tcp',
      bindAddress: '0.0.0.0',
      port: 3000,
      pid: 1234,
      processName: 'node'
    });
  });

  it('parses udp output lines', () => {
    const output = `
Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
udp   UNCONN 0      0      127.0.0.1:5353    0.0.0.0:*     users:(("python",pid=222,fd=3))
`;

    const parsed = parseSsOutput(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.transport).toBe('udp');
    expect(parsed[0]?.port).toBe(5353);
  });

  it('ignores malformed lines', () => {
    const parsed = parseSsOutput('bad line without pid');
    expect(parsed).toEqual([]);
  });
});
