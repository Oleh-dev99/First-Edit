# hello-card

Build a user profile card.

The card shows:

- a round avatar with the person's initials: at most two letters, the
  first letter of the first word and of the last word of their name
- the person's name
- their job title
- a short bio
- their skills as a set of tags
- their follower count, formatted for reading
- one "Follow" button

The component receives `Props` (see `props.ts`) as its props.
The name may be empty; the card must still render sensibly.
The "Follow" button does not need to do anything when clicked.
