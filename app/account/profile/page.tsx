import type { Metadata } from "next";
import { requireCustomer } from "@/lib/auth/require";
import { publicCustomer } from "@/lib/customers";
import { AccountShell, accountCard, accountEyebrow } from "../_components/account-shell";
import { ProfileForm } from "./_components/profile-form";

/** Profile — Sazuna Account.dc.html §Profile. */

export const metadata: Metadata = {
  title: "Your details",
  robots: { index: false, follow: false },
};

export default async function AccountProfilePage() {
  const customer = publicCustomer(await requireCustomer());

  return (
    <AccountShell current="/account/profile" title="Your details">
      <section className={accountCard}>
        <p className={accountEyebrow}>Sign-in details</p>
        <dl className="m-0 grid gap-3 grid-cols-2 policy-stacked:grid-cols-1">
          <div>
            <dt className="text-trust text-muted">Phone</dt>
            <dd className="m-0 font-mono text-sm text-heading">{customer.phone}</dd>
          </div>
          <div>
            <dt className="text-trust text-muted">Name</dt>
            <dd className="m-0 text-sm text-heading">{customer.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-trust text-muted">Email</dt>
            <dd className="m-0 text-sm text-heading">{customer.email || "—"}</dd>
          </div>
        </dl>
        {/* Answering the obvious question on the page beats making someone ask. */}
        <p className="m-0 mt-4 text-trust leading-relaxed text-muted">
          Your phone is how you sign in, so it can&rsquo;t be changed here — message us and
          we&rsquo;ll move your account across. Your name and email appear on invoices, so we
          keep those in step with your orders.
        </p>
      </section>

      <section className={`${accountCard} mt-3.5`}>
        <p className={accountEyebrow}>Delivery &amp; sizes</p>
        <p className="m-0 text-sm leading-relaxed text-muted">
          Saved here so checkout is quicker next time, and so we know your size when
          something needs resizing.
        </p>
        <ProfileForm customer={customer} />
      </section>
    </AccountShell>
  );
}
