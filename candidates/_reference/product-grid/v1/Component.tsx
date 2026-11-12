// Reference implementation for the product-grid brief.

interface ProductImage {
  src: string;
  alt: string;
}

interface Product {
  id: string;
  name: string;
  image: ProductImage;
  price: number;
  originalPrice?: number;
  rating: number;
  reviewCount: number;
  tags: string[];
  ctaLabel: string;
}

interface Props {
  heading: string;
  resultsSummary: string;
  currency: string;
  products: Product[];
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const count = new Intl.NumberFormat('en-US');

function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={`size-4 shrink-0 ${filled ? 'text-amber-400' : 'text-slate-200'}`}>
      <path
        fillRule="evenodd"
        d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ProductCard({ product, currency }: { product: Product; currency: string }) {
  const { name, image, price, originalPrice, rating, reviewCount, tags, ctaLabel } = product;
  const stars = Math.round(Math.min(Math.max(rating, 0), 5));
  return (
    <li className="flex min-w-0 flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="aspect-square overflow-hidden rounded-t-xl bg-slate-100">
        <img src={image.src} alt={image.alt} className="size-full object-cover" />
      </div>
      <div className="flex flex-1 flex-col p-4">
        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((tag, index) => (
              <li key={index} className="min-w-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 wrap-anywhere">
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
        <h3 className="mt-3 text-sm font-semibold text-slate-900 wrap-anywhere">{name}</h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
          <span className="flex" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((index) => (
              <Star key={index} filled={index < stars} />
            ))}
          </span>
          <span className="font-medium text-slate-700">
            <span className="sr-only">Rated </span>
            {rating.toFixed(1)}
          </span>
          <span className="min-w-0 tabular-nums wrap-anywhere">({count.format(reviewCount)} reviews)</span>
        </p>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
          <span className="min-w-0 text-base font-semibold text-slate-900 tabular-nums wrap-anywhere">
            {formatPrice(price, currency)}
          </span>
          {originalPrice !== undefined ? (
            <s className="min-w-0 text-sm text-slate-500 tabular-nums wrap-anywhere">{formatPrice(originalPrice, currency)}</s>
          ) : null}
        </p>
        <div className="mt-auto pt-4">
          <button
            type="button"
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 wrap-anywhere"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </li>
  );
}

export default function ProductGrid({ heading, resultsSummary, currency, products }: Props) {
  return (
    <section className="w-full">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="min-w-0 text-2xl font-bold tracking-tight text-slate-900 wrap-anywhere">{heading}</h2>
        {resultsSummary ? <p className="min-w-0 text-sm text-slate-500 wrap-anywhere">{resultsSummary}</p> : null}
      </div>
      <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} currency={currency} />
        ))}
      </ul>
    </section>
  );
}
