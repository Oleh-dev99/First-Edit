// content-hidden (D-036): the pure helpers, and every content-hidden lab case
// rendered at 1280 and at 320 px in headless Chromium.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { openPage } from '../lib/render.ts';
import { startServer, type HarnessServer } from '../lib/server.ts';
import { HIDDEN_LAB_CASES } from '../src/lab/hidden-cases.ts';
import { contentValues, hiddenValues, normalizeText, type VisibleValue } from '../src/measures/visible-values.ts';
import type { FieldsMap } from '../src/mutations/fields.ts';

describe('content-hidden helpers', () => {
  test('values are whitespace-normalized and lower-cased', () => {
    assert.equal(normalizeText('  Paid \n by   Bank '), 'paid by bank');
  });

  test('contentValues takes label and prose values only, once each, never empty ones', () => {
    const fields: FieldsMap = {
      title: { kind: 'label' },
      body: { kind: 'prose' },
      status: { kind: 'fixed' },
      count: { kind: 'number' },
      tags: { kind: 'list' },
      'tags[]': { kind: 'label' },
      note: { kind: 'label' },
    };
    const fixture = { title: 'Inbox', body: 'Three  new\nmessages', status: 'open', count: 3, tags: ['Work', 'work', 'Home'], note: ' ' };
    assert.deepStrictEqual(contentValues(fixture, fields), ['inbox', 'three new messages', 'work', 'home']);
  });

  test('a value is hidden when the reference shows it and the current render does not', () => {
    const reference: VisibleValue[] = [
      { value: 'a', visible: true },
      { value: 'b', visible: true },
      { value: 'c', visible: false },
    ];
    const current: VisibleValue[] = [
      { value: 'a', visible: true },
      { value: 'b', visible: false },
      { value: 'c', visible: false },
    ];
    assert.deepStrictEqual(hiddenValues(reference, current), ['b']);
    // A value shown only in the current render is not hidden.
    assert.deepStrictEqual(hiddenValues(current, reference), []);
  });
});

describe('content-hidden lab', () => {
  let server: HarnessServer;
  let browser: Browser;

  before(async () => {
    server = await startServer();
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  const visibleAt = async (id: string, width: number): Promise<VisibleValue[]> => {
    const { context, page } = await openPage(browser, server.origin, `?lab=${id}`, { width, height: 800 });
    try {
      return await (page as Page).evaluate(() => window.__FE_VISIBLE_VALUES__!());
    } finally {
      await context.close();
    }
  };

  for (const labCase of HIDDEN_LAB_CASES) {
    test(`${labCase.description} [${labCase.id}]`, async (t) => {
      const wide = await visibleAt(labCase.id, 1280);
      const narrow = await visibleAt(labCase.id, 320);
      // Every value is visible at 1280, so the case measures what 320 px does.
      assert.deepStrictEqual(wide.filter((entry) => !entry.visible), []);
      const hidden = hiddenValues(wide, narrow);
      t.diagnostic(`hidden at 320: ${JSON.stringify(hidden)}`);
      assert.equal(hidden.length, labCase.expectedHidden);
    });
  }
});
