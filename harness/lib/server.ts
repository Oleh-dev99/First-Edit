import path from 'node:path';
import { createServer } from 'vite';
import { harnessDir } from './paths.ts';

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
    // forwardConsole: false keeps the page's console out of the terminal;
    // render errors are recorded in the case JSON instead.
    server: { host: '127.0.0.1', port: 0, strictPort: true, forwardConsole: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('Vite did not report a listening port');
  }
  return { origin: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}
