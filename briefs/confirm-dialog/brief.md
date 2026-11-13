# Delete project dialog

Build the dialog that Gantrywell, a hosting platform for web apps, shows
before a project is deleted for good. It is a self-sized dialog: render
the dialog panel on its own, without a backdrop or the settings page
behind it.

Show the dialog title and the body text, then the name of the project
that will be deleted, set apart so that it is easy to check. List what
deleting the project will do, under the given heading. Then show the
confirmation input with its label and placeholder, where the user types
the project's name to confirm. End with the cancel button and the
confirm button, using the given labels; the confirm button deletes the
project, so make it look destructive.

The component receives the props described by the `Props` interface. It
only needs to render; the input and the buttons do not need to work.
