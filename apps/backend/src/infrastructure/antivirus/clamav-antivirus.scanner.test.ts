import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { ClamAvAntivirusScanner } from './clamav-antivirus.scanner.js';

import type { StorageClient } from '../storage/storage.client.js';
import type { Socket } from 'node:net';

/** A fake duplex socket: records writes, lets the test push a canned clamd reply. */
class FakeSocket extends EventEmitter {
  writes: Buffer[] = [];
  ended = false;
  write(chunk: Buffer): boolean {
    this.writes.push(Buffer.from(chunk));
    return true;
  }
  end(): void {
    this.ended = true;
  }
  destroy(): void {
    this.ended = true;
  }
  setTimeout(): void {}
}

function makeStorage(bytes: string): StorageClient {
  return {
    getObjectStream: vi.fn(async () => Readable.from([Buffer.from(bytes)]))
  } as unknown as StorageClient;
}

/** Drives the scan: builds scanner with a fake socket, replies after writes flush. */
async function runScan(storageBytes: string, reply: string) {
  const socket = new FakeSocket();
  const storage = makeStorage(storageBytes);
  const scanner = new ClamAvAntivirusScanner(storage, 'clamav', 3310, () => {
    // Emit 'connect' then, after the scanner has written its stream, push the reply.
    queueMicrotask(() => socket.emit('connect'));
    setTimeout(() => {
      socket.emit('data', Buffer.from(reply));
      socket.emit('end');
    }, 5);
    return socket as unknown as Socket;
  });
  const result = await scanner.scan({ key: 'submissions/t1/x.pdf' });
  return { result, socket };
}

describe('ClamAvAntivirusScanner', () => {
  it('reports clean on "stream: OK"', async () => {
    const { result } = await runScan('hello', 'stream: OK ');
    expect(result).toEqual({ verdict: 'clean' });
  });

  it('reports infected with the signature name on "FOUND"', async () => {
    const { result } = await runScan('x', 'stream: Eicar-Test-Signature FOUND ');
    expect(result.verdict).toBe('infected');
    expect(result.detail).toBe('Eicar-Test-Signature');
  });

  it('sends the zINSTREAM command and a zero-length terminator', async () => {
    const { socket } = await runScan('ab', 'stream: OK ');
    const all = Buffer.concat(socket.writes);
    expect(all.includes('zINSTREAM ')).toBe(true);
    // Last 4 bytes are the big-endian zero terminator.
    expect(all.subarray(all.length - 4)).toEqual(Buffer.from([0, 0, 0, 0]));
  });

  it('reports error when the socket errors', async () => {
    const socket = new FakeSocket();
    const storage = makeStorage('x');
    const scanner = new ClamAvAntivirusScanner(storage, 'clamav', 3310, () => {
      queueMicrotask(() => socket.emit('connect'));
      setTimeout(() => socket.emit('error', new Error('ECONNREFUSED')), 5);
      return socket as unknown as Socket;
    });
    const result = await scanner.scan({ key: 'submissions/t1/x.pdf' });
    expect(result.verdict).toBe('error');
    expect(result.detail).toContain('ECONNREFUSED');
  });
});
