export {};

declare global {
  interface Window {
    /** True once the candidate has rendered and fonts have loaded. */
    __FE_READY__?: boolean;
    /** The error message, if the page failed to render the candidate. */
    __FE_ERROR__?: string;
  }
}
