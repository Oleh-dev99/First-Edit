# Document review tabs

Build the tabbed documents section of Penmoor, a writing workspace for
content teams. It is a full-width section of the team's documents page.

At the top, show the row of tabs in the given order. Each tab shows its
label and the number of documents behind it, and the active tab must be
clearly marked. Below the tabs, show the active tab's panel: its heading,
its description and its list of documents. Each document shows its name
with a detail line under it.

The component receives the props described by the `Props` interface. It
only needs to render the active tab's panel; switching tabs does not need
to work.
