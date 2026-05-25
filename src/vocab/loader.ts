import { Parser, type Quad_Object, Store } from "n3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSnapshotPath } from "../config.js";
import type { ClassRecord, DomainEntry, Manifest, PropertyRecord, Vocab } from "./types.js";
import { KNOWN_PREFIXES, type Range } from "./types.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";

function toCurie(iri: string): { curie?: string; label: string } {
  for (const [ns, prefix] of Object.entries(KNOWN_PREFIXES)) {
    if (iri.startsWith(ns)) {
      const local = iri.slice(ns.length);
      return { curie: `${prefix}:${local}`, label: local };
    }
  }
  // Fallback: take fragment or last path segment as label
  const tail = iri.includes("#") ? iri.split("#").pop()! : iri.split("/").pop()!;
  return { label: tail || iri };
}

export function classifyRange(iri: string, localClassNames: Set<string>): Range {
  // xsd primitive
  if (iri.startsWith("http://www.w3.org/2001/XMLSchema#")) {
    const { curie, label } = toCurie(iri);
    return { kind: "datatype", iri, curie: curie!, label };
  }
  // local OB vocab class
  const tail = iri.includes("#") ? iri.split("#").pop()! : iri.split("/").pop()!;
  if (localClassNames.has(tail)) {
    return { kind: "vocab-class", iri, name: tail };
  }
  // external (schema.org, vc, etc.)
  const { curie, label } = toCurie(iri);
  return { kind: "external", iri, curie, label };
}

export function loadVocab(version?: string): Vocab {
  const snapshotDir = resolveSnapshotPath(version);
  const manifest: Manifest = JSON.parse(readFileSync(join(snapshotDir, "manifest.json"), "utf-8"));
  const ttlContent = readFileSync(join(snapshotDir, "vocab.ttl"), "utf-8");

  const store = new Store();
  const parser = new Parser();
  store.addQuads(parser.parse(ttlContent));

  const classesByName = buildClassMap(store, manifest.version);
  const localClassNames = new Set(classesByName.keys());
  const propertiesByName = buildPropertyMap(store, manifest.version, localClassNames);
  attachPropertiesToClasses(classesByName, propertiesByName);

  return { classesByName, propertiesByName, version: manifest.version };
}

function localName(iri: string): string {
  const hashIdx = iri.lastIndexOf("#");
  if (hashIdx !== -1) return iri.slice(hashIdx + 1);
  const slashIdx = iri.lastIndexOf("/");
  return iri.slice(slashIdx + 1);
}

function getComment(store: Store, subjectIri: string): string {
  const quads = store.getQuads(subjectIri, `${RDFS}comment`, null, null);
  if (quads.length === 0) return "";
  // Return the first comment that doesn't start with "In ClassName:"
  const generic = quads.find((q) => !q.object.value.startsWith("In "));
  return generic ? generic.object.value : quads[0].object.value;
}

function buildClassMap(store: Store, version: string): Map<string, ClassRecord> {
  const map = new Map<string, ClassRecord>();

  const classQuads = [
    ...store.getQuads(null, `${RDF}type`, `${OWL}Class`, null),
    ...store.getQuads(null, `${RDF}type`, `${RDFS}Class`, null),
  ];

  for (const quad of classQuads) {
    const iri = quad.subject.value;
    const name = localName(iri);
    if (map.has(name)) continue;

    const description = getComment(store, iri);
    const subClassOf = store
      .getQuads(iri, `${RDFS}subClassOf`, null, null)
      .map((q) => localName(q.object.value));

    map.set(name, {
      name,
      iri,
      description,
      subClassOf,
      properties: [],
      version,
    });
  }

  return map;
}

function buildPropertyMap(store: Store, version: string, localClassNames: Set<string>): Map<string, PropertyRecord> {
  const map = new Map<string, PropertyRecord>();

  const propQuads = [
    ...store.getQuads(null, `${RDF}type`, `${OWL}DatatypeProperty`, null),
    ...store.getQuads(null, `${RDF}type`, `${OWL}ObjectProperty`, null),
    ...store.getQuads(null, `${RDF}type`, `${RDF}Property`, null),
  ];

  for (const quad of propQuads) {
    const iri = quad.subject.value;
    const name = localName(iri);
    if (map.has(name)) continue;

    const description = getComment(store, iri);
    const range = getRangeStructured(store, iri, localClassNames);
    const domain = buildDomainEntries(store, iri);

    map.set(name, { name, iri, description, range, domain, version });
  }

  return map;
}

function getRangeStructured(store: Store, propertyIri: string, localClassNames: Set<string>): Range {
  const rangeQuads = store.getQuads(propertyIri, `${RDFS}range`, null, null);
  if (rangeQuads.length === 0) {
    // No range declared — treat as external with the property's own IRI as fallback
    return { kind: "external", iri: propertyIri, label: localName(propertyIri) };
  }

  const rangeNode = rangeQuads[0].object;
  // If it's a blank node (union range), collect all members
  if (rangeNode.termType === "BlankNode") {
    const unionQuads = store.getQuads(rangeNode, `${OWL}unionOf`, null, null);
    if (unionQuads.length > 0) {
      const memberIris = walkRdfList(store, unionQuads[0].object);
      const members = memberIris.map((iri) => classifyRange(iri, localClassNames));
      return { kind: "union", members };
    }
  }
  return classifyRange(rangeNode.value, localClassNames);
}

function buildDomainEntries(store: Store, propertyIri: string): DomainEntry[] {
  const domainQuads = store.getQuads(propertyIri, `${RDFS}domain`, null, null);
  const entries: DomainEntry[] = [];

  for (const dq of domainQuads) {
    const domainNode = dq.object;

    if (domainNode.termType === "BlankNode") {
      // Blank node: check for owl:unionOf
      const unionQuads = store.getQuads(domainNode, `${OWL}unionOf`, null, null);
      if (unionQuads.length > 0) {
        const members = walkRdfList(store, unionQuads[0].object);
        for (const memberIri of members) {
          const className = localName(memberIri);
          const desc = getClassSpecificDescription(store, propertyIri, className);
          entries.push({ className, description: desc });
        }
      }
    } else {
      // Direct class reference
      entries.push({ className: localName(domainNode.value), description: "" });
    }
  }

  return entries;
}

function walkRdfList(store: Store, listNode: Quad_Object): string[] {
  const members: string[] = [];
  let current: Quad_Object | null = listNode;
  const nilIri = `${RDF}nil`;

  while (current && current.value !== nilIri) {
    const firstQuads = store.getQuads(current, `${RDF}first`, null, null);
    if (firstQuads.length > 0) {
      members.push(firstQuads[0].object.value);
    }
    const restQuads = store.getQuads(current, `${RDF}rest`, null, null);
    if (restQuads.length > 0) {
      current = restQuads[0].object;
    } else {
      break;
    }
  }

  return members;
}

function getClassSpecificDescription(store: Store, propertyIri: string, className: string): string {
  // Look for rdfs:comment annotations with "In ClassName:" prefix
  const commentQuads = store.getQuads(propertyIri, `${RDFS}comment`, null, null);
  const prefix = `In ${className}:`;
  for (const q of commentQuads) {
    if (q.object.value.startsWith(prefix)) {
      return q.object.value.slice(prefix.length);
    }
  }
  return "";
}

function attachPropertiesToClasses(
  classesByName: Map<string, ClassRecord>,
  propertiesByName: Map<string, PropertyRecord>,
): void {
  for (const prop of propertiesByName.values()) {
    for (const domainEntry of prop.domain) {
      const classRecord = classesByName.get(domainEntry.className);
      if (!classRecord) continue;

      // Use the class-specific description if available (union domain case),
      // otherwise fall back to the property's generic description
      const description = domainEntry.description || prop.description;

      classRecord.properties.push({
        name: prop.name,
        range: prop.range,
        description,
      });
    }
  }
}
