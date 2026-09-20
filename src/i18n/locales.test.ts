import { describe, expect, it } from "vitest";
import ru from "./locales/ru.json";
import en from "./locales/en.json";
import pt from "./locales/pt.json";

// i18next plural keys (e.g. "people_one", "people_few") legitimately differ
// in which CLDR plural forms exist per language — Russian has one/few/many,
// English/Portuguese have one/other. Strip the suffix so we compare the
// underlying key ("people"), not the plural form.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function leafKeyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix.replace(PLURAL_SUFFIX, "")];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    leafKeyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n locale files", () => {
  const locales = { ru, en, pt };
  const keysByLocale = Object.fromEntries(
    Object.entries(locales).map(([code, dict]) => [code, new Set(leafKeyPaths(dict))]),
  ) as Record<string, Set<string>>;

  it("has at least one translation key", () => {
    expect(keysByLocale.ru.size).toBeGreaterThan(0);
  });

  for (const [code, keys] of Object.entries(keysByLocale)) {
    if (code === "ru") continue;

    it(`${code}.json has exactly the same keys as ru.json`, () => {
      const missing = [...keysByLocale.ru].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !keysByLocale.ru.has(k));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });
  }
});
