import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import './styles.css';

import { Component, useEffect, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// Usage: /?brief=<brief-id>&candidate=<source>/<brief-id>/<variant>

type CandidateModule = { default?: ComponentType<Record<string, unknown>> };

// Keys look like "../../candidates/_samples/hello-card/robust/Component.tsx".
const candidates = import.meta.glob<CandidateModule>('../../candidates/**/Component.tsx');

// Keys look like "../../briefs/hello-card/fixture.baseline.json".
const fixtures = import.meta.glob<unknown>('../../briefs/*/fixture.baseline.json', {
  import: 'default',
});

const FONT_FAMILY = 'Inter Variable';

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Records the first error for the runner and shows it on the page. */
function fail(message: string): void {
  if (window.__FE_ERROR__ !== undefined) return;
  window.__FE_ERROR__ = message;
  const box = document.getElementById('fe-error');
  if (box) {
    box.textContent = message;
    box.hidden = false;
  }
}

window.addEventListener('error', (event) => fail(describe(event.error ?? event.message)));
window.addEventListener('unhandledrejection', (event) => fail(describe(event.reason)));

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    fail(`Render error: ${describe(error)}`);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Rendered after the candidate, so its effect runs once the candidate is in
 * the DOM. Waits two frames so layout has run and any font loads it needs
 * have started, then waits for those fonts.
 */
function ReadyProbe(): null {
  useEffect(() => {
    (async () => {
      await nextFrame();
      await nextFrame();
      await document.fonts.ready;
      if (window.__FE_ERROR__ === undefined) window.__FE_READY__ = true;
    })().catch((error: unknown) => fail(describe(error)));
  }, []);
  return null;
}

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const briefId = params.get('brief');
  const candidateId = params.get('candidate');
  if (!briefId) throw new Error('Missing query parameter "brief"');
  if (!candidateId) throw new Error('Missing query parameter "candidate"');

  const loadFixture = fixtures[`../../briefs/${briefId}/fixture.baseline.json`];
  if (!loadFixture) throw new Error(`Unknown brief: "${briefId}"`);
  const loadCandidate = candidates[`../../candidates/${candidateId}/Component.tsx`];
  if (!loadCandidate) throw new Error(`Unknown candidate: "${candidateId}"`);

  const [fixture, candidateModule, fontFaces] = await Promise.all([
    loadFixture(),
    loadCandidate(),
    document.fonts.load(`16px "${FONT_FAMILY}"`),
  ]);

  if (fontFaces.length === 0) throw new Error(`Font "${FONT_FAMILY}" is not available`);
  if (typeof fixture !== 'object' || fixture === null || Array.isArray(fixture)) {
    throw new Error(`Fixture for brief "${briefId}" is not a JSON object`);
  }
  const Candidate = candidateModule.default;
  if (!Candidate) throw new Error(`Candidate "${candidateId}" has no default export`);

  const rootElement = document.getElementById('fe-root');
  if (!rootElement) throw new Error('Missing #fe-root element');

  createRoot(rootElement).render(
    <ErrorBoundary>
      <Candidate {...(fixture as Record<string, unknown>)} />
      <ReadyProbe />
    </ErrorBoundary>,
  );
}

main().catch((error: unknown) => fail(describe(error)));
