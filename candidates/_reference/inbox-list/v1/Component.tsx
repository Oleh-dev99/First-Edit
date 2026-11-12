// Reference implementation for the inbox-list brief. Sender and subject
// keep to one line with an ellipsis and the preview to two lines, as email
// clients do; nothing is hidden outright.

interface InboxMessage {
  id: string;
  sender: string;
  subject: string;
  preview: string;
  time: string;
  unread: boolean;
  labels: string[];
  hasAttachment: boolean;
}

interface Props {
  folderTitle: string;
  unreadCount: number;
  messages: InboxMessage[];
}

const standard = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** "3", "4,210", then compact from ten thousand: "12.3K". */
const formatCount = (value: number): string => (Math.abs(value) < 10_000 ? standard : compact).format(value);

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4 shrink-0 text-slate-400">
      <path
        fillRule="evenodd"
        d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.243h.001l.497-.5a.75.75 0 0 1 1.064 1.057l-.498.501-.002.002a4.5 4.5 0 0 1-6.364-6.364l7-7a4.5 4.5 0 0 1 6.368 6.36l-3.455 3.553A2.625 2.625 0 1 1 9.52 9.52l3.45-3.451a.75.75 0 1 1 1.061 1.06l-3.45 3.451a1.125 1.125 0 0 0 1.587 1.595l3.454-3.553a3 3 0 0 0 0-4.242Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MessageRow({ message }: { message: InboxMessage }) {
  const { sender, subject, preview, time, unread, labels, hasAttachment } = message;
  return (
    <li className={`flex gap-3 px-4 py-4 sm:px-6 ${unread ? 'bg-white' : 'bg-slate-50/70'}`}>
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? 'bg-indigo-600' : 'bg-transparent'}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <p className={`min-w-0 flex-1 truncate text-sm ${unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-600'}`}>
            {unread ? <span className="sr-only">Unread: </span> : null}
            {sender}
          </p>
          <p className={`shrink-0 text-xs ${unread ? 'font-semibold text-indigo-700' : 'text-slate-500'}`}>{time}</p>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className={`min-w-0 flex-1 truncate text-sm ${unread ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
            {subject}
          </p>
          {hasAttachment ? (
            <span className="flex shrink-0 items-center" title="Has attachment">
              <PaperclipIcon />
              <span className="sr-only">Has attachment</span>
            </span>
          ) : null}
        </div>
        {preview ? <p className="mt-0.5 line-clamp-2 text-sm text-slate-500 wrap-anywhere">{preview}</p> : null}
        {labels.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {labels.map((label, index) => (
              <li key={index} className="min-w-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 wrap-anywhere">
                {label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

export default function InboxList({ folderTitle, unreadCount, messages }: Props) {
  return (
    <section className="relative w-full overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="min-w-0 text-lg font-semibold text-slate-900 wrap-anywhere">{folderTitle}</h2>
        <p className="min-w-0 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 wrap-anywhere">
          <span className="tabular-nums">{formatCount(unreadCount)}</span> unread
        </p>
      </header>
      <ul className="divide-y divide-slate-100">
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
      </ul>
    </section>
  );
}
