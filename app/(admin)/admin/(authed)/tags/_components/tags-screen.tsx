"use client";

import { useState, useTransition } from "react";
import { Icon, useToast } from "@/components/ui";
import { Switch } from "@/components/admin/switch";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { cn } from "@/lib/cn";
import type { TagsData, TagRow, TaxonomyCounts } from "@/lib/admin/taxonomy";
import { TaxonomyTabs } from "@/components/admin/taxonomy/taxonomy-tabs";
import {
  addTag,
  renameTagAction,
  deleteTagAction,
  mergeTagAction,
  addTagGroup,
  renameTagGroupAction,
  deleteTagGroupAction,
  setTagGroupVisibilityAction,
  type TagsResult,
} from "../_actions";

/**
 * Tags — Sazuna Admin Taxonomy.dc.html. Tags live under groups (the storefront
 * filter groups), with an Ungrouped bucket. Each tag can be renamed, deleted, or
 * MERGED into another — merge reassigns every product from the source tag to the
 * destination and deletes the source, which is destructive and confirmed. Groups
 * carry a visibility switch; deleting a group ungroups its tags rather than
 * deleting them.
 */

export function TagsScreen({ initial, counts }: { initial: TagsData; counts: TaxonomyCounts }) {
  const { toast } = useToast();
  const [data, setData] = useState(initial);
  const [editingTag, setEditingTag] = useState<{ id: number; value: string } | null>(null);
  const [editingGroup, setEditingGroup] = useState<{ id: number; value: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [groupDraft, setGroupDraft] = useState("");
  const [merge, setMerge] = useState<{ source: TagRow; destId: number | null } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "tag" | "group"; id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function handle(result: TagsResult, ok?: string) {
    if (result.ok) {
      setData(result.data);
      if (ok) toast("success", ok);
    } else {
      toast("error", result.error);
    }
  }

  const tagsIn = (groupId: number | null) => data.tags.filter((t) => t.groupId === groupId);
  const draftKey = (groupId: number | null) => (groupId == null ? "ungrouped" : `g${groupId}`);

  function quickAdd(groupId: number | null) {
    const key = draftKey(groupId);
    const name = (drafts[key] ?? "").trim();
    if (!name) return;
    setDrafts((d) => ({ ...d, [key]: "" }));
    startTransition(async () => handle(await addTag(name, groupId)));
  }

  function saveTagRename() {
    if (!editingTag) return;
    const { id, value } = editingTag;
    setEditingTag(null);
    startTransition(async () => handle(await renameTagAction(id, value)));
  }
  function saveGroupRename() {
    if (!editingGroup) return;
    const { id, value } = editingGroup;
    setEditingGroup(null);
    startTransition(async () => handle(await renameTagGroupAction(id, value)));
  }

  function doMerge() {
    if (!merge || merge.destId == null) return;
    const { source, destId } = merge;
    setBusy(true);
    startTransition(async () => {
      const result = await mergeTagAction(source.id, destId);
      setBusy(false);
      setMerge(null);
      handle(result, "Tags merged.");
    });
  }

  function doDelete() {
    if (!confirm) return;
    const { kind, id } = confirm;
    setBusy(true);
    startTransition(async () => {
      const result = kind === "tag" ? await deleteTagAction(id) : await deleteTagGroupAction(id);
      setBusy(false);
      setConfirm(null);
      handle(result, kind === "tag" ? "Tag deleted." : "Group deleted — its tags are now ungrouped.");
    });
  }

  const mergeTargets = merge ? data.tags.filter((t) => t.id !== merge.source.id) : [];

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl font-medium text-heading">Taxonomy</h2>
      </div>
      <TaxonomyTabs counts={{ ...counts, tags: data.tags.length }} />

      <div className="space-y-3">
        {data.groups.map((group) => (
          <GroupCard key={group.id} title={group.name}
            visible={group.isVisible}
            editing={editingGroup?.id === group.id ? editingGroup.value : null}
            onEditStart={() => setEditingGroup({ id: group.id, value: group.name })}
            onEditChange={(v) => setEditingGroup({ id: group.id, value: v })}
            onEditSave={saveGroupRename}
            onVisible={() => startTransition(async () => handle(await setTagGroupVisibilityAction(group.id, !group.isVisible)))}
            onDelete={() => setConfirm({ kind: "group", id: group.id, name: group.name })}
          >
            <TagChips tags={tagsIn(group.id)} editingTag={editingTag} setEditingTag={setEditingTag} onRenameSave={saveTagRename} onMerge={(t) => setMerge({ source: t, destId: null })} onDelete={(t) => setConfirm({ kind: "tag", id: t.id, name: t.name })} />
            <QuickAdd value={drafts[draftKey(group.id)] ?? ""} onChange={(v) => setDrafts((d) => ({ ...d, [draftKey(group.id)]: v }))} onAdd={() => quickAdd(group.id)} />
          </GroupCard>
        ))}

        <GroupCard title="Ungrouped" ungrouped>
          <TagChips tags={tagsIn(null)} editingTag={editingTag} setEditingTag={setEditingTag} onRenameSave={saveTagRename} onMerge={(t) => setMerge({ source: t, destId: null })} onDelete={(t) => setConfirm({ kind: "tag", id: t.id, name: t.name })} />
          <QuickAdd value={drafts.ungrouped ?? ""} onChange={(v) => setDrafts((d) => ({ ...d, ungrouped: v }))} onAdd={() => quickAdd(null)} />
        </GroupCard>

        <div className="flex items-center gap-2 rounded-[var(--sz-admin-radius-card)] border border-dashed border-line bg-raised px-4 py-3">
          <input value={groupDraft} onChange={(e) => setGroupDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && groupDraft.trim()) { const n = groupDraft.trim(); setGroupDraft(""); startTransition(async () => handle(await addTagGroup(n), "Group added.")); } }} placeholder="Add a tag group…" className="min-h-9 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-3 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700" />
          <button type="button" onClick={() => { const n = groupDraft.trim(); if (!n) return; setGroupDraft(""); startTransition(async () => handle(await addTagGroup(n), "Group added.")); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--sz-admin-radius-control)] border border-line px-3 text-[12.5px] font-semibold text-body hover:border-primary-700">
            <Icon name="plus" size={14} /> Add group
          </button>
        </div>
      </div>

      {/* Merge dialog */}
      {merge && (
        <>
          <button type="button" aria-label="Close" onClick={() => setMerge(null)} className="fixed inset-0 z-40 bg-[var(--sz-overlay)]" />
          <div role="dialog" aria-modal="true" aria-label="Merge tag" className="fixed left-1/2 top-1/2 z-50 w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--sz-admin-radius-card)] border border-line bg-raised p-5 shadow-[var(--sz-shadow-modal)]">
            <h3 className="font-display text-lg font-medium text-heading">Merge “{merge.source.name}”</h3>
            <p className="mt-1 text-[13px] text-muted">Every product tagged <strong className="text-body">{merge.source.name}</strong> ({merge.source.productCount}) gains the destination tag, and “{merge.source.name}” is deleted. This can&rsquo;t be undone.</p>
            <p className="mb-1.5 mt-4 text-xs font-semibold text-body">Merge into</p>
            <select value={merge.destId ?? ""} onChange={(e) => setMerge({ ...merge, destId: e.target.value ? Number(e.target.value) : null })} className="min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none focus-visible:border-primary-700">
              <option value="">Choose a tag…</option>
              {mergeTargets.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
            <div className="mt-5 flex justify-end gap-2.5">
              <button type="button" onClick={() => setMerge(null)} disabled={busy} className="min-h-11 rounded-[var(--sz-admin-radius-control)] border border-line px-4 text-[13px] font-semibold text-body hover:border-primary-700">Cancel</button>
              <button type="button" onClick={doMerge} disabled={busy || merge.destId == null} className="min-h-11 rounded-[var(--sz-admin-radius-control)] bg-error px-4 text-[13px] font-semibold text-white hover:bg-danger-hover disabled:opacity-[var(--sz-disabled-opacity)]">Merge</button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "group" ? "Delete tag group?" : "Delete tag?"}
        tone="danger"
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={doDelete}
        body={confirm && (confirm.kind === "group"
          ? (<><strong className="text-body">{confirm.name}</strong> will be removed; its tags become ungrouped.</>)
          : (<><strong className="text-body">{confirm.name}</strong> will be removed from every product that carries it.</>))}
      />
    </div>
  );
}

function GroupCard({
  title,
  visible,
  ungrouped = false,
  editing,
  onEditStart,
  onEditChange,
  onEditSave,
  onVisible,
  onDelete,
  children,
}: {
  title: string;
  visible?: boolean;
  ungrouped?: boolean;
  editing?: string | null;
  onEditStart?: () => void;
  onEditChange?: (v: string) => void;
  onEditSave?: () => void;
  onVisible?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
        {editing != null ? (
          <input autoFocus value={editing} onChange={(e) => onEditChange?.(e.target.value)} onBlur={onEditSave} onKeyDown={(e) => { if (e.key === "Enter") onEditSave?.(); }} className="min-h-8 max-w-[220px] rounded-[7px] border border-primary-700 bg-admin-canvas px-2 text-[13px] font-semibold text-heading outline-none" />
        ) : (
          <span className={cn("text-[13px] font-semibold", ungrouped ? "text-muted" : "text-heading")}>{title}</span>
        )}
        {!ungrouped && (
          <span className="ml-auto flex items-center gap-1.5">
            {onVisible && visible != null && <Switch checked={visible} onChange={onVisible} label={`Toggle ${title} visibility`} />}
            <button type="button" onClick={onEditStart} aria-label={`Rename ${title}`} className="inline-flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas"><Icon name="wrench" size={14} /></button>
            <button type="button" onClick={onDelete} aria-label={`Delete ${title}`} className="inline-flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-error-soft hover:text-error"><Icon name="trash" size={14} /></button>
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function TagChips({
  tags,
  editingTag,
  setEditingTag,
  onRenameSave,
  onMerge,
  onDelete,
}: {
  tags: TagRow[];
  editingTag: { id: number; value: string } | null;
  setEditingTag: (v: { id: number; value: string } | null) => void;
  onRenameSave: () => void;
  onMerge: (t: TagRow) => void;
  onDelete: (t: TagRow) => void;
}) {
  if (tags.length === 0) return <p className="px-1 py-1 text-[12.5px] text-muted">No tags here yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag.id} className="group inline-flex items-center gap-1.5 rounded-pill border border-line bg-admin-canvas py-1 pl-3 pr-1.5 text-[12.5px]">
          {editingTag?.id === tag.id ? (
            <input autoFocus value={editingTag.value} onChange={(e) => setEditingTag({ id: tag.id, value: e.target.value })} onBlur={onRenameSave} onKeyDown={(e) => { if (e.key === "Enter") onRenameSave(); if (e.key === "Escape") setEditingTag(null); }} className="min-h-6 w-28 rounded border border-primary-700 bg-raised px-1.5 text-[12.5px] outline-none" />
          ) : (
            <>
              <span className="font-medium text-body">{tag.name}</span>
              <span className="font-mono text-[10.5px] text-muted">{tag.productCount}</span>
            </>
          )}
          <span className="flex items-center">
            <button type="button" onClick={() => onMerge(tag)} aria-label={`Merge ${tag.name}`} title="Merge" className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-body"><Icon name="layers" size={13} /></button>
            <button type="button" onClick={() => setEditingTag({ id: tag.id, value: tag.name })} aria-label={`Rename ${tag.name}`} title="Rename" className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-body"><Icon name="wrench" size={13} /></button>
            <button type="button" onClick={() => onDelete(tag)} aria-label={`Delete ${tag.name}`} title="Delete" className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-error-soft hover:text-error"><Icon name="close" size={13} /></button>
          </span>
        </span>
      ))}
    </div>
  );
}

function QuickAdd({ value, onChange, onAdd }: { value: string; onChange: (v: string) => void; onAdd: () => void }) {
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }} placeholder="Quick-add a tag — press Enter" className="min-h-8 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line-soft bg-admin-canvas px-2.5 text-[12.5px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700" />
      <button type="button" onClick={onAdd} className="inline-flex min-h-8 items-center rounded-[var(--sz-admin-radius-control)] border border-line px-3 text-[12px] font-semibold text-body hover:border-primary-700">Add</button>
    </div>
  );
}
