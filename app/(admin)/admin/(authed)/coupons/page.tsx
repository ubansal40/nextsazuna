import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listCoupons } from "@/lib/admin/coupons";
import { CouponsScreen } from "./_components/coupons-screen";

export const metadata: Metadata = {
  title: "Coupons",
  robots: { index: false, follow: false },
};

export default async function CouponsPage() {
  await requireSection("coupons");
  const rows = await listCoupons();

  /*
   * "Now" is decided here and handed down, rather than read during render on
   * the client. Whether a coupon reads Active, Scheduled or Expired is a
   * comparison against the clock, and a clock read on both sides of hydration
   * is a mismatch waiting for a day boundary. Every action returns a fresh one.
   */
  return <CouponsScreen initial={rows} nowIso={new Date().toISOString()} />;
}
