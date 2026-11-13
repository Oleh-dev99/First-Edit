# App sidebar

Build the sidebar navigation of Tarnwick, a project tracker for design
studios. It is a self-sized panel that sits at the side of every page of
the app.

At the top, show the workspace name. Below it, show the navigation
sections in the given order: each section has a title and its links.
Each link shows its label and, when it has one, a count such as the
number of open tasks; the link to the current page is active and must
stand out. At the bottom, show the signed-in user's name and role.

The component receives the props described by the `Props` interface. It
only needs to render; the links do not need to go anywhere.
