// The stress suite's cases: every mutation at its own viewport, then every
// content mutation again at phone width (D-032). Each case has a tier (core
// or extreme, D-039) and names the render its findings are judged against
// and, for content-hidden (D-036), the render of the same data at 1280 with
// default settings. Pure data, importable from Node and from the app.

import { CONTENT_MUTATION_IDS, type ContentMutationId } from './content.ts';
import { BASELINE_VIEWPORT, ENVIRONMENT_MUTATION_IDS, type MutationId, type Viewport } from './index.ts';

export const PHONE_VIEWPORT: Viewport = { width: 320, height: 800 };

export type PhoneCaseId = `${ContentMutationId}@320`;

/** A case: a mutation id, or a content mutation at phone width ("text-long@320"). */
export type CaseId = MutationId | PhoneCaseId;

export type CaseKind = 'content' | 'environment' | 'content@320';

/** Renders whose findings decide what is new in a case. */
export type FindingsReference = 'baseline' | 'viewport-320';

/**
 * core cases make the headline; extreme cases are reported beside it
 * (D-039). The 60-letter word of text-unbroken is extreme, at 1280 and at
 * 320; every other case is core.
 */
export const CASE_TIERS = ['core', 'extreme'] as const;

export type CaseTier = (typeof CASE_TIERS)[number];

/** Mutations whose cases, at 1280 and at 320, are extreme. */
export const EXTREME_MUTATIONS: readonly MutationId[] = ['text-unbroken'];

function tierOf(mutation: MutationId): CaseTier {
  return EXTREME_MUTATIONS.includes(mutation) ? 'extreme' : 'core';
}

export interface CaseSpec {
  id: CaseId;
  /** The mutation the page applies. */
  mutation: MutationId;
  kind: CaseKind;
  tier: CaseTier;
  viewport: Viewport;
  /** The render whose findings decide what is new: the baseline, or viewport-320 for content@320 cases. */
  reference: FindingsReference;
  /**
   * content-hidden: the render of the same data at 1280 with default
   * settings ("baseline" or a content mutation id); null when the case is
   * not measured.
   */
  hiddenReference: 'baseline' | ContentMutationId | null;
}

export function phoneCaseId(id: ContentMutationId): PhoneCaseId {
  return `${id}@320`;
}

/** Every case, in run order: the content mutations, the environment mutations, then the content mutations at 320. */
export const CASES: readonly CaseSpec[] = [
  ...CONTENT_MUTATION_IDS.map(
    (id): CaseSpec => ({
      id,
      mutation: id,
      kind: 'content',
      tier: tierOf(id),
      viewport: BASELINE_VIEWPORT,
      reference: 'baseline',
      hiddenReference: null,
    }),
  ),
  ...ENVIRONMENT_MUTATION_IDS.map(
    (id): CaseSpec => ({
      id,
      mutation: id,
      kind: 'environment',
      tier: tierOf(id),
      viewport: id === 'viewport-320' ? PHONE_VIEWPORT : BASELINE_VIEWPORT,
      reference: 'baseline',
      hiddenReference: 'baseline',
    }),
  ),
  ...CONTENT_MUTATION_IDS.map(
    (id): CaseSpec => ({
      id: phoneCaseId(id),
      mutation: id,
      kind: 'content@320',
      tier: tierOf(id),
      viewport: PHONE_VIEWPORT,
      reference: 'viewport-320',
      hiddenReference: id,
    }),
  ),
];

export const CASE_IDS: readonly CaseId[] = CASES.map((spec) => spec.id);

export function caseSpec(id: CaseId): CaseSpec {
  const spec = CASES.find((candidate) => candidate.id === id);
  if (!spec) throw new Error(`Unknown case: "${id}"`);
  return spec;
}
