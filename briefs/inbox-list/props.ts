/** The message list of a web email client's inbox. */
export interface Props {
  folderTitle: string;
  unreadCount: number;
  messages: InboxMessage[];
}

export interface InboxMessage {
  id: string;
  sender: string;
  subject: string;
  /** The opening text of the message. */
  preview: string;
  /** Already formatted, e.g. "9:41 AM" or "Yesterday". */
  time: string;
  unread: boolean;
  labels: string[];
  hasAttachment: boolean;
}
