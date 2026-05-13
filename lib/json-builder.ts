export type JsonValue = string | number | boolean | null | JsonRecord | JsonValue[];

export type JsonRecord = {
  [key: string]: JsonValue;
};

export type LoadedJsonFile = {
  id: string;
  name: string;
  records: JsonRecord[];
};

export type SourceRecord = JsonRecord & {
  _source_file: string;
  _record_id: string;
};

export type ReducedRow = {
  TolLbl: number;
  Nominal: JsonValue | "";
  ActualMin: number | "";
  ActualMax: number | "";
};

const desiredColumnOrder = ["TolLbl", "TolName", "Nominal", "UpperTol", "LowerTol", "Actual", "TolStatus"];

export function normalizeLoadedRecords(files: LoadedJsonFile[]): SourceRecord[] {
  return files.flatMap((file) =>
    file.records.map((record, index) => ({
      ...record,
      _source_file: file.name,
      _record_id: `${file.id}:${index}`
    }))
  );
}

export function selectableColumns(records: SourceRecord[]): string[] {
  const existing = new Set<string>();
  records.forEach((record) => {
    Object.keys(record).forEach((key) => existing.add(key));
  });
  return desiredColumnOrder.filter((key) => existing.has(key));
}

export function featureLabel(record: JsonRecord, labelKeys: string): string {
  const parts = labelKeys
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
    .filter((key) => key in record)
    .map((key) => displayJsonValue(record[key]));

  return parts.length ? parts.join(" | ") : JSON.stringify(record);
}

export function displayJsonValue(value: JsonValue | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function hasLowerTolerance(record: JsonRecord): boolean {
  return "LowerTol" in record && record.LowerTol !== null && record.LowerTol !== "";
}

export function effectiveNominal(record: JsonRecord): JsonValue | "" {
  if (!hasLowerTolerance(record) && record.UpperTol !== undefined && record.UpperTol !== null && record.UpperTol !== "") {
    return record.UpperTol;
  }
  return record.Nominal ?? "";
}

export function displayRecordValue(record: JsonRecord, column: string): string {
  if (column === "Nominal") {
    return displayJsonValue(effectiveNominal(record));
  }
  return displayJsonValue(record[column]);
}

export function csvEscape(value: JsonValue | string | number): string {
  const text = displayJsonValue(value as JsonValue);
  const escaped = text.replaceAll('"', '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function rowsToCsv(rows: Array<Array<JsonValue | string | number>>): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function findColumn(columns: string[], target: string): string | null {
  const needle = target.toLowerCase();
  return columns.find((column) => column.toLowerCase().replaceAll(" ", "").replaceAll("_", "").includes(needle)) || null;
}

export function buildReducedRows(records: SourceRecord[]): { rows: ReducedRow[]; columns: [string, string, string] } {
  if (!records.length) {
    throw new Error("Please load JSON files first.");
  }

  const columns = Array.from(new Set(records.flatMap((record) => Object.keys(record).map((key) => key.trim()))));
  const tolColumn = findColumn(columns, "tollbl");
  const nominalColumn = findColumn(columns, "nominal");
  const upperTolColumn = findColumn(columns, "uppertol");
  const actualColumn = findColumn(columns, "actual");

  if (!tolColumn || (!nominalColumn && !upperTolColumn) || !actualColumn) {
    throw new Error(
      `Required columns (TolLbl, Nominal or UpperTol, Actual) not detected. Found: ${tolColumn}, ${nominalColumn || upperTolColumn}, ${actualColumn}`
    );
  }

  const grouped = new Map<number, { nominal: JsonValue | ""; min: number; max: number }>();

  records.forEach((record) => {
    const tolValue = Number(record[tolColumn]);
    if (!Number.isFinite(tolValue)) {
      return;
    }

    const actualValue = Number(record[actualColumn]);
    const current = grouped.get(tolValue);
    if (!current) {
      grouped.set(tolValue, {
        nominal: effectiveNominal(record),
        min: Number.isFinite(actualValue) ? actualValue : Number.NaN,
        max: Number.isFinite(actualValue) ? actualValue : Number.NaN
      });
      return;
    }

    if (Number.isFinite(actualValue)) {
      current.min = Number.isFinite(current.min) ? Math.min(current.min, actualValue) : actualValue;
      current.max = Number.isFinite(current.max) ? Math.max(current.max, actualValue) : actualValue;
    }
  });

  const maxLabel = Math.max(...Array.from(grouped.keys()));
  if (!Number.isFinite(maxLabel)) {
    throw new Error("No numeric TolLbl values were found.");
  }

  const rows: ReducedRow[] = [];
  for (let label = 1; label <= Math.trunc(maxLabel); label += 1) {
    const group = grouped.get(label);
    rows.push({
      TolLbl: label,
      Nominal: group?.nominal ?? "",
      ActualMin: group && Number.isFinite(group.min) ? group.min : "",
      ActualMax: group && Number.isFinite(group.max) ? group.max : ""
    });
  }

  return { rows, columns: [tolColumn, nominalColumn || upperTolColumn || "UpperTol", actualColumn] };
}
