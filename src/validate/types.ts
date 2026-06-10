export interface ValidationError {
  path: string; // JSON Pointer (e.g., "/credentialSubject/achievement")
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  expanded?: Record<string, unknown>[];
}

export type SignatureStatus = "passed" | "failed" | "not_applicable";

export type CheckResult = {
  check: "schema" | "jsonld" | "signature";
  status: "passed" | "failed" | "not_applicable";
  errors: ValidationError[];
};

export type CredentialReport = {
  index: number;
  source: string; // "presentation" | "batch" | "enveloped:vc-jwt" | "single" | ...
  checks: CheckResult[]; // always three independent entries (R5.5)
  ok: boolean; // true iff no check has status "failed"
};

export type ValidateResponse = {
  ok: boolean; // true iff every credential ok
  results: CredentialReport[]; // per-credential (R4.5)
  decodeErrors?: Array<{ index: number; message: string }>; // R4.6
};
