/** A dialog that confirms the deletion of a project. */
export interface Props {
  title: string;
  /** Explains what the action does. */
  body: string;
  /** The name of the project that will be deleted. */
  projectName: string;
  /** Heading of the list of consequences. */
  consequencesTitle: string;
  /** What deleting the project will do. */
  consequences: string[];
  /** The input where the user types the project's name to confirm. */
  confirmInput: ConfirmInput;
  cancelLabel: string;
  /** Label of the button that deletes the project. */
  confirmLabel: string;
}

export interface ConfirmInput {
  label: string;
  placeholder: string;
}
