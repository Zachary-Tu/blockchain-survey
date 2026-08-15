export type CsvValue = string | number | boolean | null | undefined;

export type CsvColumn<Row> = {
  key: string;
  value: (row: Row) => CsvValue;
};

function escapeCsvCell(value: CsvValue) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildCsv<Row>(rows: Row[], columns: CsvColumn<Row>[]) {
  const header = columns.map((column) => escapeCsvCell(column.key)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvCell(column.value(row))).join(","),
  );
  return `\uFEFF${[header, ...body].join("\r\n")}`;
}
