"use client";

import { useState } from "react";
import { Button, Icon, QuantityStepper, useToast } from "@/components/ui";

/**
 * Quantity + add-to-bag.
 *
 * The only interactive island on the PDP. Cart state does not exist yet, so
 * this currently confirms the interaction and nothing more — the cart phase
 * replaces the handler body without touching the markup or the layout.
 */
export function AddToBag({ productId, inStock }: { productId: number; inStock: boolean }) {
  const [quantity, setQuantity] = useState(1);
  const { toast } = useToast();

  if (!inStock) {
    return (
      <div className="flex flex-col gap-3">
        <Button size="lg" disabled className="w-full sm:w-auto">
          Out of stock
        </Button>
        <p className="text-xs text-muted">
          Tell us you want this and we will message you when it is back.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <QuantityStepper value={quantity} onValueChange={setQuantity} min={1} max={10} />
      <Button
        size="lg"
        onClick={() => toast("success", `Added ${quantity} to your bag.`)}
        data-product-id={productId}
      >
        <Icon name="bag" size={18} />
        Add to Bag
      </Button>
      <Button variant="secondary" size="lg">
        Buy Now
      </Button>
    </div>
  );
}
