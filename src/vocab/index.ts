import { loadVocab } from "./loader.js";
import type { ClassRecord, Vocab } from "./types.js";

let vocab: Vocab | null = null;

export function getVocab(): Vocab {
  if (!vocab) {
    vocab = loadVocab();
  }
  return vocab;
}

export function getClassRecord(name: string): ClassRecord | null {
  const v = getVocab();
  return v.classesByName.get(name) ?? null;
}
