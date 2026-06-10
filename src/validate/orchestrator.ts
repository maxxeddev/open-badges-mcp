/**
 * Validation orchestrator — runs selected checks per credential and aggregates results.
 *
 * For each unwrapped credential the orchestrator runs all requested checks regardless of
 * individual outcomes (R5.6) and records them as independent results (R5.5).
 *
 * The requested `mode` selects which checks execute:
 * - "schema"    → Schema_Check only
 * - "jsonld"    → JsonLd_Check only
 * - "signature" → Signature_Check only
 * - "both"      → Schema_Check + JsonLd_Check (legacy default)
 * - "all"       → Schema_Check + JsonLd_Check + Signature_Check
 *
 * Requirements: 4.5, 5.5, 5.6
 */

import { validateJsonLd } from "./jsonld.js";
import { validateSchema } from "./schema.js";
import { checkSignature } from "./signature.js";
import type { CheckResult, CredentialReport, ValidateResponse, ValidationError } from "./types.js";
import { unwrap } from "./unwrap.js";

type Mode = "schema" | "jsonld" | "signature" | "both" | "all";

/**
 * Determine which checks to run based on the requested mode.
 */
function checksForMode(mode: Mode): Set<"schema" | "jsonld" | "signature"> {
  switch (mode) {
    case "schema":
      return new Set(["schema"]);
    case "jsonld":
      return new Set(["jsonld"]);
    case "signature":
      return new Set(["signature"]);
    case "both":
      return new Set(["schema", "jsonld"]);
    case "all":
      return new Set(["schema", "jsonld", "signature"]);
  }
}

/**
 * Run the Schema_Check on a credential document.
 */
function runSchemaCheck(doc: Record<string, unknown>): CheckResult {
  const errors = validateSchema(doc);
  return {
    check: "schema",
    status: errors.length > 0 ? "failed" : "passed",
    errors,
  };
}

/**
 * Run the JsonLd_Check on a credential document.
 */
async function runJsonLdCheck(doc: Record<string, unknown>): Promise<CheckResult> {
  const { errors } = await validateJsonLd(doc);
  // Only count severity "error" entries as failures; warnings are informational
  const hasErrors = errors.some((e) => e.severity === "error");
  return {
    check: "jsonld",
    status: hasErrors ? "failed" : "passed",
    errors,
  };
}

/**
 * Run the Signature_Check on a credential document.
 */
async function runSignatureCheck(doc: Record<string, unknown>): Promise<CheckResult> {
  const result = await checkSignature(doc);
  const errors: ValidationError[] = [];
  if (result.error) {
    errors.push({
      path: "/proof",
      message: result.error,
      severity: "error",
    });
  }
  return {
    check: "signature",
    status: result.status,
    errors,
  };
}

/**
 * Validate one or more credentials extracted from the input.
 *
 * @param input - The raw JSON input (credential, VP, batch response, or enveloped)
 * @param mode  - Which checks to execute
 * @returns Aggregated validation response with per-credential reports
 */
export async function validateCredential(
  input: Record<string, unknown>,
  mode: Mode,
): Promise<ValidateResponse> {
  // Step 1: Unwrap the input into individual credentials + decode errors
  const { credentials, errors: decodeErrors } = unwrap(input);

  // Step 2: Determine which checks to run
  const requestedChecks = checksForMode(mode);

  // Step 3: Run checks for each credential
  const results: CredentialReport[] = await Promise.all(
    credentials.map(async (cred) => {
      const checks: CheckResult[] = [];

      // Run each requested check independently — never short-circuit (R5.6)
      if (requestedChecks.has("schema")) {
        checks.push(runSchemaCheck(cred.doc));
      }

      if (requestedChecks.has("jsonld")) {
        checks.push(await runJsonLdCheck(cred.doc));
      }

      if (requestedChecks.has("signature")) {
        checks.push(await runSignatureCheck(cred.doc));
      }

      // A credential is ok if no check has status "failed"
      const ok = checks.every((c) => c.status !== "failed");

      return {
        index: cred.index,
        source: cred.source,
        checks,
        ok,
      };
    }),
  );

  // Step 4: Aggregate top-level ok
  const ok = results.every((r) => r.ok);

  // Step 5: Build response
  const response: ValidateResponse = { ok, results };
  if (decodeErrors.length > 0) {
    response.decodeErrors = decodeErrors;
    // If there are decode errors, the overall result is not ok
    response.ok = false;
  }

  return response;
}
