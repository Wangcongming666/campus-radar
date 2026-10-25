import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Fixed parameters avoid letting malformed stored values trigger unbounded work.
// N=2^15, r=8, p=3 uses about 32 MiB per password derivation.
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const prefix = 'scrypt$32768$8$3$';
const pattern = /^scrypt\$32768\$8\$3\$([a-f0-9]{64})\$([a-f0-9]{128})$/;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const value = await derive(password, salt);
  return prefix + salt.toString('hex') + '$' + value.toString('hex');
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  const match = encoded?.match(pattern);
  // Unknown accounts still perform the same KDF and constant-time comparison.
  // This is a dummy comparison value, never an account or a usable password.
  const salt = match ? Buffer.from(match[1], 'hex') : Buffer.alloc(32);
  const expected = match ? Buffer.from(match[2], 'hex') : Buffer.alloc(64);
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected) && !!match;
}
