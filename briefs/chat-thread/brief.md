# Chat thread

Build the conversation view of Pinecall, a customer support chat app. It
is a self-sized chat panel that sits in the support agent's workspace.

At the top, show the contact's name with their status line and an avatar
with their initials. Below, show the messages in order. Each message is
either from me or from the contact: show who wrote it, the text and the
time, and make it easy to tell the two sides apart. At the bottom, show
the message composer with its placeholder and a send button with the
given label.

The component receives the props described by the `Props` interface. It
only needs to render; sending does not need to work.
