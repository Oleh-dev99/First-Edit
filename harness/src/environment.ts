import { TEXT_200PCT_ROOT_FONT_SIZE, type EnvironmentMutationId } from './mutations/index.ts';

/** Applies an environment mutation to <html>. viewport-320 is set by the runner, not the page. */
export function applyEnvironment(id: EnvironmentMutationId): void {
  const html = document.documentElement;
  if (id === 'text-200pct') html.style.fontSize = TEXT_200PCT_ROOT_FONT_SIZE;
  if (id === 'dir-rtl') html.dir = 'rtl';
}
