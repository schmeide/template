// Amounts travel as integers: money in minor units (cents), quantities in thousandths, tax rates in
// basis points. These convert between those integers and the decimal text people read and type.

// Digits after the decimal point for a currency, from the platform's currency data.
export const currencyDigits = (currency: string): number =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;

export const formatMoney = (minor: number, currency: string, locale?: string): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minor / 10 ** currencyDigits(currency)
  );

// "12.5" at 2 places is 1250, exactly, with no floating point. Undefined when the text is not a
// number with at most `places` decimals.
// ponytail: accepts "." as the only decimal separator; parse by locale if users type "12,5".
export const parseScaled = (text: string, places: number): number | undefined => {
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text.trim());
  if (!match) return undefined;
  const [, sign, whole, fraction = ""] = match;
  if (whole === "" && fraction === "") return undefined;
  if (fraction.length > places) return undefined;
  const value = Number(whole + fraction.padEnd(places, "0"));
  if (!Number.isSafeInteger(value)) return undefined;
  return sign && value !== 0 ? -value : value;
};

// The decimal text for an integer at `places`, without trailing zeros: 1250 at 3 places is "1.25".
export const formatScaled = (value: number, places: number): string => {
  const digits = String(Math.abs(value)).padStart(places + 1, "0");
  const whole = digits.slice(0, digits.length - places);
  const fraction = digits.slice(digits.length - places).replace(/0+$/, "");
  return `${value < 0 ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
};
