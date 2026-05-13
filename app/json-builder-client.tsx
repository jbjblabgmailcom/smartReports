"use client";

import { ChangeEvent, useMemo, useState } from "react";
import {
  buildReducedRows,
  displayRecordValue,
  featureLabel,
  normalizeLoadedRecords,
  rowsToCsv,
  selectableColumns,
  type JsonRecord,
  type LoadedJsonFile,
  type SourceRecord
} from "@/lib/json-builder";

type SortState = {
  column: string;
  direction: "asc" | "desc";
} | null;

const defaultLabelKeys = "TolLbl, TolName, Nominal, UpperTol, LowerTol";

function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function compareValues(a: string, b: string) {
  const left = Number(a);
  const right = Number(b);
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return left - right;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export default function JsonBuilderClient() {
  const [files, setFiles] = useState<LoadedJsonFile[]>([]);
  const [labelKeys, setLabelKeys] = useState(defaultLabelKeys);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [reportRows, setReportRows] = useState<SourceRecord[]>([]);
  const [reportColumns, setReportColumns] = useState<string[]>([]);
  const [sortState, setSortState] = useState<SortState>(null);
  const [status, setStatus] = useState("Ready");

  const records = useMemo(() => normalizeLoadedRecords(files), [files]);
  const columns = useMemo(() => selectableColumns(records), [records]);

  const rowsByFile = useMemo(
    () =>
      files.map((file) => ({
        id: file.id,
        name: file.name,
        rows: records.filter((record) => record._source_file === file.name)
      })),
    [files, records]
  );

  const sortedReportRows = useMemo(() => {
    if (!sortState) {
      return reportRows;
    }
    return [...reportRows].sort((a, b) => {
      const direction = sortState.direction === "asc" ? 1 : -1;
      const aValue = sortState.column === "File" ? a._source_file : displayRecordValue(a, sortState.column);
      const bValue = sortState.column === "File" ? b._source_file : displayRecordValue(b, sortState.column);
      return compareValues(aValue, bValue) * direction;
    });
  }, [reportRows, sortState]);

  async function loadJsonFiles(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) {
      return;
    }

    const nextFiles: LoadedJsonFile[] = [];
    for (const file of selectedFiles) {
      try {
        const parsed = JSON.parse(await file.text()) as unknown;
        if (Array.isArray(parsed)) {
          nextFiles.push({
            id: `${file.name}:${file.lastModified}:${file.size}`,
            name: file.name,
            records: parsed.filter((item): item is JsonRecord => item !== null && typeof item === "object" && !Array.isArray(item))
          });
        } else if (parsed !== null && typeof parsed === "object") {
          nextFiles.push({
            id: `${file.name}:${file.lastModified}:${file.size}`,
            name: file.name,
            records: [parsed as JsonRecord]
          });
        } else {
          setStatus(`${file.name}: skipped because the JSON root is not an object or array.`);
        }
      } catch (error) {
        setStatus(`${file.name}: ${(error as Error).message}`);
      }
    }

    const mergedFiles = [...files.filter((file) => !nextFiles.some((nextFile) => nextFile.name === file.name)), ...nextFiles];
    const nextRecords = normalizeLoadedRecords(mergedFiles);
    const nextColumns = selectableColumns(nextRecords);
    setFiles(mergedFiles);
    setSelectedRecordIds(new Set(nextRecords.map((record) => record._record_id)));
    setSelectedColumns(new Set(nextColumns));
    setReportRows([]);
    setReportColumns([]);
    setSortState(null);
    setStatus(`${nextRecords.length} records loaded from ${mergedFiles.length} file(s).`);
    event.target.value = "";
  }

  function removeFile(fileName: string) {
    const nextFiles = files.filter((file) => file.name !== fileName);
    const nextRecords = normalizeLoadedRecords(nextFiles);
    const nextColumns = selectableColumns(nextRecords);
    setFiles(nextFiles);
    setSelectedRecordIds(new Set(nextRecords.map((record) => record._record_id)));
    setSelectedColumns(new Set(nextColumns));
    setReportRows([]);
    setReportColumns([]);
    setStatus(`${nextRecords.length} records across ${nextFiles.length} file(s).`);
  }

  function toggleRecord(recordId: string) {
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  }

  function toggleColumn(column: string) {
    setSelectedColumns((current) => {
      const next = new Set(current);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  }

  function generateReport() {
    const nextColumns = columns.filter((column) => selectedColumns.has(column));
    if (!selectedRecordIds.size) {
      setStatus("Please check at least one feature.");
      return;
    }
    if (!nextColumns.length) {
      setStatus("Please check at least one column.");
      return;
    }
    const nextRows = records.filter((record) => selectedRecordIds.has(record._record_id));
    setReportColumns(["File", ...nextColumns]);
    setReportRows(nextRows);
    setSortState(null);
    setStatus(`Report: ${nextRows.length} row(s).`);
  }

  function exportReportCsv() {
    if (!reportRows.length || !reportColumns.length) {
      setStatus("Generate a report first.");
      return;
    }
    const csvRows = [
      reportColumns,
      ...sortedReportRows.map((record) =>
        reportColumns.map((column) => (column === "File" ? record._source_file : displayRecordValue(record, column)))
      )
    ];
    downloadCsv("json-builder-report.csv", rowsToCsv(csvRows));
    setStatus("Report CSV exported.");
  }

  function exportReducedCsv() {
    try {
      const reduced = buildReducedRows(records);
      const csvRows = [
        ["TolLbl", "Nominal", "ActualMin", "ActualMax"],
        ...reduced.rows.map((row) => [row.TolLbl, row.Nominal, row.ActualMin, row.ActualMax])
      ];
      downloadCsv("json-builder-reduced.csv", rowsToCsv(csvRows));
      setStatus(`Reduced CSV exported: ${reduced.rows.length} labels processed from ${reduced.columns.join(", ")}.`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  function sortBy(column: string) {
    setSortState((current) => {
      if (current?.column !== column) {
        return { column, direction: "asc" };
      }
      return { column, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  }

  return (
    <>
      <section className="toolbar">
        <label className="file-picker">
          <span>Load JSON files</span>
          <input accept=".json,application/json" multiple onChange={loadJsonFiles} type="file" />
        </label>
        <button className="secondary-button" onClick={() => setSelectedRecordIds(new Set(records.map((record) => record._record_id)))} type="button">
          All features
        </button>
        <button className="secondary-button" onClick={() => setSelectedRecordIds(new Set())} type="button">
          No features
        </button>
        <button className="primary-button" onClick={generateReport} type="button">
          Generate report
        </button>
        <button className="secondary-button" onClick={exportReportCsv} type="button">
          Export CSV
        </button>
        <button className="secondary-button" onClick={exportReducedCsv} type="button">
          Process reduced CSV
        </button>
        <div className="status">{status}</div>
      </section>

      <section className="json-builder-grid">
        <aside className="json-side-panel">
          <div className="panel-heading">
            <h2>Loaded files</h2>
            <span>{files.length || "None"}</span>
          </div>
          <div className="file-list">
            {files.map((file) => (
              <div className="file-row" key={file.id}>
                <div>
                  <strong>{file.name}</strong>
                  <small>{file.records.length} records</small>
                </div>
                <button aria-label={`Remove ${file.name}`} className="icon-button" onClick={() => removeFile(file.name)} type="button">
                  X
                </button>
              </div>
            ))}
            {!files.length ? <div className="empty-list">No JSON files loaded.</div> : null}
          </div>

          <label className="label-keys">
            Feature label keys
            <input value={labelKeys} onChange={(event) => setLabelKeys(event.target.value)} />
          </label>
        </aside>

        <section className="json-panel features-panel">
          <div className="panel-heading">
            <h2>Features</h2>
            <span>{selectedRecordIds.size}/{records.length} selected</span>
          </div>
          <div className="check-list">
            {rowsByFile.map((file) => (
              <div className="check-group" key={file.id}>
                <div className="check-group-heading">{file.name}</div>
                {file.rows.map((record) => (
                  <label className="check-row" key={record._record_id}>
                    <input checked={selectedRecordIds.has(record._record_id)} onChange={() => toggleRecord(record._record_id)} type="checkbox" />
                    <span>{featureLabel(record, labelKeys)}</span>
                  </label>
                ))}
              </div>
            ))}
            {!records.length ? <div className="empty-list">Load JSON files to choose features.</div> : null}
          </div>
        </section>

        <aside className="json-side-panel">
          <div className="panel-heading">
            <h2>Columns</h2>
            <span>{selectedColumns.size}/{columns.length}</span>
          </div>
          <div className="check-list compact">
            {columns.map((column) => (
              <label className="check-row" key={column}>
                <input checked={selectedColumns.has(column)} onChange={() => toggleColumn(column)} type="checkbox" />
                <span>{column}</span>
              </label>
            ))}
            {!columns.length ? <div className="empty-list">No supported columns detected.</div> : null}
          </div>
        </aside>
      </section>

      <section className="results-panel">
        <div className="panel-heading">
          <h2>Report</h2>
          <span>{reportRows.length ? `${reportRows.length} row(s)` : "Generate a report to see results"}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {reportColumns.map((column) => (
                  <th key={column}>
                    <button className="table-sort-button" onClick={() => sortBy(column)} type="button">
                      {column}
                      {sortState?.column === column ? (sortState.direction === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedReportRows.map((record) => (
                <tr key={record._record_id}>
                  {reportColumns.map((column) => (
                    <td key={column}>{column === "File" ? record._source_file : displayRecordValue(record, column)}</td>
                  ))}
                </tr>
              ))}
              {!sortedReportRows.length ? (
                <tr>
                  <td className="empty-state" colSpan={Math.max(reportColumns.length, 1)}>
                    Load JSON files, choose features and columns, then generate a report.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
