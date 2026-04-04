export const iamCryptoPolicy = {
  password: {
    algorithm: 'scrypt',
    keyLength: 64,
    saltLength: 16,
    cost: 16384,
    blockSize: 8,
    parallelization: 1
  },
  refreshToken: {
    bytes: 64
  },
  accessToken: {
    algorithm: 'HS256',
    type: 'JWT'
  }
} as const;
