import type { Warning } from "./types.js";
import { WARNING_UNRECOGNIZED_FIELD } from "./types.js";

/**
 * Canonical recognized input paths.
 *
 * Each entry is a dot-separated path segment. The special markers:
 * - `[]` after a segment means the parent is an array and any index is valid
 * - A segment ending with `*` means the entire sub-tree under that key is
 *   recognized (pass-through rich-tier fields consumed verbatim).
 *
 * The structure mirrors the CreateAchievementCredentialInput zod schema.
 */

type PathNode = {
  /** If true, any sub-tree under this key is considered recognized (pass-through). */
  passThrough?: boolean;
  /** If true, this key is an array and its elements are described by `children`. */
  isArray?: boolean;
  /** Nested recognized keys under this path. */
  children?: Record<string, PathNode>;
};

/**
 * Canonical set of recognized input paths, mirroring the input schema.
 * Pass-through fields (e.g. `proof`, `result[]` elements, `source`) have their
 * entire sub-trees recognized because the builder consumes them verbatim.
 */
const RECOGNIZED_PATHS: Record<string, PathNode> = {
  id: {},
  issuer: {
    children: {
      id: {},
      name: {},
      url: {},
      email: {},
      description: {},
      image: {},
    },
  },
  achievement: {
    children: {
      id: {},
      name: {},
      description: {},
      criteria: {
        children: {
          narrative: {},
          id: {},
        },
      },
      achievementType: {},
      image: {},
      tag: { isArray: true },
      alignment: { isArray: true, passThrough: true },
      related: { isArray: true, passThrough: true },
    },
  },
  recipient: {
    children: {
      id: {},
      identifier: {
        children: {
          identityType: {},
          identityHash: {},
          hashed: {},
          salt: {},
        },
      },
    },
  },
  awardedDate: {},
  validFrom: {},
  validUntil: {},
  evidence: {
    isArray: true,
    children: {
      id: {},
      name: {},
      description: {},
      narrative: {},
      genre: {},
    },
  },
  image: {
    // image can be a string or an object { id, caption }
    children: {
      id: {},
      caption: {},
    },
  },
  // Rich-tier pass-through fields — entire sub-tree is recognized
  result: { isArray: true, passThrough: true },
  source: { passThrough: true },
  proof: { passThrough: true },
  credentialStatus: { passThrough: true },
  endorsement: { isArray: true, passThrough: true },
  termsOfUse: { passThrough: true },
  refreshService: { passThrough: true },
  credentialSchema: { passThrough: true },
};

/**
 * Walks the raw input object and emits one `unrecognized_field` warning for
 * each leaf path that is not covered by the canonical set of recognized paths.
 *
 * This runs against the **raw** input (before zod parsing) so that keys stripped
 * by zod are still observable.
 */
export function detectUnrecognizedFields(rawInput: unknown): Warning[] {
  const warnings: Warning[] = [];

  if (rawInput === null || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return warnings;
  }

  walkObject(rawInput as Record<string, unknown>, RECOGNIZED_PATHS, "", warnings);
  return warnings;
}

function walkObject(
  obj: Record<string, unknown>,
  schema: Record<string, PathNode>,
  prefix: string,
  warnings: Warning[],
): void {
  for (const key of Object.keys(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    const node = schema[key];

    if (!node) {
      // This key is not recognized at this level
      warnings.push({
        code: WARNING_UNRECOGNIZED_FIELD,
        message: `Input field "${currentPath}" is not recognized and was not included in the output credential.`,
        param: currentPath,
      });
      continue;
    }

    // If the node is pass-through, the entire sub-tree is recognized
    if (node.passThrough) {
      continue;
    }

    const value = obj[key];

    if (node.isArray && Array.isArray(value)) {
      // Walk each array element if there are children defined
      if (node.children) {
        for (let i = 0; i < value.length; i++) {
          const element = value[i];
          if (element !== null && typeof element === "object" && !Array.isArray(element)) {
            walkObject(
              element as Record<string, unknown>,
              node.children,
              `${currentPath}[${i}]`,
              warnings,
            );
          }
        }
      }
      // If no children defined, array of primitives — all recognized
      continue;
    }

    // If the value is an object and there are children defined, recurse
    if (node.children && value !== null && typeof value === "object" && !Array.isArray(value)) {
      walkObject(value as Record<string, unknown>, node.children, currentPath, warnings);
    }

    // Leaf value (string, number, boolean, null) or object without children — recognized
  }
}
