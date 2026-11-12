import type { Finding } from './checks/finding.ts';

declare global {
  interface Window {
    /** True once the page has rendered and fonts and images have loaded. */
    __FE_READY__?: boolean;
    /** The error message, if the page failed to render. */
    __FE_ERROR__?: string;
    /** Runs every check on #fe-root and returns the findings. */
    __FE_RUN_CHECKS__?: () => Finding[];
  }
}
