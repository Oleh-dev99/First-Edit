// Lab cases for content-hidden (D-036): each case is rendered at 1280 and at
// 320 px, and the values visible at 1280 but not at 320 are counted. Used by
// the lab route (/?lab=<id>) and by test/content-hidden.test.ts.

export interface HiddenLabCase {
  id: string;
  /** "+" cases hide content at 320 px, "-" cases do not. */
  description: string;
  html: string;
  /** The label and prose values the case shows, as a fixture would hold them. */
  values: string[];
  /** Values visible at 1280 and not at 320. */
  expectedHidden: number;
}

const TABS = ['Overview', 'Invoices', 'Expenses', 'Reports', 'Customers', 'Integrations', 'Settings'];

export const HIDDEN_LAB_CASES: HiddenLabCase[] = [
  {
    id: 'hidden-display-none-narrow',
    description: '+ a value in a block that is display none below 640px',
    html:
      `<style>@media (max-width: 639px) { .fe-lab-wide-only { display: none } }</style>` +
      `<p>Invoice #10482</p>` +
      `<p class="fe-lab-wide-only">Paid by bank transfer</p>`,
    values: ['Invoice #10482', 'Paid by bank transfer'],
    expectedHidden: 1,
  },
  {
    id: 'hidden-table-to-list',
    description: '- a table that becomes a stacked list with the same values',
    html:
      `<style>.fe-lab-list { display: none } ` +
      `@media (max-width: 639px) { .fe-lab-table { display: none } .fe-lab-list { display: block } }</style>` +
      `<table class="fe-lab-table"><tbody>` +
      `<tr><td>Elena Marquez</td><td>Paid</td></tr>` +
      `<tr><td>Tom Becker</td><td>Pending</td></tr>` +
      `</tbody></table>` +
      `<ul class="fe-lab-list">` +
      `<li><strong>Elena Marquez</strong> <span>Paid</span></li>` +
      `<li><strong>Tom Becker</strong> <span>Pending</span></li>` +
      `</ul>`,
    values: ['Elena Marquez', 'Paid', 'Tom Becker', 'Pending'],
    expectedHidden: 0,
  },
  {
    id: 'hidden-tabs-scroller',
    description: '- tabs in a horizontal scroller, partly out of view at 320px',
    html:
      `<nav style="display:flex; gap:24px; overflow-x:auto; white-space:nowrap; border-bottom:1px solid #e2e8f0">` +
      TABS.map((tab) => `<a href="#${tab}" style="padding:8px 0">${tab}</a>`).join('') +
      `</nav>`,
    values: TABS,
    expectedHidden: 0,
  },
  {
    id: 'hidden-ellipsis',
    description: '- a value truncated with an ellipsis at 320px',
    html:
      `<p style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap">` +
      `A hand-thrown stoneware pour-over set with a matching carafe and two cups` +
      `</p>`,
    values: ['A hand-thrown stoneware pour-over set with a matching carafe and two cups'],
    expectedHidden: 0,
  },
];
