export interface SignatureMatch {
  type: string;
  confidence: 'medium';
}

const signatures: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /node|npm|yarn/, type: 'nodejs' },
  { pattern: /python.*flask|flask/i, type: 'flask' },
  { pattern: /uvicorn|fastapi/i, type: 'fastapi' },
  { pattern: /gunicorn/i, type: 'gunicorn' },
  { pattern: /django|manage\.py/i, type: 'django' },
  { pattern: /nginx/i, type: 'nginx' },
  { pattern: /caddy/i, type: 'caddy' },
  { pattern: /ruby|rails|puma|unicorn/i, type: 'rails' },
  { pattern: /php-fpm|php/i, type: 'php' },
  { pattern: /java.*spring|mvn/i, type: 'spring' },
  { pattern: /go|air/i, type: 'go' }
];

export const detectProcessSignature = (cmdline: string): SignatureMatch | null => {
  for (const signature of signatures) {
    if (signature.pattern.test(cmdline)) {
      return {
        type: signature.type,
        confidence: 'medium'
      };
    }
  }

  return null;
};
