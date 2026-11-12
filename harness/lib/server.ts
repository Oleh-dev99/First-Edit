import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export const harnessDir = fileURLToPath(new URL('..', import.meta.url));
export const repoRoot = path.resolve(harnessDir, '..');

export interface HarnessServer {
  origin: string;
  close(): Promise<void>;
}

/** Starts the harness Vite dev server on a free port chosen by the OS. */
export async function startServer(): Promise<HarnessServer> {
  const server = await createServer({
    root: harnessDir,
    configFile: path.join(harnessDir, 'vite.config.ts'),
    logLevel: 'warn',
    clearScreen: false,
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('Vite did not report a listening port');
  }
  return { origin: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}
