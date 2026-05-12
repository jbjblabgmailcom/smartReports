export type Rules = Record<string, string[]>;

export type Balloon = {
  hint: string;
  number: string;
  rawText: string;
  nominal: number | null;
  upperTolerance: number | null;
  lowerTolerance: number | null;
  multiplier: number;
  hasDiameter: boolean;
};

export type Measurement = {
  featureType: string;
  nominal: number | null;
  actual: number;
  rawLine: string;
  fileName: string;
  lineNo: number;
  lowerTolerance: number | null;
  upperTolerance: number | null;
  featureKey: string;
};

export type MatchResult = {
  balloon: Balloon;
  matches: Measurement[];
  reason: string;
  candidates: Measurement[];
  minActual: number | null;
  maxActual: number | null;
};
