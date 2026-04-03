/**
 * Locale-sensitive formatting utilities using the Intl API.
 * Critical for legal documents where date/number formatting
 * must match the locale conventions of the jurisdiction.
 */

/** Options for date formatting */
export interface DateFormatOptions {
  /** Predefined format style */
  readonly style?: "short" | "medium" | "long" | "full";
  /** Include time in the output */
  readonly includeTime?: boolean;
  /** Specific IANA timezone (e.g. "America/New_York") */
  readonly timeZone?: string;
}

/** Options for number formatting */
export interface NumberFormatOptions {
  /** Minimum fraction digits to display */
  readonly minimumFractionDigits?: number;
  /** Maximum fraction digits to display */
  readonly maximumFractionDigits?: number;
  /** Display style for the number */
  readonly style?: "decimal" | "percent";
  /** Use grouping separators (e.g. commas in English) */
  readonly useGrouping?: boolean;
}

/** Options for currency formatting */
export interface CurrencyFormatOptions {
  /** ISO 4217 currency code (e.g. "USD", "EUR", "CNY", "SAR") */
  readonly currency: string;
  /** How to display the currency (symbol, code, or name) */
  readonly display?: "symbol" | "code" | "name" | "narrowSymbol";
}

/**
 * Maps DateFormatOptions.style to Intl.DateTimeFormat options.
 */
function getDateTimeFormatOptions(
  options: DateFormatOptions,
): Intl.DateTimeFormatOptions {
  const timeZone = options.timeZone;

  const baseOptions: Record<string, Intl.DateTimeFormatOptions> = {
    short: {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    },
    medium: {
      year: "numeric",
      month: "short",
      day: "numeric",
    },
    long: {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
    full: {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    },
  };

  const style = options.style ?? "medium";
  const dateOptions: Intl.DateTimeFormatOptions = {
    ...baseOptions[style],
  };

  if (timeZone !== undefined) {
    dateOptions.timeZone = timeZone;
  }

  if (options.includeTime === true) {
    dateOptions.hour = "numeric";
    dateOptions.minute = "numeric";
    dateOptions.second = "numeric";
  }

  return dateOptions;
}

/**
 * Formats a date according to the given locale's conventions.
 * Legally significant: court documents require locale-appropriate date formats.
 *
 * @param date - The date to format (Date object, timestamp number, or ISO string)
 * @param locale - BCP 47 language tag (e.g. "en", "ar", "zh")
 * @param options - Formatting options
 * @returns Formatted date string
 *
 * @example
 * ```ts
 * formatDate(new Date(), "en")       // "Apr 3, 2026"
 * formatDate(new Date(), "ar")       // "٣ أبريل ٢٠٢٦"
 * formatDate(new Date(), "zh")       // "2026年4月3日"
 * formatDate(new Date(), "en", { style: "full", includeTime: true })
 * // "Friday, April 3, 2026, 10:30:00 AM"
 * ```
 */
export function formatDate(
  date: Date | number | string,
  locale: string,
  options: DateFormatOptions = {},
): string {
  const dateObj = date instanceof Date ? date : new Date(date);
  const formatOptions = getDateTimeFormatOptions(options);
  return new Intl.DateTimeFormat(locale, formatOptions).format(dateObj);
}

/**
 * Formats a date range according to the given locale's conventions.
 *
 * @param start - Start date
 * @param end - End date
 * @param locale - BCP 47 language tag
 * @param options - Formatting options
 * @returns Formatted date range string
 */
export function formatDateRange(
  start: Date | number | string,
  end: Date | number | string,
  locale: string,
  options: DateFormatOptions = {},
): string {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  const formatOptions = getDateTimeFormatOptions(options);
  const formatter = new Intl.DateTimeFormat(locale, formatOptions);
  return formatter.formatRange(startDate, endDate);
}

/**
 * Formats a number according to the given locale's conventions.
 *
 * @param value - The number to format
 * @param locale - BCP 47 language tag
 * @param options - Formatting options
 * @returns Formatted number string
 *
 * @example
 * ```ts
 * formatNumber(1234567.89, "en")  // "1,234,567.89"
 * formatNumber(1234567.89, "ar")  // "١٬٢٣٤٬٥٦٧٫٨٩"
 * formatNumber(1234567.89, "zh")  // "1,234,567.89"
 * formatNumber(0.75, "en", { style: "percent" })  // "75%"
 * ```
 */
export function formatNumber(
  value: number,
  locale: string,
  options: NumberFormatOptions = {},
): string {
  const intlOptions: Intl.NumberFormatOptions = {
    style: options.style ?? "decimal",
  };

  if (options.minimumFractionDigits !== undefined) {
    intlOptions.minimumFractionDigits = options.minimumFractionDigits;
  }
  if (options.maximumFractionDigits !== undefined) {
    intlOptions.maximumFractionDigits = options.maximumFractionDigits;
  }
  if (options.useGrouping !== undefined) {
    intlOptions.useGrouping = options.useGrouping;
  }

  return new Intl.NumberFormat(locale, intlOptions).format(value);
}

/**
 * Formats a currency value according to the given locale's conventions.
 *
 * @param value - The monetary amount to format
 * @param locale - BCP 47 language tag
 * @param options - Currency formatting options (currency code is required)
 * @returns Formatted currency string
 *
 * @example
 * ```ts
 * formatCurrency(1234.56, "en", { currency: "USD" })  // "$1,234.56"
 * formatCurrency(1234.56, "ar", { currency: "SAR" })   // "١٬٢٣٤٫٥٦ ر.س.‏"
 * formatCurrency(1234.56, "zh", { currency: "CNY" })   // "\u00A51,234.56"
 * ```
 */
export function formatCurrency(
  value: number,
  locale: string,
  options: CurrencyFormatOptions,
): string {
  const intlOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency: options.currency,
    currencyDisplay: options.display ?? "symbol",
  };

  return new Intl.NumberFormat(locale, intlOptions).format(value);
}

/**
 * Formats a relative time (e.g. "3 days ago", "in 2 hours")
 * according to the given locale's conventions.
 *
 * @param value - The numeric value (negative for past, positive for future)
 * @param unit - The time unit
 * @param locale - BCP 47 language tag
 * @returns Formatted relative time string
 *
 * @example
 * ```ts
 * formatRelativeTime(-3, "day", "en")   // "3 days ago"
 * formatRelativeTime(-3, "day", "ar")   // "قبل ٣ أيام"
 * formatRelativeTime(2, "hour", "zh")   // "2小时后"
 * ```
 */
export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: string,
): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    value,
    unit,
  );
}

/**
 * Returns the locale-appropriate list formatting.
 *
 * @param items - Array of strings to join
 * @param locale - BCP 47 language tag
 * @param type - List type: "conjunction" (and), "disjunction" (or), or "unit"
 * @returns Formatted list string
 *
 * @example
 * ```ts
 * formatList(["Alice", "Bob", "Charlie"], "en")  // "Alice, Bob, and Charlie"
 * formatList(["Alice", "Bob", "Charlie"], "ar")   // "Alice وBob وCharlie"
 * formatList(["Alice", "Bob", "Charlie"], "zh")   // "Alice、Bob和Charlie"
 * ```
 */
export function formatList(
  items: readonly string[],
  locale: string,
  type: "conjunction" | "disjunction" | "unit" = "conjunction",
): string {
  return new Intl.ListFormat(locale, { style: "long", type }).format(items);
}
