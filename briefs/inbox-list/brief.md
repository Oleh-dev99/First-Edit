# Inbox message list

Build the message list of the inbox in Quillpost, a web email client. It
is a full-width section of the mail page, next to the folder navigation.

Show the folder title with the number of unread messages. Then show one
row per message with the sender's name, the subject, the preview text and
the time it arrived. Unread messages must stand out from read ones. Show
each message's labels, and mark messages that have attachments. Times
arrive already formatted; show them as they are.

The component receives the props described by the `Props` interface. It
only needs to render; selecting or opening a message does not need to
work.
