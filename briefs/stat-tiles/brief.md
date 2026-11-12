# Metric tiles

Build the set of key metric tiles at the top of the analytics dashboard
for Fernhollow Goods, an online homeware store. It is a full-width section
of the dashboard page.

Show the section title and the period label. Then show one tile per
metric. Each tile shows the metric's label, its value formatted according
to its format (an amount in the given currency, a percentage or a plain
count), the change against the previous period as a percentage with a
clear up or down signal, and the caption. Values arrive as raw numbers;
percentages and changes are fractions, so 0.034 means 3.4%.

The component receives the props described by the `Props` interface. It
only needs to render.
