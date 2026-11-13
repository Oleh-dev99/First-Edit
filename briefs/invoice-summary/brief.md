# Invoice

Build the invoice that Fettlebook, an invoicing app for freelancers and
studios, shows a customer who opens the invoice link. It is a self-sized
panel in the middle of the page.

Show the invoice number with its issue and due dates. Then show who the
invoice is from and who it is billed to: each party's name and address.
List the line items with their description, quantity, unit price and
amount, followed by the subtotal, the tax with its label, and the total,
which should stand out. Amounts are in the given currency. Dates arrive
already formatted; show them as they are. End with the note and the pay
button, using the given label.

The component receives the props described by the `Props` interface. It
only needs to render; paying does not need to work.
