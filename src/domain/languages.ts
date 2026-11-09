export const CATALOG_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "ml", name: "Malayalam" },
  { code: "kn", name: "Kannada" },
  { code: "bn", name: "Bengali" },
  { code: "mr", name: "Marathi" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "ar", name: "Arabic" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
  { code: "th", name: "Thai" },
  { code: "ru", name: "Russian" },
] as const;

export type CatalogLanguage = (typeof CATALOG_LANGUAGES)[number]["code"];
export type AudioMatch = "original" | "listed";

const NAMES = new Map<string, string>(CATALOG_LANGUAGES.map((language) => [language.code, language.name]));

export function languageName(code: string): string {
  return NAMES.get(code) ?? code.toUpperCase();
}
