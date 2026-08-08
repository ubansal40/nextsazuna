"use server";

import { requireSection } from "@/lib/admin/require";
import {
  listTags,
  createTag,
  renameTag,
  deleteTag,
  setTagVisibility,
  assignTagGroup,
  mergeTag,
  createTagGroup,
  renameTagGroup,
  deleteTagGroup,
  setTagGroupVisibility,
  type TagsData,
} from "@/lib/admin/taxonomy";

/**
 * Tag & tag-group actions. Each re-gates on `tags` and returns the refreshed
 * grouped structure so the screen re-renders from the database's truth.
 */
export type TagsResult = { ok: true; data: TagsData } | { ok: false; error: string };

type Admin = Awaited<ReturnType<typeof requireSection>>;

async function gated(op: (admin: Admin) => Promise<void>): Promise<TagsResult> {
  const admin = await requireSection("tags");
  try {
    await op(admin);
    return { ok: true, data: await listTags() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function addTag(name: string, groupId: number | null): Promise<TagsResult> {
  return gated((a) => createTag(a, name, groupId));
}
export async function renameTagAction(id: number, name: string): Promise<TagsResult> {
  return gated((a) => renameTag(a, id, name));
}
export async function deleteTagAction(id: number): Promise<TagsResult> {
  return gated((a) => deleteTag(a, id));
}
export async function setTagVisibilityAction(id: number, visible: boolean): Promise<TagsResult> {
  return gated((a) => setTagVisibility(a, id, visible));
}
export async function assignTagGroupAction(id: number, groupId: number | null): Promise<TagsResult> {
  return gated((a) => assignTagGroup(a, id, groupId));
}
export async function mergeTagAction(sourceId: number, destId: number): Promise<TagsResult> {
  return gated((a) => mergeTag(a, sourceId, destId));
}
export async function addTagGroup(name: string): Promise<TagsResult> {
  return gated((a) => createTagGroup(a, name));
}
export async function renameTagGroupAction(id: number, name: string): Promise<TagsResult> {
  return gated((a) => renameTagGroup(a, id, name));
}
export async function deleteTagGroupAction(id: number): Promise<TagsResult> {
  return gated((a) => deleteTagGroup(a, id));
}
export async function setTagGroupVisibilityAction(id: number, visible: boolean): Promise<TagsResult> {
  return gated((a) => setTagGroupVisibility(a, id, visible));
}
