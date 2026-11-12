function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Upper bound on waiting for images: a load that never settles must not hang readiness. */
const IMAGE_WAIT_MS = 5_000;

/**
 * Resolves once the content inside `root` is on screen: two frames so layout
 * has run and any font loads it needs have started, then those fonts, then
 * every image inside `root` (decoded or failed, at most IMAGE_WAIT_MS), then
 * one more frame. Lazy images are switched to eager first: below the fold
 * they would otherwise never load, and the screenshot would miss them.
 */
export async function settle(root: Element): Promise<void> {
  await nextFrame();
  await nextFrame();
  await document.fonts.ready;
  const images = Array.from(root.querySelectorAll('img'));
  for (const image of images) {
    if (image.loading === 'lazy') image.loading = 'eager';
  }
  const decoded = Promise.all(images.map((image) => image.decode().catch(() => undefined)));
  await Promise.race([decoded, delay(IMAGE_WAIT_MS)]);
  await nextFrame();
}
