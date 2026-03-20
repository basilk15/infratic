const sanitizeNamePart = (value: string): string => value.trim().replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'unknown';

export const buildLogExportFilename = (serverName: string, serviceName: string, date: Date = new Date()): string => {
  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-') +
    '_' +
    [
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
      String(date.getSeconds()).padStart(2, '0')
    ].join('-');

  return `${sanitizeNamePart(serverName)}_${sanitizeNamePart(serviceName)}_${timestamp}.log`;
};
