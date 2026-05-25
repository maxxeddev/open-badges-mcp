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
