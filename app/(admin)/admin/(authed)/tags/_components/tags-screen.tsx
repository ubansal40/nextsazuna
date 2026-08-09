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
  moveTagAction,
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
 *
 * **Tags move by drag** — onto another group's card to regroup them, or onto a
 * tag to land in front of it, which is how order inside a group is set. Both are
 * the same write (`moveTag`), because a drop decides group and position at once.
 *
 * Drag is an affordance, not the interface. Every chip carries a Move control
 * that opens the same operation as two selects — group and position — so the
 * screen is fully usable from the keyboard, and on a touch device where HTML5
 * drag does not fire at all. That control is the primary one for correctness;
 * the drag is the shortcut.
 *
 * Moves are applied locally first so the chip follows the cursor's result
 * immediately, then reconciled with what the server stored — and rolled straight
 * back if the write is refused, so the screen never keeps a position the
 * database does not have.
 */

/** What the pointer is currently over: a group's card, or a specific chip. */
type DropTarget = { kind: "group"; groupId: number | null } | { kind: "tag"; tagId: number };

/** One key for the Ungrouped bucket and the real groups alike. */
const groupKey = (groupId: number | null) => (groupId == null ? "ungrouped" : `g${groupId}`);

/** `dragover` fires continuously; comparing targets by a stable key means the
 *  screen re-renders when the target actually changes, not sixty times a second
 *  because a fresh object was stored. */
const targetKey = (target: DropTarget | null) =>
  target == null ? "" : target.kind === "group" ? `group:${groupKey(target.groupId)}` : `tag:${target.tagId}`;

const tagsIn = (tags: TagRow[], groupId: number | null) => tags.filter((t) => t.groupId === groupId);

/**
 * Turn a drop target into a destination group and an insertion index.
 *
 * The index is counted against the destination group with the dragged tag
 * already removed, which is what makes "drop it back one place to the left"
 * behave the same whether the tag came from this group or another one. A null
 * index means the end.
 */
function targetOf(
  tags: TagRow[],
  sourceId: number,
  target: DropTarget,
): { groupId: number | null; index: number | null } | null {
  if (target.kind === "group") return { groupId: target.groupId, index: null };
  if (target.tagId === sourceId) return null;
  const anchor = tags.find((t) => t.id === target.tagId);
  if (!anchor) return null;
  const rest = tagsIn(tags, anchor.groupId).filter((t) => t.id !== sourceId);
  const index = rest.findIndex((t) => t.id === anchor.id);
  return { groupId: anchor.groupId, index: index < 0 ? null : index };
}

/**
 * The destination group's tags as they will read after the move, or null when
 * the move changes nothing — a drop that lands a tag exactly where it already
 * was must not cost a write, and must not leave an audit line claiming one.
 */
function planMove(
  tags: TagRow[],
  sourceId: number,
  groupId: number | null,
  index: number | null,
): TagRow[] | null {
  const source = tags.find((t) => t.id === sourceId);
  if (!source) return null;

  const rest = tagsIn(tags, groupId).filter((t) => t.id !== sourceId);
  const at = index == null ? rest.length : Math.max(0, Math.min(index, rest.length));
  const ordered = [...rest.slice(0, at), { ...source, groupId }, ...rest.slice(at)];

  const before = tagsIn(tags, groupId);
  const unchanged =
    source.groupId === groupId &&
    before.length === ordered.length &&
    before.every((t, i) => t.id === ordered[i].id);
  return unchanged ? null : ordered;
}

/**
 * Splice the reordered group back into the flat tag list.
 *
 * The list is flat and the UI buckets it with a filter, so only order *within* a
 * group is meaningful — every other group keeps its own relative order however
 * the arrays are concatenated.
 */
function applyMove(data: TagsData, groupId: number | null, ordered: TagRow[]): TagsData {
  const moved = new Set(ordered.map((t) => t.id));
  const others = data.tags.filter((t) => !moved.has(t.id) && t.groupId !== groupId);
  return { ...data, tags: [...others, ...ordered] };
}

export function TagsScreen({ initial, counts }: { initial: TagsData; counts: TaxonomyCounts }) {
  const { toast } = useToast();
  const [data, setData] = useState(initial);
  const [editingTag, setEditingTag] = useState<{ id: number; value: string } | null>(null);
  const [editingGroup, setEditingGroup] = useState<{ id: number; value: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [groupDraft, setGroupDraft] = useState("");
  const [merge, setMerge] = useState<{ source: TagRow; destId: number | null } | null>(null);
  const [move, setMove] = useState<{ source: TagRow; groupId: number | null; index: number } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "tag" | "group"; id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The dragged tag, and the target under the pointer. `over` is what makes the
  // drop target obvious — nothing about a chip hovering over a card says where
  // it would land unless the card says so.
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<DropTarget | null>(null);
  const [, startTransition] = useTransition();

  function handle(result: TagsResult, ok?: string) {
    if (result.ok) {
      setData(result.data);
      if (ok) toast("success", ok);
    } else {
      toast("error", result.error);
    }
  }

  const inGroup = (groupId: number | null) => tagsIn(data.tags, groupId);
  const draftKey = (groupId: number | null) => groupKey(groupId);
  const groupName = (groupId: number | null) =>
    groupId == null ? "Ungrouped" : (data.groups.find((g) => g.id === groupId)?.name ?? "that group");

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

  /** Move locally, then persist — and put it back exactly as it was if the
   *  server refuses, rather than leaving the screen ahead of the database. */
  function persistMove(tagId: number, groupId: number | null, ordered: TagRow[], ok?: string) {
    const before = data;
    setData(applyMove(data, groupId, ordered));
    startTransition(async () => {
      const result = await moveTagAction(tagId, groupId, ordered.map((t) => t.id));
      if (result.ok) {
        setData(result.data);
        if (ok) toast("success", ok);
      } else {
        setData(before);
        toast("error", result.error);
      }
    });
  }

  function onDrop(target: DropTarget) {
    const sourceId = drag;
    setDrag(null);
    setOver(null);
    if (sourceId == null) return;
    const resolved = targetOf(data.tags, sourceId, target);
    if (!resolved) return;
    const ordered = planMove(data.tags, sourceId, resolved.groupId, resolved.index);
    if (!ordered) return;
    persistMove(sourceId, resolved.groupId, ordered);
  }

  function doMove() {
    if (!move) return;
    const { source, groupId, index } = move;
    const ordered = planMove(data.tags, source.id, groupId, index);
    setMove(null);
    if (!ordered) return;
    persistMove(source.id, groupId, ordered, `Moved to ${groupName(groupId)}.`);
  }

  const mergeTargets = merge ? data.tags.filter((t) => t.id !== merge.source.id) : [];

  const hover = (target: DropTarget) =>
    setOver((prev) => (targetKey(prev) === targetKey(target) ? prev : target));

  /** The props every card needs to be a drop zone. */
  function dropZone(groupId: number | null) {
    return {
      dragging: drag !== null,
      dropActive: targetKey(over) === `group:${groupKey(groupId)}`,
      onDragOver: (e: React.DragEvent) => {
        // No preventDefault means no drop — so a file dragged onto the page is
        // not mistaken for a tag.
        if (drag === null) return;
        e.preventDefault();
        hover({ kind: "group", groupId });
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        onDrop({ kind: "group", groupId });
      },
    };
  }

  function chipProps(tag: TagRow) {
    return {
      draggable: editingTag?.id !== tag.id,
      dragging: drag === tag.id,
      dropBefore: drag !== tag.id && targetKey(over) === `tag:${tag.id}`,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag with no payload. The id in state is
        // what is actually read, because dragover needs it before any drop.
        e.dataTransfer.setData("text/plain", String(tag.id));
        setDrag(tag.id);
      },
      onDragEnd: () => {
        setDrag(null);
        setOver(null);
      },
      onDragOver: (e: React.DragEvent) => {
        if (drag === null) return;
        e.preventDefault();
        e.stopPropagation();
        hover({ kind: "tag", tagId: tag.id });
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        // Without this the card underneath also handles the drop and appends the
        // tag to the end, undoing the position this chip target just chose.
        e.stopPropagation();
        onDrop({ kind: "tag", tagId: tag.id });
      },
    };
  }

  const chipHandlers = {
    editingTag,
    setEditingTag,
    onRenameSave: saveTagRename,
    onMerge: (t: TagRow) => setMerge({ source: t, destId: null }),
    onDelete: (t: TagRow) => setConfirm({ kind: "tag", id: t.id, name: t.name }),
    onMove: (t: TagRow) =>
      setMove({ source: t, groupId: t.groupId, index: tagsIn(data.tags, t.groupId).findIndex((x) => x.id === t.id) }),
    chipProps,
  };

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
            {...dropZone(group.id)}
          >
            <TagChips tags={inGroup(group.id)} {...chipHandlers} />
            <QuickAdd value={drafts[draftKey(group.id)] ?? ""} onChange={(v) => setDrafts((d) => ({ ...d, [draftKey(group.id)]: v }))} onAdd={() => quickAdd(group.id)} />
          </GroupCard>
        ))}

        <GroupCard title="Ungrouped" ungrouped {...dropZone(null)}>
          <TagChips tags={inGroup(null)} {...chipHandlers} />
          <QuickAdd value={drafts.ungrouped ?? ""} onChange={(v) => setDrafts((d) => ({ ...d, ungrouped: v }))} onAdd={() => quickAdd(null)} />
        </GroupCard>

        <div className="flex items-center gap-2 rounded-[var(--sz-admin-radius-card)] border border-dashed border-line bg-raised px-4 py-3">
          <input value={groupDraft} onChange={(e) => setGroupDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && groupDraft.trim()) { const n = groupDraft.trim(); setGroupDraft(""); startTransition(async () => handle(await addTagGroup(n), "Group added.")); } }} placeholder="Add a tag group…" className="min-h-9 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-3 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700" />
          <button type="button" onClick={() => { const n = groupDraft.trim(); if (!n) return; setGroupDraft(""); startTransition(async () => handle(await addTagGroup(n), "Group added.")); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--sz-admin-radius-control)] border border-line px-3 text-[12.5px] font-semibold text-body hover:border-primary-700">
            <Icon name="plus" size={14} /> Add group
          </button>
        </div>
      </div>

      <p className="mt-2 font-mono text-[11px] text-muted">
        Drag a tag onto another group to regroup it, or in front of another tag to reorder it · or use a tag&rsquo;s
        move handle to do the same from the keyboard.
      </p>

      {/* Move dialog — the keyboard and touch equivalent of the drag. */}
      {move && (
        <MoveDialog
          source={move.source}
          groupId={move.groupId}
          index={move.index}
          groups={data.groups}
          tags={data.tags}
          onGroup={(groupId) =>
            // Landing at the end is the honest default for a group whose order
            // this admin has not looked at.
            setMove({ ...move, groupId, index: tagsIn(data.tags, groupId).filter((t) => t.id !== move.source.id).length })
          }
          onIndex={(index) => setMove({ ...move, index })}
          onCancel={() => setMove(null)}
          onConfirm={doMove}
        />
      )}

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

/**
 * Move a tag from the keyboard: the group it lands in, and where in that group.
 *
 * A native `<select>` rather than a custom listbox, so the platform supplies
 * type-ahead, the mobile picker and the screen-reader semantics. Position is
 * offered as plain 1-of-n, which is what an admin can actually see on the card.
 */
function MoveDialog({
  source,
  groupId,
  index,
  groups,
  tags,
  onGroup,
  onIndex,
  onCancel,
  onConfirm,
}: {
  source: TagRow;
  groupId: number | null;
  index: number;
  groups: TagsData["groups"];
  tags: TagRow[];
  onGroup: (groupId: number | null) => void;
  onIndex: (index: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Positions are counted with the moved tag already taken out, so "3 of 5"
  // means what it says once the tag is back in.
  const slots = tagsIn(tags, groupId).filter((t) => t.id !== source.id).length + 1;
  const at = Math.max(0, Math.min(index, slots - 1));

  return (
    <>
      <button type="button" aria-label="Close" onClick={onCancel} className="fixed inset-0 z-40 bg-[var(--sz-overlay)]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Move ${source.name}`}
        className="fixed left-1/2 top-1/2 z-50 w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--sz-admin-radius-card)] border border-line bg-raised p-5 shadow-[var(--sz-shadow-modal)]"
      >
        <h3 className="font-display text-lg font-medium text-heading">Move “{source.name}”</h3>
        <p className="mt-1 text-[13px] text-muted">
          A tag&rsquo;s group is the storefront filter it appears under; its position is the order within that filter.
        </p>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-semibold text-body">Group</span>
          <select
            autoFocus
            value={groupId ?? ""}
            onChange={(e) => onGroup(e.target.value ? Number(e.target.value) : null)}
            className={moveSelect}
          >
            <option value="">Ungrouped</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-semibold text-body">Position</span>
          <select value={at} onChange={(e) => onIndex(Number(e.target.value))} className={moveSelect}>
            {Array.from({ length: slots }, (_, i) => (
              <option key={i} value={i}>
                {i + 1} of {slots}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex justify-end gap-2.5">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-[var(--sz-admin-radius-control)] border border-line px-4 text-[13px] font-semibold text-body hover:border-primary-700">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="min-h-11 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white hover:bg-primary-800">
            Move
          </button>
        </div>
      </div>
    </>
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
  dragging = false,
  dropActive = false,
  onDragOver,
  onDrop,
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
  /** A drag is in flight somewhere on the screen — every card says it can take it. */
  dragging?: boolean;
  /** This card is the one under the pointer. */
  dropActive?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--sz-admin-radius-card)] border bg-raised transition-colors",
        dropActive ? "border-primary-700" : "border-line",
      )}
    >
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
        {editing != null ? (
          <input autoFocus value={editing} onChange={(e) => onEditChange?.(e.target.value)} onBlur={onEditSave} onKeyDown={(e) => { if (e.key === "Enter") onEditSave?.(); }} className="min-h-8 max-w-[220px] rounded-[7px] border border-primary-700 bg-admin-canvas px-2 text-[13px] font-semibold text-heading outline-none" />
        ) : (
          <span className={cn("text-[13px] font-semibold", ungrouped ? "text-muted" : "text-heading")}>{title}</span>
        )}
        {dropActive && (
          <span className="ml-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-primary-700">
            Drop to move here
          </span>
        )}
        {!ungrouped && (
          <span className="ml-auto flex items-center gap-1.5">
            {onVisible && visible != null && <Switch checked={visible} onChange={onVisible} label={`Toggle ${title} visibility`} />}
            <button type="button" onClick={onEditStart} aria-label={`Rename ${title}`} className="inline-flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas"><Icon name="wrench" size={14} /></button>
            <button type="button" onClick={onDelete} aria-label={`Delete ${title}`} className="inline-flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-error-soft hover:text-error"><Icon name="trash" size={14} /></button>
          </span>
        )}
      </div>
      {/* The whole body is the drop zone, not just the chips: dropping onto the
          empty space below them is the natural way to say "into this group,
          wherever". While a drag is live every body outlines itself, so the
          available targets are visible before the pointer reaches one. */}
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          "p-3 transition-colors",
          dragging && "outline-2 outline-dashed outline-offset-[-5px] outline-line-soft",
          dropActive && "bg-primary-50 outline-primary-700",
        )}
      >
        {children}
      </div>
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
  onMove,
  chipProps,
}: {
  tags: TagRow[];
  editingTag: { id: number; value: string } | null;
  setEditingTag: (v: { id: number; value: string } | null) => void;
  onRenameSave: () => void;
  onMerge: (t: TagRow) => void;
  onDelete: (t: TagRow) => void;
  onMove: (t: TagRow) => void;
  chipProps: (t: TagRow) => {
    draggable: boolean;
    dragging: boolean;
    dropBefore: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}) {
  if (tags.length === 0) return <p className="px-1 py-1 text-[12.5px] text-muted">No tags here yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const { dragging, dropBefore, ...dnd } = chipProps(tag);
        return (
          <span
            key={tag.id}
            {...dnd}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-pill border border-line bg-admin-canvas py-1 pl-1 pr-1.5 text-[12.5px] transition-opacity",
              dragging && "opacity-[var(--sz-disabled-opacity)]",
              // An inset rule on the leading edge reads as the caret it is:
              // the dragged tag lands in front of this one.
              dropBefore && "border-primary-700 shadow-[inset_3px_0_0_0_var(--sz-primary-700)]",
            )}
          >
            <button
              type="button"
              onClick={() => onMove(tag)}
              aria-label={`Move ${tag.name}`}
              title="Drag to move, or click to choose a group and position"
              className="inline-flex size-6 cursor-grab items-center justify-center rounded-full text-muted hover:bg-surface hover:text-body"
            >
              <Icon name="sort" size={13} />
            </button>
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
        );
      })}
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

const moveSelect =
  "min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none focus-visible:border-primary-700";
