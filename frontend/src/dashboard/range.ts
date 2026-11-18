// Ranges are calendar days ("YYYY-MM-DD"), both days included. "Today" is the day in the browser's
// time zone, so "this month" is the viewer's month.

const pad = (value: number) => String(value).padStart(2, "0");

export const localDay = (date = new Date()): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// The last day of a month, by stepping back one day from the first of the next (month is 1-12).
const lastDay = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

export type Preset = {
  readonly key: "month" | "lastMonth" | "year";
  readonly label: string;
  readonly from: string;
  readonly to: string;
};

// This month and the year run to today; last month is the whole calendar month.
export const presets = (today: string): readonly Preset[] => {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const [lastYear, last] = month === 1 ? [year - 1, 12] : [year, month - 1];
  return [
    { key: "month", label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
    {
      key: "lastMonth",
      label: "Last month",
      from: `${lastYear}-${pad(last)}-01`,
      to: lastDay(lastYear, last),
    },
    { key: "year", label: "Year to date", from: `${year}-01-01`, to: today },
  ];
};
