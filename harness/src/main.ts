import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import './styles.css';

import { renderCandidate } from './render-candidate.tsx';
import { describe, fail, markReady } from './status.ts';

const FONT_FAMILY = 'Inter Variable';

window.addEventListener('error', (event) => fail(describe(event.error ?? event.message)));
window.addEventListener('unhandledrejection', (event) => fail(describe(event.reason)));

async function main(): Promise<void> {
  const root = document.getElementById('fe-root');
  if (!root) throw new Error('Missing #fe-root element');

  const fontFaces = await document.fonts.load(`16px "${FONT_FAMILY}"`);
  if (fontFaces.length === 0) throw new Error(`Font "${FONT_FAMILY}" is not available`);

  await renderCandidate(root, new URLSearchParams(window.location.search));
  markReady();
}

main().catch((error: unknown) => fail(describe(error)));
