export const WATCH_REGIONS = [
  { code: "US", name: "United States" },
  { code: "IN", name: "India" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SG", name: "Singapore" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "PH", name: "Philippines" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "NZ", name: "New Zealand" },
  { code: "TR", name: "Turkey" },
  { code: "AR", name: "Argentina" },
] as const;

export type WatchRegion = (typeof WATCH_REGIONS)[number]["code"];

const NAMES = new Map<string, string>(WATCH_REGIONS.map((region) => [region.code, region.name]));

export function regionName(code: string): string {
  return NAMES.get(code) ?? code;
}

export function regionFromLocale(locale: string): WatchRegion {
  const match = /[-_]([A-Za-z]{2})\b/.exec(locale);
  const code = match?.[1]?.toUpperCase() ?? "";
  const found = WATCH_REGIONS.find((region) => region.code === code);
  return found ? found.code : "US";
}

export function watchLine(watch: { region: string; stream: readonly string[]; rent: readonly string[]; buy: readonly string[] }): string {
  const place = regionName(watch.region);
  if (watch.stream.length > 0) return `Stream on ${watch.stream.join(", ")} in ${place}`;
  const parts: string[] = [];
  if (watch.rent.length > 0) parts.push(`Rent on ${watch.rent.join(", ")}`);
  if (watch.buy.length > 0) parts.push(`Buy on ${watch.buy.join(", ")}`);
  if (parts.length > 0) return `${parts.join(" · ")} in ${place}`;
  return `No streaming listing in ${place}`;
}
