# Activity feed

Build the activity feed of Corbelhouse, a workspace where product teams
plan and track their work. It is a full-width section of the workspace's
home page.

Show the section title and the filter options; one filter is selected and
must look selected. Then show the events in the given order, newest
first. Each event reads as a sentence made of the actor's name, the
action and the target's name, for example "Hana Yoshida completed Fix
invoice rounding", together with the time it happened. When the actor
left a comment, show the comment with its event.

The component receives the props described by the `Props` interface. It
only needs to render; the filters do not need to work.
