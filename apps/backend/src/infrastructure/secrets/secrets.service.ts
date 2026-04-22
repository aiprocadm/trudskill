import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { backendEnv } from '../../env.js';

export type ManagedSecretName = 'auth_jwt' | 'session_secret';

type SecretProviderKind = 'env' | 'vault' | 'kms';

export interface SecretVersionedValue {
  keyRef: string;
  value: string;
  version: string;
  provider: SecretProviderKind;
  loadedAt: string;
}

export type SecretRotationHook = (event: {
  secretName: ManagedSecretName;
  fromVersion: string;
  toVersion: string;
  provider: SecretProviderKind;
}) => void;

interface SecretProvider {
  readonly kind: SecretProviderKind;
  loadVersioned(keyRef: string, version: string): SecretVersionedValue;
}

class EnvSecretProvider implements SecretProvider {
  readonly kind = 'env' as const;

  loadVersioned(keyRef: string, version: string): SecretVersionedValue {
    const mappedEnv = keyRef === 'auth.jwt' ? 'AUTH_JWT_SECRET' : 'SESSION_SECRET';
    const envKey = version === 'latest' ? mappedEnv : `${mappedEnv}_V${version}`;
    const value =
      process.env[envKey] ??
      (envKey === 'AUTH_JWT_SECRET' ? backendEnv.AUTH_JWT_SECRET : backendEnv.SESSION_SECRET);
    if (!value) {
      throw new Error(`Secret ${envKey} is not configured`);
    }

    return {
      keyRef,
      value,
      version: version === 'latest' ? 'env' : version,
      provider: this.kind,
      loadedAt: new Date().toISOString()
    };
  }
}

class MirroredRemoteSecretProvider implements SecretProvider {
  constructor(
    readonly kind: 'vault' | 'kms',
    private readonly prefix: string
  ) {}

  loadVersioned(keyRef: string, version: string): SecretVersionedValue {
    const normalized = keyRef.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    if (version !== 'latest') {
      const exactKey = `${this.prefix}_${normalized}_V${version}`;
      const exact = process.env[exactKey];
      if (!exact) {
        throw new Error(`Secret ${exactKey} is not configured`);
      }
      return {
        keyRef,
        value: exact,
        version,
        provider: this.kind,
        loadedAt: new Date().toISOString()
      };
    }

    const matched = Object.entries(process.env)
      .map(([key, value]) => {
        const match = key.match(new RegExp(`^${this.prefix}_${normalized}_V(.+)$`));
        if (!match || !value) {
          return null;
        }
        return { key, version: match[1], value };
      })
      .filter((entry): entry is { key: string; version: string; value: string } => Boolean(entry))
      .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

    const latest = matched[0];
    if (!latest) {
      throw new Error(`No ${this.kind} secret versions configured for ${keyRef}`);
    }

    return {
      keyRef,
      value: latest.value,
      version: latest.version,
      provider: this.kind,
      loadedAt: new Date().toISOString()
    };
  }
}

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly provider: SecretProvider;
  private readonly cache = new Map<ManagedSecretName, SecretVersionedValue>();
  private readonly hooks = new Set<SecretRotationHook>();

  constructor() {
    this.provider = this.resolveProvider(backendEnv.SECRETS_PROVIDER);
  }

  getJwtSigningSecret(): string {
    return this.getSecret('auth_jwt').value;
  }

  getSessionSecret(): string {
    return this.getSecret('session_secret').value;
  }

  getSecret(secretName: ManagedSecretName): SecretVersionedValue {
    const keyRef =
      secretName === 'auth_jwt'
        ? (backendEnv.AUTH_JWT_SECRET_KEY_REF ?? 'auth.jwt')
        : (backendEnv.SESSION_SECRET_KEY_REF ?? 'session.cookie');
    const version =
      secretName === 'auth_jwt'
        ? (backendEnv.AUTH_JWT_SECRET_VERSION ?? 'latest')
        : (backendEnv.SESSION_SECRET_VERSION ?? 'latest');

    const loaded = this.provider.loadVersioned(keyRef, version);
    const previous = this.cache.get(secretName);

    if (previous && previous.version !== loaded.version) {
      this.emitRotation(secretName, previous, loaded);
    }

    this.cache.set(secretName, loaded);
    return loaded;
  }

  registerRotationHook(hook: SecretRotationHook): () => void {
    this.hooks.add(hook);
    return () => {
      this.hooks.delete(hook);
    };
  }

  getRotationPolicy() {
    return {
      provider: this.provider.kind,
      maxAgeDays: backendEnv.SECRET_ROTATION_MAX_AGE_DAYS,
      keyRefs: {
        authJwt: backendEnv.AUTH_JWT_SECRET_KEY_REF,
        session: backendEnv.SESSION_SECRET_KEY_REF
      }
    };
  }

  private emitRotation(
    secretName: ManagedSecretName,
    previous: SecretVersionedValue,
    current: SecretVersionedValue
  ) {
    this.logger.warn(
      `Secret rotation detected for ${secretName}: ${previous.version} -> ${current.version}`
    );

    for (const hook of this.hooks) {
      hook({
        secretName,
        fromVersion: previous.version,
        toVersion: current.version,
        provider: current.provider
      });
    }
  }

  private resolveProvider(provider: SecretProviderKind): SecretProvider {
    if (provider === 'vault') {
      return new MirroredRemoteSecretProvider('vault', 'VAULT_SECRET');
    }
    if (provider === 'kms') {
      return new MirroredRemoteSecretProvider('kms', 'KMS_SECRET');
    }
    return new EnvSecretProvider();
  }

  static fingerprint(secret: string): string {
    return createHash('sha256').update(secret).digest('hex').slice(0, 12);
  }
}
