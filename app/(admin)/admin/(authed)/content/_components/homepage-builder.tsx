"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon, useToast } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Switch } from "@/components/admin/switch";
import { useDialog } from "@/components/ui/use-dialog";
import { cn } from "@/lib/cn";
import {
  BLOCK_DEFS,
  isKnownKind,
  makeBlock,
  type BlockKind,
  type StoredBlock,
  type StoredLayout,
} from "@/lib/admin/homepage-schema";
import { findVanishing } from "@/lib/admin/homepage-validate";
import { saveHomepage } from "../_actions";
import { BlockPicker } from "./block-picker";
import { FieldRow, Repeater } from "./block-fields";

/**
 * The homepage builder.
 *
 * The whole homepage is one JSON block, so the risk here is not a bad save —
 * it is a save that succeeds and quietly removes a section. `findVanishing`
 * runs the storefront's own parser over the draft on every keystroke, and the
 * result is shown before the operator commits rather than discovered on the
 * shop.
 *
 * Editing is local until Save. There is no per-block autosave: a layout is one
 * document and half of it is not a state worth persisting.
 */
export function HomepageBuilder({
  initial,
  updatedBy,
  updatedAt,
}: {
  initial: StoredLayout;
  updatedBy: string | null;
  updatedAt: string | null;
}) {
  const { toast } = useToast();
  const [blocks, setBlocks] = useState<StoredBlock[]>(initial.blocks);
  const [saved, setSaved] = useState<StoredBlock[]>(initial.blocks);
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<StoredBlock | null>(null);
  const [busy, startTransition] = useTransition();

  const { ref: drawerRef, onBackdropClick } = useDialog(editing !== null, () => setEditing(null));

  const dirty = useMemo(() => JSON.stringify(blocks) !== JSON.stringify(saved), [blocks, saved]);
  const warnings = useMemo(() => findVanishing({ blocks }), [blocks]);
  const fatal = warnings.filter((w) => w.fatal);
  const current = editing ? blocks.find((b) => b.id === editing) ?? null : null;
  const currentDef = current && isKnownKind(current.type) ? BLOCK_DEFS[current.type] : null;
  const removingLabel =
    confirmRemove && isKnownKind(confirmRemove.type) ? BLOCK_DEFS[confirmRemove.type].label : confirmRemove?.type ?? "";

  function patch(id: string, next: Partial<StoredBlock>) {
    setBlocks((list) => list.map((b) => (b.id === id ? { ...b, ...next } : b)));
  }

  function setConfig(id: string, key: string, value: unknown) {
    setBlocks((list) =>
      list.map((b) => (b.id === id ? { ...b, config: { ...b.config, [key]: value } } : b)),
    );
  }

  /** Buttons, not drag — HTML5 drag never fires on touch and this runs on a phone. */
  function move(from: number, to: number) {
    if (to < 0 || to >= blocks.length) return;
    setBlocks((list) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function save() {
    if (busy) return;
    startTransition(async () => {
      const result = await saveHomepage({ blocks });
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      setBlocks(result.layout.blocks);
      setSaved(result.layout.blocks);
      const skipped = result.warnings.length;
      toast(
        "success",
        skipped > 0
          ? `Homepage saved. ${skipped} incomplete ${skipped === 1 ? "row was" : "rows were"} left out.`
          : "Homepage saved. It is live now.",
      );
    });
  }

  return (
    <div className="mx-auto max-w-[860px] pb-28">
      <header className="mb-4">
        <h1 className="m-0 text-[22px] font-semibold text-heading">Homepage</h1>
        <p className="m-0 mt-1 text-[13px] text-muted">
          Every section of the storefront homepage, in the order it appears.
          {updatedAt && (
            <>
              {" "}
              Last edited {new Date(updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              {updatedBy ? ` by ${updatedBy}` : ""}.
            </>
          )}
        </p>
      </header>

      {fatal.length > 0 && (
        <div role="alert" className="mb-3.5 rounded-[var(--sz-admin-radius-control)] border border-error-border bg-error-soft px-3.5 py-3">
          <p className="m-0 text-[12.5px] font-semibold text-error">
            {fatal.length === 1 ? "A section would not appear" : `${fatal.length} sections would not appear`}
          </p>
          <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
            {fatal.map((w, i) => (
              <li key={i} className="text-[12px] leading-snug text-error">
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {blocks.map((block, i) => {
          // Narrow through a local: a type predicate on `block.type` does not
          // survive the property access at each use site.
          const kind = block.type;
          const def = isKnownKind(kind) ? BLOCK_DEFS[kind] : null;
          const known = def !== null;
          const broken = warnings.some((w) => w.blockId === block.id && w.fatal);
          return (
            <div
              key={block.id}
              className={cn(
                "rounded-[var(--sz-admin-radius-card)] border bg-raised px-3 py-2.5",
                broken ? "border-error-border" : "border-line",
                !block.visible && "opacity-[.66]",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                {/* The title owns its own row on a narrow screen. Sharing one
                    line with the switch and four buttons left it ~88px, which
                    truncates "Hero carousel" two pixels from the end. */}
                <span className="flex min-w-0 flex-1 flex-col max-[520px]:basis-full">
                  <span className="truncate text-[13.5px] font-semibold text-heading">
                    {def?.label ?? block.type}
                    {!known && (
                      <span className="ml-1.5 font-mono text-[10px] font-medium uppercase tracking-[.08em] text-muted">
                        not shown
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[11.5px] text-muted">
                    {def ? def.summary(block.config) : "This site cannot draw this section."}
                  </span>
                </span>

                <Switch
                  label={`Show ${def?.label ?? block.type} on the homepage`}
                  checked={block.visible}
                  onChange={(visible) => patch(block.id, { visible })}
                />

                <span className="flex items-center gap-1 max-[520px]:ml-auto">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0}
                    aria-label={`Move ${def?.label ?? block.type} up`} className={rowAction}>
                    <Icon name="chevron-up" size={15} />
                  </button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === blocks.length - 1}
                    aria-label={`Move ${def?.label ?? block.type} down`} className={rowAction}>
                    <Icon name="chevron-down" size={15} />
                  </button>
                  <button type="button" onClick={() => setEditing(block.id)} disabled={!known}
                    title={known ? "Edit" : "This site cannot draw this section, so it cannot be edited here."}
                    aria-label={`Edit ${def?.label ?? block.type}`} className={rowAction}>
                    <Icon name="wrench" size={15} />
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(block)}
                    aria-label={`Remove ${def?.label ?? block.type}`} className={cn(rowAction, "text-error")}>
                    <Icon name="trash" size={15} />
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {blocks.length === 0 && (
        <p className="rounded-[var(--sz-admin-radius-card)] border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
          The homepage has no sections. Add one to get started.
        </p>
      )}

      <button
        type="button"
        onClick={() => setPicking(true)}
        className="mt-2.5 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[var(--sz-admin-radius-card)] border border-dashed border-line text-[13px] font-semibold text-primary-700 hover:border-primary-700 hover:bg-primary-50"
      >
        <Icon name="plus" size={15} /> Add a section
      </button>

      {/* Editor drawer — kept mounted and driven by `open`, so the platform
          restores focus on close. A dialog unmounted while open never does. */}
      <dialog ref={drawerRef} onClick={onBackdropClick} aria-label="Edit section" className={drawerClass}>
        {current && currentDef && (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
              <h2 className="m-0 text-[15px] font-semibold text-heading">{currentDef.label}</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className={rowAction}>
                <Icon name="close" size={17} />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4">
              {currentDef.fields.map((field) =>
                field.kind === "repeater" ? (
                  <Repeater
                    key={field.path}
                    field={field}
                    slug={current.id}
                    items={Array.isArray(current.config[field.path]) ? (current.config[field.path] as Record<string, unknown>[]) : []}
                    onChange={(next) => setConfig(current.id, field.path, next)}
                  />
                ) : (
                  <FieldRow
                    key={field.path}
                    field={field}
                    slug={current.id}
                    required={field.path === currentDef.requiredPath}
                    value={current.config[field.path]}
                    onChange={(next) => setConfig(current.id, field.path, next)}
                  />
                ),
              )}
            </div>

            <div className="shrink-0 border-t border-line px-4 py-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800"
              >
                Done
              </button>
              <p className="m-0 mt-1.5 text-center text-[11px] text-muted">
                Nothing is live until you press Save on the homepage.
              </p>
            </div>
          </div>
        )}
      </dialog>

      <BlockPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(kind: BlockKind) => {
          const block = makeBlock(kind, blocks);
          setBlocks((list) => [...list, block]);
          setPicking(false);
          setEditing(block.id);
        }}
      />

      <ConfirmDialog
        open={confirmRemove !== null}
        title="Remove this section?"
        body={`“${removingLabel}” will be taken off the homepage when you save. Its copy and images are not kept.`}
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove) setBlocks((list) => list.filter((b) => b.id !== confirmRemove.id));
          setConfirmRemove(null);
        }}
      />

      {/* Sticky save. `pb-28` on the page reserves room for it. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-raised/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-[860px] items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
            {dirty ? "Unsaved changes" : "Everything is saved"}
            {warnings.length > fatal.length && !fatal.length && (
              <span className="text-accent-strong"> · {warnings.length} incomplete {warnings.length === 1 ? "row" : "rows"} will be skipped</span>
            )}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty || fatal.length > 0}
            title={fatal.length > 0 ? "Fix the sections that would not appear first." : undefined}
            className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-primary-700 px-5 text-[13px] font-semibold text-white hover:bg-primary-800 disabled:opacity-[var(--sz-disabled-opacity)]"
          >
            {busy ? "Saving…" : "Save homepage"}
          </button>
        </div>
      </div>
    </div>
  );
}

const rowAction =
  "inline-flex size-8 max-[760px]:size-11 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-surface hover:text-primary-700 disabled:opacity-[var(--sz-disabled-opacity)] disabled:hover:bg-transparent disabled:hover:text-muted";

const drawerClass =
  "m-0 ml-auto h-dvh max-h-none w-[min(520px,100vw)] max-w-none border-l border-line bg-raised p-0 text-body shadow-[var(--sz-shadow-drawer)] backdrop:bg-[var(--sz-overlay)]";
