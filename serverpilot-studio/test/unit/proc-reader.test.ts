import { describe, expect, it } from 'vitest';
import { calculateCpuPercent, parseStatusMetrics, parseTotalJiffies } from '../../electron/main/metrics/proc-reader';

describe('proc-reader parser helpers', () => {
  it('parses total jiffies from /proc/stat line', () => {
    const total = parseTotalJiffies('cpu  122 33 44 55 66 77 88 99 0 0');
    expect(total).toBe(584);
  });

  it('parses VmRSS/VmSize/VmSwap from /proc/<pid>/status', () => {
    const status = `
Name:\tnode
VmRSS:\t   1200 kB
VmSize:\t   5400 kB
VmSwap:\t    300 kB
`;

    const parsed = parseStatusMetrics(status);
    expect(parsed.vmRss).toBe(1200 * 1024);
    expect(parsed.vmSize).toBe(5400 * 1024);
    expect(parsed.vmSwap).toBe(300 * 1024);
  });

  it('computes cpu percentage', () => {
    const cpu = calculateCpuPercent(200, 1000, 4);
    expect(cpu).toBeCloseTo(80);
  });

  it('guards invalid delta values', () => {
    expect(calculateCpuPercent(-1, 100, 4)).toBe(0);
    expect(calculateCpuPercent(100, 0, 4)).toBe(0);
  });
});
