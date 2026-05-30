import { connect as netConnect } from 'node:net';

import type { AntivirusScanner, ScanResult } from './antivirus.scanner.js';
import type { StorageClient } from '../storage/storage.client.js';
import type { Socket } from 'node:net';
import type { Readable } from 'node:stream';

/** Injectable connect factory so the protocol is unit-testable without a live clamd. */
export type ClamAvConnect = (opts: { host: string; port: number }) => Socket;

const SCAN_TIMEOUT_MS = 30_000;

/**
 * Streams an object into clamd via the INSTREAM command and maps the reply to a verdict.
 * Fail-closed: any connection/parse problem yields `error` (the gate refuses `error`).
 * NOTE: unit-tested against a simulated clamd; verify against a real clamd before
 * flipping ANTIVIRUS_ENABLED=true (spec §9).
 */
export class ClamAvAntivirusScanner implements AntivirusScanner {
  constructor(
    private readonly storage: StorageClient,
    private readonly host: string,
    private readonly port: number,
    private readonly connect: ClamAvConnect = netConnect
  ) {}

  async scan(params: { key: string }): Promise<ScanResult> {
    let stream: Readable;
    try {
      stream = await this.storage.getObjectStream({ key: params.key });
    } catch (err) {
      return { verdict: 'error', detail: `fetch_failed: ${String(err)}` };
    }

    return new Promise<ScanResult>((resolve) => {
      const socket = this.connect({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      let settled = false;
      const finish = (result: ScanResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(SCAN_TIMEOUT_MS);
      socket.on('timeout', () => finish({ verdict: 'error', detail: 'scan_timeout' }));
      socket.on('error', (err: Error) => finish({ verdict: 'error', detail: err.message }));
      socket.on('data', (d: Buffer) => chunks.push(Buffer.from(d)));
      socket.on('end', () => finish(this.parseReply(Buffer.concat(chunks).toString('utf8'))));

      socket.on('connect', () => {
        void (async () => {
          try {
            socket.write(Buffer.from('zINSTREAM ', 'utf8'));
            for await (const chunk of stream) {
              const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
              const len = Buffer.alloc(4);
              len.writeUInt32BE(buf.length, 0);
              socket.write(len);
              socket.write(buf);
            }
            socket.write(Buffer.from([0, 0, 0, 0])); // zero-length terminator
          } catch (err) {
            finish({ verdict: 'error', detail: `stream_failed: ${String(err)}` });
          }
        })();
      });
    });
  }

  private parseReply(reply: string): ScanResult {
    const text = reply.replace(/ $/, '').trim();
    if (text.endsWith('FOUND')) {
      // Format: "stream: <signature> FOUND"
      const signature = text.replace(/^stream:\s*/, '').replace(/\s+FOUND$/, '');
      return { verdict: 'infected', detail: signature };
    }
    if (text.endsWith('OK')) {
      return { verdict: 'clean' };
    }
    return { verdict: 'error', detail: text || 'empty_reply' };
  }
}
