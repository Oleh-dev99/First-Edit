// Reference implementation for the confirm-dialog brief: the dialog panel on
// its own, self-sized up to a comfortable reading width. Below 640px the
// warning icon sits above the text instead of beside it.

import { useId } from 'react';

interface ConfirmInput {
  label: string;
  placeholder: string;
}

interface Props {
  title: string;
  body: string;
  projectName: string;
  consequencesTitle: string;
  consequences: string[];
  confirmInput: ConfirmInput;
  cancelLabel: string;
  confirmLabel: string;
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true" className="size-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-red-500">
      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
    </svg>
  );
}

export default function ConfirmDeleteDialog({
  title,
  body,
  projectName,
  consequencesTitle,
  consequences,
  confirmInput,
  cancelLabel,
  confirmLabel,
}: Props) {
  const titleId = useId();
  const bodyId = useId();
  const inputId = useId();

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={body ? bodyId : undefined}
      className="w-full max-w-lg rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/10"
    >
      <div className="px-5 pt-6 pb-6 sm:flex sm:items-start sm:gap-4 sm:px-6">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
          <WarningIcon />
        </div>

        <div className="mt-4 min-w-0 flex-1 sm:mt-0">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 wrap-anywhere">
            {title}
          </h2>
          {body ? (
            <p id={bodyId} className="mt-1.5 text-sm leading-6 text-slate-600 wrap-anywhere">
              {body}
            </p>
          ) : null}

          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm font-medium text-slate-900 ring-1 ring-slate-200 ring-inset wrap-anywhere">
            {projectName}
          </p>

          {consequencesTitle ? (
            <p className="mt-5 text-sm font-medium text-slate-900 wrap-anywhere">{consequencesTitle}</p>
          ) : null}
          {consequences.length > 0 ? (
            <ul className={`${consequencesTitle ? 'mt-2' : 'mt-5'} space-y-2`}>
              {consequences.map((consequence, index) => (
                <li key={index} className="flex gap-2.5 text-sm leading-6 text-slate-600">
                  <CrossIcon />
                  <span className="min-w-0 wrap-anywhere">{consequence}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-5">
            <label htmlFor={inputId} className="block text-sm font-medium text-slate-900 wrap-anywhere">
              {confirmInput.label}
            </label>
            <input
              id={inputId}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={confirmInput.placeholder}
              className="mt-2 block w-full rounded-lg bg-white px-3 py-2 font-mono text-sm text-ellipsis text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-red-600 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
        <button
          type="button"
          className="min-w-0 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-300 ring-inset hover:bg-slate-50 wrap-anywhere"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="min-w-0 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 wrap-anywhere"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
