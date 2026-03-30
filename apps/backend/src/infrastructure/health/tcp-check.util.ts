import net from 'node:net';

export async function checkTcpEndpoint(target: string, timeoutMs = 1000): Promise<boolean> {
  try {
    const url = new URL(target);
    const port = Number(url.port || defaultPort(url.protocol));
    if (!url.hostname || Number.isNaN(port)) {
      return false;
    }

    return await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      const done = (healthy: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(healthy);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, url.hostname);
    });
  } catch {
    return false;
  }
}

function defaultPort(protocol: string): number {
  switch (protocol) {
    case 'postgres:':
    case 'postgresql:':
      return 5432;
    case 'redis:':
      return 6379;
    case 'amqp:':
    case 'amqps:':
      return 5672;
    case 'http:':
      return 80;
    case 'https:':
      return 443;
    default:
      return Number.NaN;
  }
}
