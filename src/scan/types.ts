export type FindingSeverity = "error" | "warn" | "info";

export type Finding = {
  category: string;
  ruleId: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  recommendation: string;
  location?: string;
  affectedCount?: number;
};

export type ScoreItem = {
  category: string;
  name: string;
  weight: number;
  earned: number;
};
