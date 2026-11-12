function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Resolves once the content inside `root` is on screen: two frames so layout
 * has run and any font loads it needs have started, then those fonts, then
 * every image inside `root` (decoded or failed), then one more frame.
 */
export async function settle(root: Element): Promise<void> {
  await nextFrame();
  await nextFrame();
  await document.fonts.ready;
  const images = Array.from(root.querySelectorAll('img'), (img) =>
    img.decode().catch(() => undefined),
  );
  await Promise.all(images);
  await nextFrame();
}
