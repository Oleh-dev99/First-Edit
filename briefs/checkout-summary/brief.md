# Checkout order summary

Build the order summary for the last step of checkout at Thistlecombe,
an online store for outdoor clothing. It is a self-sized panel shown
beside the payment details.

Start with the summary title. List the items in the order: each shows
the product image, its name, the chosen variant, the quantity and the
price of the line. Below the items, show the promo code field with its
label, placeholder and apply button. Then show the subtotal, shipping,
tax and the total, which should stand out; amounts are in the given
currency. End with the note and the pay button, using the given label.

The component receives the props described by the `Props` interface. It
only needs to render; applying a code and paying do not need to work.
