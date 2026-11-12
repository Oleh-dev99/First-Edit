// Reference implementation for the settings-form brief.

import { useId } from 'react';

interface TextField {
  label: string;
  value: string;
  help: string;
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectField {
  label: string;
  value: string;
  options: SelectOption[];
}

interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

interface Props {
  title: string;
  description: string;
  displayName: TextField;
  email: TextField;
  timeZone: SelectField;
  notifications: NotificationSetting[];
  saveLabel: string;
  cancelLabel: string;
}

// text-ellipsis: a value that does not fit ends in an ellipsis instead of being cut off.
const CONTROL =
  'mt-2 block w-full rounded-md bg-white px-3 py-2 text-sm text-ellipsis text-slate-900 ring-1 ring-slate-300 ring-inset ' +
  'focus:ring-2 focus:ring-indigo-600 focus:outline-none';

function TextInput({ field, type, autoComplete }: { field: TextField; type: string; autoComplete: string }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-900 wrap-anywhere">
        {field.label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        defaultValue={field.value}
        aria-describedby={field.help ? `${id}-help` : undefined}
        className={CONTROL}
      />
      {field.help ? (
        <p id={`${id}-help`} className="mt-2 text-sm text-slate-500 wrap-anywhere">
          {field.help}
        </p>
      ) : null}
    </div>
  );
}

function Toggle({ setting }: { setting: NotificationSetting }) {
  const id = useId();
  return (
    <li className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-medium text-slate-900 wrap-anywhere">
          {setting.label}
        </p>
        {setting.description ? (
          <p id={`${id}-description`} className="mt-1 text-sm text-slate-500 wrap-anywhere">
            {setting.description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={setting.enabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={setting.description ? `${id}-description` : undefined}
        className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          setting.enabled ? 'bg-indigo-600' : 'bg-slate-200'
        }`}
      >
        <span
          aria-hidden="true"
          className={`size-5 rounded-full bg-white shadow-sm ring-1 ring-slate-900/5 transition-transform ${
            setting.enabled ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </li>
  );
}

export default function SettingsForm({
  title,
  description,
  displayName,
  email,
  timeZone,
  notifications,
  saveLabel,
  cancelLabel,
}: Props) {
  const timeZoneId = useId();
  return (
    <form
      className="w-full rounded-xl bg-white shadow-sm ring-1 ring-slate-200"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="space-y-8 px-4 py-6 sm:p-8">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-slate-900 wrap-anywhere">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-slate-600 wrap-anywhere">{description}</p> : null}
        </div>

        <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
          <TextInput field={displayName} type="text" autoComplete="name" />
          <TextInput field={email} type="email" autoComplete="email" />
          <div className="min-w-0 sm:col-span-2">
            <label htmlFor={timeZoneId} className="block text-sm font-medium text-slate-900 wrap-anywhere">
              {timeZone.label}
            </label>
            <select id={timeZoneId} defaultValue={timeZone.value} className={`${CONTROL} pe-8 sm:max-w-sm`}>
              {timeZone.options.map((option, index) => (
                <option key={index} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {notifications.length > 0 ? (
          <fieldset className="max-w-3xl">
            <legend className="text-sm font-semibold text-slate-900">Notifications</legend>
            <ul className="mt-2 divide-y divide-slate-100">
              {notifications.map((setting) => (
                <Toggle key={setting.id} setting={setting} />
              ))}
            </ul>
          </fieldset>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 rounded-b-xl border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-8">
        <button
          type="button"
          className="min-w-0 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-300 ring-inset hover:bg-slate-50 wrap-anywhere"
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          className="min-w-0 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 wrap-anywhere"
        >
          {saveLabel}
        </button>
      </div>
    </form>
  );
}
