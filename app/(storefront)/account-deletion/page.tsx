import type { Metadata } from "next";
import { Fragment } from "react";
import { Prose } from "@/components/ui";
import { ContentCta } from "@/components/content/content-cta";
import { PolicyBlocks } from "@/components/content/policy-blocks";
import { ContentHeader, policyContainer } from "@/components/content/policy-page";
import { PolicyToc } from "@/components/content/policy-toc";
import { accountDeletion } from "@/lib/content-pages/policy/account-deletion";
import { DeletionForm } from "./_components/deletion-form";

/**
 * Delete my data — Sazuna Policy.dc.html, with a form.
 *
 * Composed by hand rather than through <PolicyPage> because the form is a
 * section in its own right and belongs in the table of contents alongside the
 * prose. Everything else is the same furniture.
 */

export const metadata: Metadata = {
  title: "Delete my data",
  description:
    "Request deletion of your personal data from Sazuna Jewellers — past orders, contact details, marketing data.",
  alternates: { canonical: "/account-deletion" },
  /** Not indexed, and absent from the sitemap — see app/privacy/page.tsx. */
  robots: { index: false, follow: true },
};

const FORM_SECTION = { id: "request", label: "Request deletion" };

export default function AccountDeletionPage() {
  const toc = [
    ...accountDeletion.sections.map((section) => ({ id: section.id, label: section.heading })),
    FORM_SECTION,
  ];

  return (
    <div className={policyContainer}>
      <ContentHeader
        kicker={accountDeletion.kicker}
        title={accountDeletion.title}
        updated={accountDeletion.updated}
      >
        <p className="m-0 mt-4 text-control leading-relaxed text-muted">
          Submit a request and we&rsquo;ll erase your personal information within 30 days.
        </p>
      </ContentHeader>

      <div className="mt-9 grid items-start gap-[var(--sz-toc-gap)] grid-cols-[var(--sz-toc-w)_minmax(0,1fr)] policy-stacked:mt-5 policy-stacked:grid-cols-1 policy-stacked:gap-0">
        <PolicyToc entries={toc} />

        <div>
          <Prose>
            {accountDeletion.sections.map((section) => (
              <Fragment key={section.id}>
                <h2 id={section.id}>{section.heading}</h2>
                <PolicyBlocks blocks={section.blocks} />
              </Fragment>
            ))}

            <h2 id={FORM_SECTION.id}>{FORM_SECTION.label}</h2>
            <p>
              Email is required so we can match your records and confirm completion. Phone and name
              help us find orders faster — fill them in if you&rsquo;re comfortable sharing.
            </p>
          </Prose>

          <div className="max-w-[var(--sz-prose-max)]">
            <DeletionForm />
          </div>

          <ContentCta cta={accountDeletion.cta} className="max-w-[var(--sz-prose-max)]" />
        </div>
      </div>
    </div>
  );
}
