/** The profile and notification settings section of an account settings page. */
export interface Props {
  title: string;
  description: string;
  displayName: TextField;
  email: TextField;
  timeZone: SelectField;
  notifications: NotificationSetting[];
  saveLabel: string;
  cancelLabel: string;
}

export interface TextField {
  label: string;
  /** The current value of the input. */
  value: string;
  /** Help text shown with the input. */
  help: string;
}

export interface SelectField {
  label: string;
  /** The value of the selected option. */
  value: string;
  options: SelectOption[];
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  /** True when the notification is switched on. */
  enabled: boolean;
}
