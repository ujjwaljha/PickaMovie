export type Kind = "movie" | "series" | "anime" | "animation";

export type Pacing = "background" | "easy" | "engaged" | "demanding";

export type TimeSlot = "any" | "90min" | "evening" | "episode";

export type Energy = "any" | "focus" | "relaxed" | "emotional";

export type Company = "any" | "solo" | "date" | "group";

export type Filters = {
  time: TimeSlot;
  energy: Energy;
  company: Company;
};

/** Hand-tuned 0–100 fit for the mood questions. 100 means “this is the point.” */
export type Fits = {
  focus: number;
  relaxed: number;
  emotional: number;
  solo: number;
  date: number;
  group: number;
};

export type Title = {
  id: string;
  name: string;
  year: number;
  kind: Kind;
  creator: string;
  language: string;
  /** Other languages TMDB lists for this title. A listing can be a dub or subtitles. */
  listedIn?: string;
  synopsis: string;
  /** Original editorial lines for this shelf. Not quotations. */
  highlights: [string, string];
  vibeTags: string[];
  /** Editorial sample scores, 0–100. Not a live critic or audience feed. */
  critic: number;
  audience: number;
  pacing: Pacing;
  /** 1 is gentle, 10 is relentless. */
  intensity: number;
  episodeCount?: number;
  episodeMinutes?: number;
  /** Feature runtime, or listed season length in minutes. */
  runtimeMinutes: number;
  /** True when episode length is an average and the total is a planning figure. */
  approximate?: boolean;
  palette: [string, string];
  angle: number;
  mark: string;
  aliases: string[];
  fits: Fits;
  /** TMDB poster, only when it is an image.tmdb.org URL. */
  posterUrl?: string;
  /** Where TMDB lists this title in one country. A listing can change. */
  watch?: {
    region: string;
    stream: string[];
    rent: string[];
    buy: string[];
    link?: string;
  };
};
