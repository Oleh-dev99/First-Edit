/** The conversation view of a customer support chat app. */
export interface Props {
  contact: Contact;
  messages: Message[];
  composer: Composer;
}

export interface Contact {
  name: string;
  /** e.g. "Active now" */
  status: string;
}

/** "me" is the signed-in support agent, "them" the contact. */
export type Sender = 'me' | 'them';

export interface Message {
  id: string;
  from: Sender;
  author: string;
  text: string;
  /** Already formatted, e.g. "9:41 AM". */
  time: string;
}

export interface Composer {
  placeholder: string;
  sendLabel: string;
}
