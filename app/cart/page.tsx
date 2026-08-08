import type { Metadata } from "next";
import { listProducts } from "@/lib/catalog";
import { CartView } from "./_components/cart-view";

/**
 * The bag — Sazuna Cart.dc.html.
 *
 * A thin server shell. The bag itself lives in the browser (see
 * lib/cart-storage), so the body is a client component that asks the server to
 * price whatever it holds.
 */

export const metadata: Metadata = {
  title: "Your Bag",
  // A personal, per-visitor page with nothing to rank for.
  robots: { index: false, follow: true },
};

export default async function CartPage() {
  // Fetched on the server so the empty bag has something to offer without the
  // client making a second request to find out it is empty.
  const { products } = await listProducts({ sort: "popularity", pageSize: 4, page: 1 });

  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-10 pb-24 cart-stacked:pb-[118px] cart-narrow:px-[18px]">
      <CartView browseHref="/jewellery" suggestions={products} />
    </div>
  );
}
