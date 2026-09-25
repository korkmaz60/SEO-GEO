/**
 * Search markets offered for projects and prompts. Codes are DataForSEO location codes
 * (Google geo target IDs; for countries 2000 + the ISO 3166-1 numeric code).
 */
export interface Market {
  locationCode: number;
  countryCode: string;
  languageCode: string;
  names: { tr: string; en: string };
}

export const MARKETS: Market[] = [
  {
    locationCode: 2792,
    countryCode: "TR",
    languageCode: "tr",
    names: { tr: "Türkiye", en: "Türkiye" },
  },
  {
    locationCode: 2840,
    countryCode: "US",
    languageCode: "en",
    names: { tr: "Amerika Birleşik Devletleri", en: "United States" },
  },
  {
    locationCode: 2826,
    countryCode: "GB",
    languageCode: "en",
    names: { tr: "Birleşik Krallık", en: "United Kingdom" },
  },
  {
    locationCode: 2276,
    countryCode: "DE",
    languageCode: "de",
    names: { tr: "Almanya", en: "Germany" },
  },
  {
    locationCode: 2250,
    countryCode: "FR",
    languageCode: "fr",
    names: { tr: "Fransa", en: "France" },
  },
  {
    locationCode: 2528,
    countryCode: "NL",
    languageCode: "nl",
    names: { tr: "Hollanda", en: "Netherlands" },
  },
  {
    locationCode: 2724,
    countryCode: "ES",
    languageCode: "es",
    names: { tr: "İspanya", en: "Spain" },
  },
  {
    locationCode: 2380,
    countryCode: "IT",
    languageCode: "it",
    names: { tr: "İtalya", en: "Italy" },
  },
  {
    locationCode: 2616,
    countryCode: "PL",
    languageCode: "pl",
    names: { tr: "Polonya", en: "Poland" },
  },
  {
    locationCode: 2031,
    countryCode: "AZ",
    languageCode: "az",
    names: { tr: "Azerbaycan", en: "Azerbaijan" },
  },
  {
    locationCode: 2682,
    countryCode: "SA",
    languageCode: "ar",
    names: { tr: "Suudi Arabistan", en: "Saudi Arabia" },
  },
  {
    locationCode: 2784,
    countryCode: "AE",
    languageCode: "en",
    names: { tr: "Birleşik Arap Emirlikleri", en: "United Arab Emirates" },
  },
  {
    locationCode: 2124,
    countryCode: "CA",
    languageCode: "en",
    names: { tr: "Kanada", en: "Canada" },
  },
  {
    locationCode: 2036,
    countryCode: "AU",
    languageCode: "en",
    names: { tr: "Avustralya", en: "Australia" },
  },
  {
    locationCode: 2356,
    countryCode: "IN",
    languageCode: "en",
    names: { tr: "Hindistan", en: "India" },
  },
  {
    locationCode: 2076,
    countryCode: "BR",
    languageCode: "pt",
    names: { tr: "Brezilya", en: "Brazil" },
  },
  {
    locationCode: 2484,
    countryCode: "MX",
    languageCode: "es",
    names: { tr: "Meksika", en: "Mexico" },
  },
  {
    locationCode: 2392,
    countryCode: "JP",
    languageCode: "ja",
    names: { tr: "Japonya", en: "Japan" },
  },
];

export function findMarket(locationCode: number): Market | undefined {
  return MARKETS.find((market) => market.locationCode === locationCode);
}
