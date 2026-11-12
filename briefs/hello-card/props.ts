/** Props for the hello-card brief: a user profile card. */
export interface HelloCardProps {
  /** Initials shown in the round avatar, for example "MO". */
  initials: string;
  /** The person's full name. */
  name: string;
  /** Job title shown under the name. */
  jobTitle: string;
  /** A short bio of one to three sentences. */
  bio: string;
}
