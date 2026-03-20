import { describe, expect, it } from 'vitest';
import { buildLogExportFilename } from '../../electron/main/utils/log-export';

describe('buildLogExportFilename', () => {
  it('includes sanitized server, service, and timestamp', () => {
    const filename = buildLogExportFilename('Prod API', 'nginx.service', new Date(2026, 2, 19, 12, 34, 56));
    expect(filename).toBe('Prod_API_nginx_service_2026-03-19_12-34-56.log');
  });
});
