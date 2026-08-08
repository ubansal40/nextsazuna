"use server";

import { requireSection } from "@/lib/admin/require";
import {
  createVocab,
  renameVocab,
  setVocabVisibility,
  deleteVocab,
  reorderVocab,
  listVocab,
  vocabSection,
  type VocabKind,
  type VocabRow,
} from "@/lib/admin/taxonomy";

/**
 * Materials & purities vocabulary actions — one set for both, keyed by `kind`,
 * each re-gated on that vocabulary's section. Every one returns the refreshed
 * list so the screen re-renders from the truth rather than guessing.
 */

export type VocabResult = { ok: true; rows: VocabRow[] } | { ok: false; error: string };

async function refresh(kind: VocabKind): Promise<VocabResult> {
  return { ok: true, rows: await listVocab(kind) };
}

function fail(error: unknown): VocabResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function addVocab(kind: VocabKind, name: string): Promise<VocabResult> {
  const admin = await requireSection(vocabSection(kind));
  try {
    await createVocab(admin, kind, name);
    return refresh(kind);
  } catch (error) {
    return fail(error);
  }
}

export async function renameVocabAction(kind: VocabKind, id: number, name: string): Promise<VocabResult> {
  const admin = await requireSection(vocabSection(kind));
  try {
    await renameVocab(admin, kind, id, name);
    return refresh(kind);
  } catch (error) {
    return fail(error);
  }
}

export async function setVocabVisibilityAction(kind: VocabKind, id: number, visible: boolean): Promise<VocabResult> {
  const admin = await requireSection(vocabSection(kind));
  try {
    await setVocabVisibility(admin, kind, id, visible);
    return refresh(kind);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteVocabAction(kind: VocabKind, id: number): Promise<VocabResult> {
  const admin = await requireSection(vocabSection(kind));
  try {
    await deleteVocab(admin, kind, id);
    return refresh(kind);
  } catch (error) {
    return fail(error);
  }
}

export async function reorderVocabAction(kind: VocabKind, orderedIds: number[]): Promise<VocabResult> {
  const admin = await requireSection(vocabSection(kind));
  try {
    await reorderVocab(admin, kind, orderedIds);
    return refresh(kind);
  } catch (error) {
    return fail(error);
  }
}
