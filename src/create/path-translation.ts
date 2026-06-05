const PATH_MAP: Record<string, string> = {
  "/issuer/id": "issuer.id",
  "/issuer/name": "issuer.name",
  "/issuer/url": "issuer.url",
  "/issuer/email": "issuer.email",
  "/issuer/description": "issuer.description",
  "/issuer/image": "issuer.image",
  "/credentialSubject/id": "recipient.id",
  "/credentialSubject/identifier": "recipient.identifier",
  "/credentialSubject/identifier/identityType": "recipient.identifier.identityType",
  "/credentialSubject/identifier/identityHash": "recipient.identifier.identityHash",
  "/credentialSubject/identifier/hashed": "recipient.identifier.hashed",
  "/credentialSubject/identifier/salt": "recipient.identifier.salt",
  "/credentialSubject/achievement/id": "achievement.id",
  "/credentialSubject/achievement/name": "achievement.name",
  "/credentialSubject/achievement/description": "achievement.description",
  "/credentialSubject/achievement/criteria": "achievement.criteria",
  "/credentialSubject/achievement/criteria/narrative": "achievement.criteria.narrative",
  "/credentialSubject/achievement/criteria/id": "achievement.criteria.id",
  "/credentialSubject/achievement/achievementType": "achievement.achievementType",
  "/credentialSubject/achievement/image": "achievement.image",
  "/credentialSubject/achievement/tag": "achievement.tag",
  "/awardedDate": "awardedDate",
  "/validFrom": "validFrom",
  "/image": "image",
  "/id": "id",
};

/**
 * Translates a JSON-LD path (JSON Pointer) to an input parameter path.
 * Handles indexed paths (e.g., /evidence/0/name → evidence[0].name).
 */
export function translatePath(jsonLdPath: string): string {
  // Direct match
  if (PATH_MAP[jsonLdPath]) return PATH_MAP[jsonLdPath];

  // Handle evidence indexed paths: /evidence/N/field → evidence[N].field
  const evidenceMatch = jsonLdPath.match(/^\/evidence\/(\d+)(?:\/(.+))?$/);
  if (evidenceMatch) {
    const index = evidenceMatch[1];
    const rest = evidenceMatch[2];
    return rest ? `evidence[${index}].${rest}` : `evidence[${index}]`;
  }

  // Handle credentialSubject paths not in the direct map
  const csPrefix = "/credentialSubject/";
  if (jsonLdPath.startsWith(csPrefix)) {
    const remainder = jsonLdPath.slice(csPrefix.length);
    // Check for achievement sub-paths
    if (remainder.startsWith("achievement/")) {
      return `achievement.${remainder.slice("achievement/".length).replace(/\//g, ".")}`;
    }
    return `recipient.${remainder.replace(/\//g, ".")}`;
  }

  // If no mapping exists, return the original path
  return jsonLdPath;
}
