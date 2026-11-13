/** A tabbed section of a documents page: the tabs and the active tab's panel. */
export interface Props {
  tabs: Tab[];
  /** The panel of the active tab. */
  panel: Panel;
}

export interface Tab {
  id: string;
  label: string;
  /** The number of documents behind the tab. */
  count: number;
  /** True for the tab whose panel is shown. */
  active: boolean;
}

export interface Panel {
  heading: string;
  description: string;
  items: PanelItem[];
}

export interface PanelItem {
  id: string;
  /** The document's name. */
  name: string;
  /** Shown under the name, e.g. who the document is waiting on. */
  detail: string;
}
