import { Component, useEffect, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { settle } from './settle.ts';
import { describe, fail } from './status.ts';

type CandidateModule = { default?: ComponentType<Record<string, unknown>> };

// Keys look like "../../candidates/_samples/hello-card/robust/Component.tsx".
const candidates = import.meta.glob<CandidateModule>('../../candidates/**/Component.tsx');

// Keys look like "../../briefs/hello-card/fixture.baseline.json".
const fixtures = import.meta.glob<unknown>('../../briefs/*/fixture.*.json', {
  import: 'default',
});

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

/** Rendered after the candidate, so its effect runs once the candidate is in the DOM. */
function ReadyProbe({ root, onReady }: { root: Element; onReady: () => void }): null {
  useEffect(() => {
    settle(root).then(onReady, (error: unknown) => fail(describe(error)));
  }, [root, onReady]);
  return null;
}

/**
 * Renders /?brief=<brief-id>&candidate=<source>/<brief-id>/<variant>[&fixture=<name>]
 * into `root`. The fixture defaults to "baseline". Resolves once the
 * candidate is on screen with its fonts loaded.
 */
export async function renderCandidate(root: HTMLElement, params: URLSearchParams): Promise<void> {
  const briefId = params.get('brief');
  const candidateId = params.get('candidate');
  const fixtureName = params.get('fixture') ?? 'baseline';
  if (!briefId) throw new Error('Missing query parameter "brief"');
  if (!candidateId) throw new Error('Missing query parameter "candidate"');

  const briefDir = `../../briefs/${briefId}/`;
  if (!Object.keys(fixtures).some((key) => key.startsWith(briefDir))) {
    throw new Error(`Unknown brief: "${briefId}"`);
  }
  const loadFixture = fixtures[`${briefDir}fixture.${fixtureName}.json`];
  if (!loadFixture) throw new Error(`Unknown fixture "${fixtureName}" for brief "${briefId}"`);
  const loadCandidate = candidates[`../../candidates/${candidateId}/Component.tsx`];
  if (!loadCandidate) throw new Error(`Unknown candidate: "${candidateId}"`);

  const [fixture, candidateModule] = await Promise.all([loadFixture(), loadCandidate()]);
  if (typeof fixture !== 'object' || fixture === null || Array.isArray(fixture)) {
    throw new Error(`Fixture "${fixtureName}" for brief "${briefId}" is not a JSON object`);
  }
  const Candidate = candidateModule.default;
  if (!Candidate) throw new Error(`Candidate "${candidateId}" has no default export`);

  await new Promise<void>((resolve) => {
    createRoot(root).render(
      <ErrorBoundary>
        <Candidate {...(fixture as Record<string, unknown>)} />
        <ReadyProbe root={root} onReady={resolve} />
      </ErrorBoundary>,
    );
  });
}
