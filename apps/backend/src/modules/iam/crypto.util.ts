import { createHash, randomUUID } from 'node:crypto';

export const hashPassword = (password: string): string =>
  createHash('sha256').update(`pwd:${password}`).digest('hex');

export const verifyPassword = (plain: string, hash: string): boolean => hashPassword(plain) === hash;

export const issueToken = (): string => randomUUID();

export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(`refresh:${token}`).digest('hex');
