// Reference implementation for the testimonial-grid brief: a full-width
// marketing section with a centred heading and equal cards. The cards fill
// as many columns as fit at a readable width.

interface Testimonial {
  id: string;
  quote: string;
  authorName: string;
  jobTitle: string;
  company: string;
  rating: number;
}

interface Props {
  heading: string;
  subheading: string;
  testimonials: Testimonial[];
}

const firstLetter = (word: string | undefined): string => (word ? (Array.from(word)[0] ?? '') : '').toUpperCase();

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return '?';
  return firstLetter(words[0]) + (words.length > 1 ? firstLetter(words[words.length - 1]) : '');
}

function Stars({ rating }: { rating: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={`size-5 ${star <= filled ? 'text-amber-400' : 'text-slate-200'}`}
        >
          <path
            fillRule="evenodd"
            d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z"
            clipRule="evenodd"
          />
        </svg>
      ))}
      <span className="sr-only">Rated {filled} out of 5</span>
    </div>
  );
}

export default function Testimonials({ heading, subheading, testimonials }: Props) {
  return (
    <section className="w-full bg-white px-4 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-balance text-slate-900 wrap-anywhere sm:text-4xl">
          {heading}
        </h2>
        {subheading ? (
          <p className="mt-4 text-lg leading-8 text-pretty text-slate-600 wrap-anywhere">{subheading}</p>
        ) : null}
      </div>

      {testimonials.length > 0 ? (
        <ul
          role="list"
          className="mx-auto mt-12 grid max-w-6xl grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-6"
        >
          {testimonials.map((testimonial) => {
            const byline = [testimonial.jobTitle, testimonial.company].filter((part) => part !== '').join(', ');
            return (
              <li key={testimonial.id} className="flex min-w-0">
                <figure className="flex w-full flex-col rounded-2xl bg-slate-50 p-6 ring-1 ring-slate-200">
                  <Stars rating={testimonial.rating} />
                  <blockquote className="mt-4 flex-1 text-base leading-7 text-slate-800 wrap-anywhere">
                    <p>“{testimonial.quote}”</p>
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-200 pt-5">
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700"
                    >
                      {initialsOf(testimonial.authorName)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 wrap-anywhere">{testimonial.authorName}</p>
                      {byline ? <p className="text-sm text-slate-500 wrap-anywhere">{byline}</p> : null}
                    </div>
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
