import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import './styles.css';

import { runChecks } from './checks/index.ts';
import { renderLab } from './lab/render-lab.ts';
import { renderCandidate } from './render-candidate.tsx';
import { describe, fail, markReady } from './status.ts';

// Routes:
//   /?brief=<brief-id>&candidate=<source>/<brief-id>/<variant>[&fixture=<name>]
//   /?lab=<case-id>

const FONT_FAMILY = 'Inter Variable';

window.addEventListener('error', (event) => fail(describe(event.error ?? event.message)));
window.addEventListener('unhandledrejection', (event) => fail(describe(event.reason)));

async function main(): Promise<void> {
  const root = document.getElementById('fe-root');
  if (!root) throw new Error('Missing #fe-root element');
  window.__FE_RUN_CHECKS__ = () => runChecks(root);

  const fontFaces = await document.fonts.load(`16px "${FONT_FAMILY}"`);
  if (fontFaces.length === 0) throw new Error(`Font "${FONT_FAMILY}" is not available`);

  const params = new URLSearchParams(window.location.search);
  const labId = params.get('lab');
  if (labId !== null) await renderLab(root, labId);
  else await renderCandidate(root, params);
  markReady();
}

main().catch((error: unknown) => fail(describe(error)));
