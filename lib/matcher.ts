import type { Balloon, MatchResult, Measurement, Rules } from "./types";

export const DEFAULT_RULES: Rules = {
  WSP: ["WSP.ŚR"],
  PROST: ["PROST_3D"],
  SYM: ["SYM_3D"],
  PARA: ["PARA_3D"],
  POZ: ["POZ"],
  WAL: ["WAL"],
  NO: []
};

const LINEAR_TYPES = ["XA", "YA", "ZA", "X", "Y", "Z"];

export function matchAll(balloons: Balloon[], measurements: Measurement[], rules: Rules): MatchResult[] {
  const usedKeys = new Set<string>();
  return balloons.map((balloon) => matchBalloon(balloon, measurements, rules, usedKeys));
}

function matchBalloon(
  balloon: Balloon,
  measurements: Measurement[],
  rules: Rules,
  usedKeys: Set<string>
): MatchResult {
  const targetTypes = targetTypesFor(balloon, rules);

  if (targetTypes.length === 0 && Object.prototype.hasOwnProperty.call(rules, balloon.hint)) {
    return result(balloon, [], "Skipped by rule.", []);
  }

  if (balloon.nominal === null) {
    return result(balloon, [], "No nominal extracted.", []);
  }

  const candidates = measurements.filter((measurement) => {
    return (
      !usedKeys.has(measurement.featureKey) &&
      targetTypes.includes(measurement.featureType) &&
      measurementMatches(balloon, measurement)
    );
  });

  if (candidates.length === 0) {
    return result(balloon, [], "Not found.", []);
  }

  const matches = balloon.multiplier > 1 ? candidates : [candidates[0]];
  matches.forEach((measurement) => usedKeys.add(measurement.featureKey));

  const reason =
    balloon.multiplier > 1
      ? `Found ${matches.length} unused matches for ${balloon.multiplier}x nominal ${formatDecimal(balloon.nominal)}.`
      : "Found first unused exact match.";

  return result(balloon, matches, reason, candidates);
}

function targetTypesFor(balloon: Balloon, rules: Rules): string[] {
  const key = balloon.hint.trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(rules, key)) {
    return rules[key].slice();
  }
  if (balloon.hasDiameter) {
    return ["ŚRED"];
  }
  return LINEAR_TYPES.slice();
}

function measurementMatches(balloon: Balloon, measurement: Measurement): boolean {
  if (measurement.nominal !== balloon.nominal) {
    return false;
  }
  if (measurement.lowerTolerance !== null && balloon.lowerTolerance !== null) {
    if (measurement.lowerTolerance !== balloon.lowerTolerance) {
      return false;
    }
  }
  if (measurement.upperTolerance !== null && balloon.upperTolerance !== null) {
    if (measurement.upperTolerance !== balloon.upperTolerance) {
      return false;
    }
  }
  return true;
}

function result(balloon: Balloon, matches: Measurement[], reason: string, candidates: Measurement[]): MatchResult {
  const values = matches.map((measurement) => measurement.actual);
  return {
    balloon,
    matches,
    reason,
    candidates,
    minActual: values.length ? Math.min(...values) : null,
    maxActual: values.length ? Math.max(...values) : null
  };
}

export function formatDecimal(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "";
  }
  if (Number.isInteger(value)) {
    return value.toFixed(0);
  }
  return value.toString().replace(/(?:\.0+|(\.\d*?)0+)$/, "$1");
}

export function resultRowValues(result: MatchResult): string[] {
  return [
    result.balloon.number,
    formatDecimal(result.balloon.nominal),
    formatDecimal(result.minActual),
    formatDecimal(result.maxActual)
  ];
}
