// The mutation registry: ids in run order, kinds and viewports. Pure data,
// importable from Node and from the app.

import { CONTENT_MUTATION_IDS, applyContentMutation, type ContentMutationId } from './content.ts';
import type { FieldsMap } from './fields.ts';

export const ENVIRONMENT_MUTATION_IDS = ['viewport-320', 'text-200pct', 'dir-rtl'] as const;

export type EnvironmentMutationId = (typeof ENVIRONMENT_MUTATION_IDS)[number];

/** Every mutation, in run order. */
export const MUTATION_IDS = [...CONTENT_MUTATION_IDS, ...ENVIRONMENT_MUTATION_IDS] as const;

export type MutationId = ContentMutationId | EnvironmentMutationId;

export type MutationKind = 'content' | 'environment';

export interface Viewport {
  width: number;
  height: number;
}

/** The baseline and every mutation except viewport-320 render at 1280x800. */
export const BASELINE_VIEWPORT: Viewport = { width: 1280, height: 800 };

/** text-200pct: a 32px root font size, which is what a browser's default font size at 200% does. */
export const TEXT_200PCT_ROOT_FONT_SIZE = '32px';

export function isMutationId(value: string): value is MutationId {
  return (MUTATION_IDS as readonly string[]).includes(value);
}

export function isContentMutation(id: MutationId): id is ContentMutationId {
  return (CONTENT_MUTATION_IDS as readonly string[]).includes(id);
}

export function mutationKind(id: MutationId): MutationKind {
  return isContentMutation(id) ? 'content' : 'environment';
}

export function viewportFor(id: MutationId | null): Viewport {
  return id === 'viewport-320' ? { width: 320, height: 800 } : BASELINE_VIEWPORT;
}

/** Mutations that change something for this fixture; environment mutations always do. */
export function applicableMutations(fixture: unknown, fields: FieldsMap): MutationId[] {
  return MUTATION_IDS.filter(
    (id) => !isContentMutation(id) || applyContentMutation(fixture, fields, id).changed.length > 0,
  );
}
