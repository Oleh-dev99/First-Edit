/** A section of customer testimonials on a marketing page. */
export interface Props {
  heading: string;
  /** Shown under the heading. */
  subheading: string;
  testimonials: Testimonial[];
}

export interface Testimonial {
  id: string;
  quote: string;
  authorName: string;
  jobTitle: string;
  company: string;
  /** From 1 to 5 stars. */
  rating: number;
}
