/** Props for the hello-card brief: a user profile card. */
export interface Props {
  /** The person's full name. May be empty. */
  name: string;
  /** Job title shown under the name. */
  jobTitle: string;
  /** A short bio of one to three sentences. */
  bio: string;
  /** Number of followers, shown formatted. */
  followers: number;
  /** Skill tags, usually about five. */
  skills: string[];
}
