# Recent orders table

Build the recent orders panel for the admin dashboard of an online store.
It is a full-width section of the dashboard page that the store team uses
to keep an eye on the latest orders.

Show the panel title and the summary line under it. Then show the orders
as a table with one row per order and these columns: order number,
customer (name and email), payment status, date, and amount in the given
currency. The status is one of paid, pending, refunded or failed; give
each status a distinct look so that problems stand out at a glance. Dates
arrive already formatted; show them as they are.

The component receives the props described by the `Props` interface. It
only needs to render the data; sorting, filtering and row actions are not
needed.
