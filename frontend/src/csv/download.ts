// Saves `csv` as a file named `name` through a temporary link, without a server round trip.
export const downloadCsv = (csv: string, name: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
