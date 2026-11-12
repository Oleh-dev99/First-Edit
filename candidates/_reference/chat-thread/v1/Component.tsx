// Reference implementation for the chat-thread brief: a self-sized chat
// panel whose message list scrolls inside a fixed-height area and opens at
// the latest message, as chat views do.

import { useId, useLayoutEffect, useRef } from 'react';

type Sender = 'me' | 'them';

interface Contact {
  name: string;
  status: string;
}

interface Message {
  id: string;
  from: Sender;
  author: string;
  text: string;
  time: string;
}

interface Composer {
  placeholder: string;
  sendLabel: string;
}

interface Props {
  contact: Contact;
  messages: Message[];
  composer: Composer;
}

const firstLetter = (text: string): string => (Array.from(text.trim())[0] ?? '').toUpperCase();

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return '?';
  return firstLetter(words[0]) + (words.length > 1 ? firstLetter(words[words.length - 1]) : '');
}

function Avatar({ name, tone }: { name: string; tone: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone}`}
    >
      {initialsOf(name)}
    </span>
  );
}

function Bubble({ message }: { message: Message }) {
  const mine = message.from === 'me';
  return (
    <li className={`flex max-w-[85%] items-end gap-2 ${mine ? 'flex-row-reverse self-end' : 'self-start'}`}>
      <Avatar name={message.author} tone={mine ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'} />
      <div className={`flex min-w-0 flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <p className={`flex max-w-full flex-wrap items-baseline gap-x-2 text-xs text-slate-500 ${mine ? 'justify-end' : ''}`}>
          <span className="min-w-0 font-medium text-slate-700 wrap-anywhere">{message.author}</span>
          <time>{message.time}</time>
        </p>
        <p
          className={`mt-1 max-w-full rounded-2xl px-3.5 py-2 text-start text-sm leading-6 whitespace-pre-line wrap-anywhere ${
            mine ? 'rounded-ee-md bg-indigo-600 text-white' : 'rounded-es-md bg-slate-100 text-slate-900'
          }`}
        >
          {message.text}
        </p>
      </div>
    </li>
  );
}

export default function ChatThread({ contact, messages, composer }: Props) {
  const inputId = useId();
  const list = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages]);
  return (
    <section className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <Avatar name={contact.name} tone="bg-slate-200 text-slate-700" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 wrap-anywhere">{contact.name}</h2>
          {contact.status ? <p className="text-xs text-slate-500 wrap-anywhere">{contact.status}</p> : null}
        </div>
      </header>

      <ol ref={list} className="flex h-[28rem] flex-col gap-4 overflow-y-auto px-4 py-5">
        {messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
      </ol>

      <form className="flex items-end gap-2 border-t border-slate-200 p-3" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor={inputId} className="sr-only">
          Message
        </label>
        <textarea
          id={inputId}
          rows={1}
          placeholder={composer.placeholder}
          className="field-sizing-content min-h-10 min-w-0 flex-1 resize-none rounded-lg bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
        />
        <button
          type="submit"
          className="max-w-[45%] shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 wrap-anywhere"
        >
          {composer.sendLabel}
        </button>
      </form>
    </section>
  );
}
