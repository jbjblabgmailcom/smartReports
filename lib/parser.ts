import { formatDecimal } from "./matcher";
import type { Balloon, Measurement } from "./types";

const NUMBER_RE = /[-+]?(?:\d+[,.]?\d*|[,.]\d+)/g;
const NUMBER_SINGLE_RE = /[-+]?(?:\d+[,.]?\d*|[,.]\d+)/;
const MULTIPLIER_PREFIX_RE = /\b(\d+)\s*x\b|\b(\d+)\s*x/i;
const THREAD_RE = /\b\d*\s*x?\s*M\s*\d+(?:[,.]\d+)?/i;
const DIAMETER_RE = /(?:[Øø⌀]\s*|(?:^|\W)fi\s*)([-+]?(?:\d+[,.]?\d*|[,.]\d+))/i;
const GEOMETRIC_TYPES = new Set(["WAL", "PROST_3D", "SYM_3D", "PARA_3D", "WSP.ŚR", "POZ"]);

export function parseDecimal(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = value.trim().replace(",", ".");
  if (!cleaned || cleaned.toUpperCase() === "N/A" || cleaned.toUpperCase() === "NA") {
    return null;
  }

  const match = cleaned.match(NUMBER_SINGLE_RE);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBalloonText(text: string): Balloon[] {
  const balloons: Balloon[] = [];

  text.split(/\r?\n/).forEach((rawRow) => {
    if (!rawRow.trim()) {
      return;
    }

    const cells = rawRow.split("\t").map((cell) => cell.trim());
    while (cells.length < 6) {
      cells.push("");
    }

    const firstCellIsNumber = parseDecimal(cells[0]) !== null;
    let hint = "";
    let number = "";
    let description = "";
    let upperTolerance: number | null = null;
    let lowerTolerance: number | null = null;

    if (cells[0] && !firstCellIsNumber) {
      hint = cells[0].toUpperCase();
      number = cells[1] || String(balloons.length + 1);
      description = cells[2];
      upperTolerance = parseDecimal(cells[4]);
      lowerTolerance = parseDecimal(cells[5]);
    } else if (firstCellIsNumber) {
      number = cells[0];
      description = cells[1];
      upperTolerance = parseDecimal(cells[3]);
      lowerTolerance = parseDecimal(cells[4]);
    } else {
      number = cells[1] || String(balloons.length + 1);
      description = cells[2];
      upperTolerance = parseDecimal(cells[4]);
      lowerTolerance = parseDecimal(cells[5]);
    }

    const nominalInfo = extractNominalInfo(description);
    balloons.push({
      hint,
      number,
      rawText: description,
      nominal: nominalInfo.nominal,
      upperTolerance,
      lowerTolerance,
      multiplier: nominalInfo.multiplier,
      hasDiameter: nominalInfo.hasDiameter
    });
  });

  return balloons;
}

function extractNominalInfo(text: string): { nominal: number | null; multiplier: number; hasDiameter: boolean } {
  const cleaned = text.trim();
  if (!cleaned || THREAD_RE.test(cleaned)) {
    return { nominal: null, multiplier: 1, hasDiameter: false };
  }

  const multiplied = cleaned.match(MULTIPLIER_PREFIX_RE);
  if (multiplied?.index !== undefined) {
    const multiplier = Number.parseInt(multiplied[1] || multiplied[2], 10);
    const remainder = cleaned.slice(multiplied.index + multiplied[0].length);
    const diameter = remainder.match(DIAMETER_RE);
    if (diameter) {
      return { nominal: parseDecimal(diameter[1]), multiplier, hasDiameter: true };
    }
    const match = remainder.match(NUMBER_SINGLE_RE);
    return { nominal: match ? parseDecimal(match[0]) : null, multiplier, hasDiameter: false };
  }

  const diameter = cleaned.match(DIAMETER_RE);
  if (diameter) {
    return { nominal: parseDecimal(diameter[1]), multiplier: 1, hasDiameter: true };
  }

  const match = cleaned.match(NUMBER_SINGLE_RE);
  if (match) {
    return { nominal: parseDecimal(match[0]), multiplier: 1, hasDiameter: false };
  }

  return { nominal: null, multiplier: 1, hasDiameter: false };
}

export function parseRptFiles(files: Array<{ name: string; content: string }>): Measurement[] {
  return files.flatMap((file) => parseRptFile(file.name, file.content));
}

export function parseRptFile(fileName: string, content: string): Measurement[] {
  const measurements: Measurement[] = [];

  content.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || /^-+$/.test(line)) {
      return;
    }

    const parts = line.split(/\s+/, 2);
    const featureType = parts[0];
    if (!featureType || !/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(featureType)) {
      return;
    }

    const rest = line.slice(featureType.length).trim();
    const numbers = [...rest.matchAll(NUMBER_RE)]
      .map((match) => parseDecimal(match[0]))
      .filter((number): number is number => number !== null);
    if (!numbers.length) {
      return;
    }

    let nominal: number | null;
    let actual: number;
    let lowerTolerance: number | null = null;
    let upperTolerance: number | null = null;

    if (GEOMETRIC_TYPES.has(featureType) && numbers.length >= 2) {
      actual = numbers[0];
      nominal = numbers[1];
    } else if (numbers.length >= 2) {
      nominal = numbers[0];
      actual = numbers[1];
      lowerTolerance = numbers.length >= 5 ? numbers[3] : null;
      upperTolerance = numbers.length >= 5 ? numbers[4] : null;
    } else {
      nominal = null;
      actual = numbers[0];
    }

    const nominalPart = formatDecimal(nominal);
    const actualPart = formatDecimal(actual);
    measurements.push({
      featureType,
      nominal,
      actual,
      rawLine,
      fileName,
      lineNo,
      lowerTolerance,
      upperTolerance,
      featureKey: `${fileName}:${lineNo}:${featureType}:${nominalPart}:${actualPart}`
    });
  });

  return measurements;
}

export function measurementDisplay(measurement: Measurement): string {
  const lower = formatDecimal(measurement.lowerTolerance);
  const upper = formatDecimal(measurement.upperTolerance);
  const tolerance = lower || upper ? ` | tol=${lower}/${upper}` : "";
  return `${measurement.fileName}:${measurement.lineNo} | ${measurement.featureType} | nominal=${formatDecimal(
    measurement.nominal
  )} | actual=${formatDecimal(measurement.actual)}${tolerance}`;
}
