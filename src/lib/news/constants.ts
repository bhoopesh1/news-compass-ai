export const REGIONS = [
  { id: "global", label: "Global" },
  { id: "in", label: "India" },
  { id: "us", label: "United States" },
  { id: "gb", label: "United Kingdom" },
  { id: "me", label: "Middle East" },
  { id: "eu", label: "Europe" },
  { id: "ap", label: "Asia Pacific" },
] as const;

export const LANGUAGES = [
  { id: "en", label: "English", native: "English" },
  { id: "hi", label: "Hindi", native: "हिंदी" },
  { id: "ta", label: "Tamil", native: "தமிழ்" },
  { id: "es", label: "Spanish", native: "Español" },
  { id: "fr", label: "French", native: "Français" },
  { id: "ar", label: "Arabic", native: "العربية" },
] as const;

export const CATEGORIES = [
  { id: "general", label: "Top Stories" },
  { id: "business", label: "Business" },
  { id: "technology", label: "Technology" },
  { id: "science", label: "Science" },
  { id: "health", label: "Health" },
  { id: "sports", label: "Sports" },
  { id: "entertainment", label: "Entertainment" },
] as const;

export const TIME_RANGES = [
  { id: "1h", label: "Last hour", hours: 1 },
  { id: "24h", label: "Past 24h", hours: 24 },
  { id: "7d", label: "Past week", hours: 24 * 7 },
  { id: "30d", label: "Past month", hours: 24 * 30 },
  { id: "all", label: "All time", hours: 0 },
] as const;

export type RegionId = (typeof REGIONS)[number]["id"];
export type LanguageId = (typeof LANGUAGES)[number]["id"];
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export type TimeRangeId = (typeof TIME_RANGES)[number]["id"];
