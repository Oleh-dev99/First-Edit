// Reference implementation for the tabs-panel brief: pill-shaped tabs that
// move onto a new row when they need more room, above the active tab's
// panel with its list of documents.

interface Tab {
  id: string;
  label: string;
  count: number;
  active: boolean;
}

interface PanelItem {
  id: string;
  name: string;
  detail: string;
}

interface Panel {
  heading: string;
  description: string;
  items: PanelItem[];
}

interface Props {
  tabs: Tab[];
  panel: Panel;
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-400">
      <path
        fillRule="evenodd"
        d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function DocumentTabs({ tabs, panel }: Props) {
  const number = new Intl.NumberFormat('en-US');
  const activeTab = tabs.find((tab) => tab.active);

  return (
    <section className="w-full rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="border-b border-slate-200 px-4 py-3 sm:px-6">
        <div role="tablist" aria-label="Documents by status" className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.active}
              className={`inline-flex max-w-full min-w-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab.active
                  ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 ring-inset'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="min-w-0 text-start wrap-anywhere">{tab.label}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                  tab.active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {number.format(tab.count)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" aria-label={activeTab?.label} className="px-4 py-5 sm:px-6 sm:py-6">
        <h2 className="text-base font-semibold text-slate-900 wrap-anywhere">{panel.heading}</h2>
        {panel.description ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 wrap-anywhere">{panel.description}</p>
        ) : null}

        {panel.items.length > 0 ? (
          <ul role="list" className="mt-5 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {panel.items.map((item) => (
              <li key={item.id} className="flex gap-3 px-4 py-3">
                <DocumentIcon />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 wrap-anywhere">{item.name}</p>
                  {item.detail ? <p className="mt-0.5 text-sm text-slate-500 wrap-anywhere">{item.detail}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
