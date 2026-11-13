import type { Finding } from './checks/finding.ts';
import type { VisibleValue } from './measures/visible-values.ts';

declare global {
  interface Window {
    /** True once the page has rendered and fonts and images have loaded. */
    __FE_READY__?: boolean;
    /** The error message, if the page failed to render. */
    __FE_ERROR__?: string;
    /** Runs every check on #fe-root and returns the findings. */
    __FE_RUN_CHECKS__?: () => Finding[];
    /** The label and prose values of the rendered fixture (or lab case), normalized. */
    __FE_CONTENT_VALUES__?: string[];
    /** For every content value: is it visible on #fe-root? (content-hidden, D-036) */
    __FE_VISIBLE_VALUES__?: () => VisibleValue[];
  }
}
