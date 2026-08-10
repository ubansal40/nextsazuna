"use client";

import { useDialog } from "@/components/ui/use-dialog";
import { BLOCK_DEFS, BLOCK_KINDS, type BlockKind } from "@/lib/admin/homepage-schema";

/**
 * "Add a section" — a grid of what the homepage can draw.
 *
 * The list is `BLOCK_KINDS`, which is only the types the storefront parser
 * actually renders. The reference app also stored `newsletter` and `rich_text`
 * blocks; offering those here would let someone add a section that never
 * appears, which is the exact failure this whole feature is built to prevent.
 *
 * Native `<dialog>`, kept mounted and driven by `open`, so Escape, the focus
 * trap and focus restore come from the platform — and so closing it actually
 * returns focus, which an unmounted dialog never does.
 */
export function BlockPicker({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (kind: BlockKind) => void;
  onClose: () => void;
}) {
  const { ref, onBackdropClick } = useDialog(open, onClose);

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      aria-label="Add a section"
      className="m-auto w-[min(560px,calc(100vw-24px))] max-w-none rounded-[var(--sz-admin-radius-card)] border border-line bg-raised p-0 text-body shadow-[var(--sz-shadow-dropdown)] backdrop:bg-[var(--sz-overlay)]"
    >
      {open && (
        <div className="p-[18px]">
          <h2 className="m-0 mb-1 text-[17px] font-semibold text-heading">Add a section</h2>
          <p className="m-0 mb-3.5 text-[12.5px] text-muted">
            It is added at the bottom — move it where you want it.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {BLOCK_KINDS.map((kind) => {
              const def = BLOCK_DEFS[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => onPick(kind)}
                  className="rounded-lg border border-line bg-canvas p-2.5 text-left hover:border-primary-700 hover:bg-primary-50"
                >
                  <span className="block text-[13px] font-semibold text-heading">{def.label}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{def.description}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3.5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-9 items-center rounded-lg border border-line px-3.5 text-[13px] font-semibold text-body hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
