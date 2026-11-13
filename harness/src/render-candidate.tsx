import { Component, useEffect, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyEnvironment } from './environment.ts';
import { contentValues } from './measures/visible-values.ts';
import { applyContentMutation } from './mutations/content.ts';
import { assertValidFields } from './mutations/fields.ts';
import { isContentMutation, isMutationId, MUTATION_IDS, type MutationId } from './mutations/index.ts';
import { settle } from './settle.ts';
import { describe, fail } from './status.ts';

type CandidateModule = { default?: ComponentType<Record<string, unknown>> };

// Keys look like "../../candidates/_samples/hello-card/robust/Component.tsx".
const candidates = import.meta.glob<CandidateModule>('../../candidates/**/Component.tsx');

// Keys look like "../../briefs/hello-card/fixture.baseline.json".
const fixtures = import.meta.glob<unknown>('../../briefs/*/fixture.*.json', {
  import: 'default',
});

// Keys look like "../../briefs/hello-card/fields.json".
const fieldsMaps = import.meta.glob<unknown>('../../briefs/*/fields.json', { import: 'default' });

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

function readMutation(params: URLSearchParams): MutationId | null {
  const value = params.get('mutation');
  if (value === null) return null;
  if (!isMutationId(value)) {
    throw new Error(`Unknown mutation: "${value}". Known: ${MUTATION_IDS.join(', ')}`);
  }
  return value;
}

/**
 * Renders /?brief=<brief-id>&candidate=<source>/<brief-id>/<variant>
 *          [&fixture=<name>][&mutation=<id>]
 * into `root`. The fixture defaults to "baseline" and is checked against the
 * brief's fields map. A content mutation is applied to the fixture; an
 * environment mutation changes <html>. Resolves once the candidate is on
 * screen with its fonts and images loaded.
 */
export async function renderCandidate(root: HTMLElement, params: URLSearchParams): Promise<void> {
  const briefId = params.get('brief');
  const candidateId = params.get('candidate');
  const fixtureName = params.get('fixture') ?? 'baseline';
  const mutation = readMutation(params);
  if (!briefId) throw new Error('Missing query parameter "brief"');
  if (!candidateId) throw new Error('Missing query parameter "candidate"');

  const briefDir = `../../briefs/${briefId}/`;
  if (!Object.keys(fixtures).some((key) => key.startsWith(briefDir))) {
    throw new Error(`Unknown brief: "${briefId}"`);
  }
  const loadFixture = fixtures[`${briefDir}fixture.${fixtureName}.json`];
  if (!loadFixture) throw new Error(`Unknown fixture "${fixtureName}" for brief "${briefId}"`);
  const loadFields = fieldsMaps[`${briefDir}fields.json`];
  if (!loadFields) throw new Error(`Brief "${briefId}" has no fields.json`);
  const loadCandidate = candidates[`../../candidates/${candidateId}/Component.tsx`];
  if (!loadCandidate) throw new Error(`Unknown candidate: "${candidateId}"`);

  const [fixture, fields, candidateModule] = await Promise.all([loadFixture(), loadFields(), loadCandidate()]);
  assertValidFields(fixture, fields, `fields map of brief "${briefId}" for fixture "${fixtureName}"`);
  const Candidate = candidateModule.default;
  if (!Candidate) throw new Error(`Candidate "${candidateId}" has no default export`);

  let props = fixture;
  if (mutation !== null && isContentMutation(mutation)) {
    props = applyContentMutation(fixture, fields, mutation).fixture;
  } else if (mutation !== null) {
    applyEnvironment(mutation);
  }
  window.__FE_CONTENT_VALUES__ = contentValues(props, fields);

  await new Promise<void>((resolve) => {
    createRoot(root).render(
      <ErrorBoundary>
        <Candidate {...(props as Record<string, unknown>)} />
        <ReadyProbe root={root} onReady={resolve} />
      </ErrorBoundary>,
    );
  });
}
