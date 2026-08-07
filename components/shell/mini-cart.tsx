"use client";

import { Button, Drawer, Icon } from "@/components/ui";

export interface MiniCartLine {
  id: string;
  title: string;
  variant?: string;
  price: string;
  quantity: number;
}

export interface MiniCartProps {
  open: boolean;
  onClose: () => void;
  lines?: MiniCartLine[];
  subtotal?: string;
}

/**
 * Mini-cart drawer — spec §Global shell. Renders from props today; the cart
 * phase swaps the props for real cart state without changing this markup.
 */
export function MiniCart({ open, onClose, lines = [], subtotal }: MiniCartProps) {
  const empty = lines.length === 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Your bag"
      footer={
        !empty && (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Subtotal</span>
              <span className="font-mono text-md font-medium tabular-nums text-heading tracking-[var(--sz-tracking-tight)]">
                {subtotal}
              </span>
            </div>
            <p className="text-xs text-muted">Shipping and taxes calculated at checkout.</p>
            <Button size="lg" className="w-full">
              Checkout
            </Button>
            <Button variant="ghost" onClick={onClose} className="w-full">
              Continue shopping
            </Button>
          </div>
        )
      }
    >
      {empty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-[var(--sz-radius-pill)] bg-surface text-muted">
            <Icon name="bag" size={24} />
          </span>
          <p className="text-sm text-muted">Your bag is empty.</p>
          <Button variant="secondary" onClick={onClose}>
            Browse bestsellers
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-5 list-none p-0 m-0">
          {lines.map((line) => (
            <li key={line.id} className="flex gap-4">
              <span
                aria-hidden="true"
                className="size-16 shrink-0 rounded-[var(--sz-radius-md)] border border-line"
                style={{
                  background:
                    "radial-gradient(120% 120% at 32% 22%, var(--sz-media-from), var(--sz-media-to))",
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-body">{line.title}</p>
                {line.variant && <p className="mt-0.5 text-xs text-muted">{line.variant}</p>}
                <p className="mt-1 font-mono text-sm tabular-nums text-heading">
                  {line.price}
                  <span className="text-muted"> × {line.quantity}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
