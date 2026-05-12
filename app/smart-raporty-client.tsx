"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDecimal, matchAll, resultRowValues } from "@/lib/matcher";
import { measurementDisplay, parseBalloonText, parseRptFiles } from "@/lib/parser";
import type { MatchResult, Measurement, Rules } from "@/lib/types";

type ReportFile = {
  name: string;
  content: string;
};

export default function SmartRaportyClient({ initialRules }: { initialRules: Rules }) {
  const router = useRouter();
  const firstHint = Object.keys(initialRules).sort()[0] || "";
  const [reportFiles, setReportFiles] = useState<ReportFile[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [balloonText, setBalloonText] = useState("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [rules, setRules] = useState<Rules>(initialRules);
  const [selectedHint, setSelectedHint] = useState(firstHint);
  const [hintInput, setHintInput] = useState(firstHint);
  const [targetsInput, setTargetsInput] = useState((initialRules[firstHint] || []).join(", "));
  const [status, setStatus] = useState("Ready");
  const [query, setQuery] = useState("");
  const [showRules, setShowRules] = useState(false);

  const foundCount = results.filter((result) => result.matches.length).length;
  const filteredResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return results;
    }
    return results.filter((result) => {
      const matchText = result.matches.map(measurementDisplay).join(" ");
      return `${result.balloon.hint} ${result.balloon.number} ${result.balloon.rawText} ${result.reason} ${matchText}`
        .toLowerCase()
        .includes(needle);
    });
  }, [query, results]);

  async function loadReports(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    const loaded = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        content: await file.text()
      }))
    );
    const parsed = parseRptFiles(loaded);
    setReportFiles(loaded);
    setMeasurements(parsed);
    setResults([]);
    setStatus(`${loaded.length} files, ${parsed.length} measurements loaded`);
  }

  function analyze() {
    if (!measurements.length) {
      setStatus("Load at least one .rpt file first.");
      return;
    }

    const balloons = parseBalloonText(balloonText);
    if (!balloons.length) {
      setStatus("Paste balloon data first.");
      return;
    }

    const nextResults = matchAll(balloons, measurements, rules);
    setResults(nextResults);
    setStatus(`Done: ${nextResults.filter((result) => result.matches.length).length}/${nextResults.length} balloons matched`);
  }

  function exportCsv() {
    if (!results.length) {
      setStatus("Analyze data before exporting.");
      return;
    }

    const rows = [["Balloon", "Nominal", "Min", "Max"], ...results.map(resultRowValues)];
    const csv = rows
      .map((row) =>
        row
          .map((value) => {
            const escaped = value.replaceAll('"', '""');
            return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
          })
          .join(",")
      )
      .join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "smart-raporty-results.csv";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("CSV exported.");
  }

  function loadRule(hint: string) {
    setSelectedHint(hint);
    setHintInput(hint);
    setTargetsInput((rules[hint] || []).join(", "));
  }

  async function saveRule() {
    const hint = hintInput.trim().toUpperCase();
    if (!hint) {
      setStatus("Enter a hint name.");
      return;
    }
    const nextRules = {
      ...rules,
      [hint]: targetsInput
        .split(",")
        .map((target) => target.trim())
        .filter(Boolean)
    };
    await persistRules(nextRules);
    setSelectedHint(hint);
    setStatus(`Rule saved: ${hint}`);
  }

  async function deleteRule() {
    const hint = hintInput.trim().toUpperCase();
    if (!hint) {
      return;
    }
    const nextRules = { ...rules };
    delete nextRules[hint];
    await persistRules(nextRules);
    const nextHint = Object.keys(nextRules).sort()[0] || "";
    setSelectedHint(nextHint);
    setHintInput(nextHint);
    setTargetsInput((nextRules[nextHint] || []).join(", "));
    setStatus(`Rule deleted: ${hint}`);
  }

  async function persistRules(nextRules: Rules) {
    const response = await fetch("/api/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextRules)
    });

    if (!response.ok) {
      setStatus("Could not save rules.");
      return;
    }

    const saved = (await response.json()) as Rules;
    setRules(saved);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Smart Raporty</p>
          <h1>CMM Balloon Matcher</h1>
        </div>
        <button className="secondary-button" onClick={logout} type="button">
          Log out
        </button>
      </header>

      <section className="toolbar">
        <label className="file-picker">
          <span>Load .rpt files</span>
          <input accept=".rpt,.txt,text/plain" multiple onChange={loadReports} type="file" />
        </label>
        <button className="secondary-button" onClick={() => setShowRules((value) => !value)} type="button">
          {showRules ? "Hide rules" : "Edit rules"}
        </button>
        <button className="primary-button" onClick={analyze} type="button">
          Analyze
        </button>
        <button className="secondary-button" onClick={exportCsv} type="button">
          Export CSV
        </button>
        <div className="status">{status}</div>
      </section>

      <section className="workspace">
        <div className="input-panel">
          <div className="panel-heading">
            <h2>Balloon data</h2>
            <span>{reportFiles.length ? `${reportFiles.length} report files` : "No files loaded"}</span>
          </div>
          <textarea
            spellCheck={false}
            value={balloonText}
            onChange={(event) => setBalloonText(event.target.value)}
            placeholder="Paste tab-separated rows from Excel"
          />
        </div>

        <div className="summary-strip">
          <div>
            <span>Measurements</span>
            <strong>{measurements.length}</strong>
          </div>
          <div>
            <span>Balloons</span>
            <strong>{results.length || parseBalloonText(balloonText).length}</strong>
          </div>
          <div>
            <span>Matched</span>
            <strong>{results.length ? `${foundCount}/${results.length}` : "0"}</strong>
          </div>
        </div>
      </section>

      {showRules ? (
        <section className="rules-panel">
          <div className="rules-list">
            {Object.keys(rules)
              .sort()
              .map((hint) => (
                <button
                  className={hint === selectedHint ? "rule-row active" : "rule-row"}
                  key={hint}
                  onClick={() => loadRule(hint)}
                  type="button"
                >
                  <span>{hint}</span>
                  <small>{rules[hint].join(", ") || "Skipped"}</small>
                </button>
              ))}
          </div>
          <div className="rule-editor">
            <label>
              Hint
              <input value={hintInput} onChange={(event) => setHintInput(event.target.value)} />
            </label>
            <label>
              Targets
              <input value={targetsInput} onChange={(event) => setTargetsInput(event.target.value)} />
            </label>
            <div className="button-row">
              <button className="primary-button" onClick={saveRule} type="button">
                Save rule
              </button>
              <button className="secondary-button" onClick={deleteRule} type="button">
                Delete rule
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="results-panel">
        <div className="panel-heading">
          <h2>Results</h2>
          <input
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search matches"
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hint</th>
                <th>Balloon</th>
                <th>Nominal</th>
                <th>Min</th>
                <th>Max</th>
                <th>Status</th>
                <th>Matched report rows</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((result, index) => (
                <tr key={`${result.balloon.number}-${index}`}>
                  <td>{result.balloon.hint}</td>
                  <td>{result.balloon.number}</td>
                  <td>{formatDecimal(result.balloon.nominal)}</td>
                  <td>{formatDecimal(result.minActual)}</td>
                  <td>{formatDecimal(result.maxActual)}</td>
                  <td>{result.reason}</td>
                  <td>{result.matches.map(measurementDisplay).join("; ")}</td>
                </tr>
              ))}
              {!filteredResults.length ? (
                <tr>
                  <td className="empty-state" colSpan={7}>
                    Load reports, paste balloon data, and run analysis.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
