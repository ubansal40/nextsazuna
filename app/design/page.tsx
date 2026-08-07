import type { Metadata } from "next";
import {
  Accordion,
  Badge,
  Button,
  Checkbox,
  Icon,
  Input,
  METAL_OPTIONS,
  ProductCard,
  RadioGroup,
  Select,
  Skeleton,
  Textarea,
  Toggle,
  iconNames,
} from "@/components/ui";
import { Divider, Panel, Section } from "./_components/section";
import {
  FilterChipsDemo,
  OverlayDemos,
  StepperDemo,
  TabsDemo,
} from "./_components/interactive-demos";

export const metadata: Metadata = {
  title: "Ceremony design system",
  description: "Every component and variant in the Sazuna Ceremony design system.",
};

const PRIMARY_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

const NEUTRALS = [
  { token: "canvas", label: "Canvas" },
  { token: "surface", label: "Surface" },
  { token: "surface-raised", label: "Raised" },
  { token: "line", label: "Line" },
  { token: "line-soft", label: "Line soft" },
  { token: "muted", label: "Muted" },
  { token: "body", label: "Body" },
  { token: "heading", label: "Heading" },
];

const SEMANTIC = ["success", "error", "warning", "info"] as const;

const TYPE_SCALE = [
  { token: "4xl", sample: "Certified diamonds", note: "60px · leading 1.1" },
  { token: "3xl", sample: "Set in gold", note: "48px · leading 1.1" },
  { token: "2xl", sample: "Bridal & festive", note: "36px" },
  { token: "xl", sample: "Solitaire Halo Ring", note: "28px" },
  { token: "lg", sample: "Section heading", note: "22px" },
  { token: "md", sample: "Lead paragraph text", note: "18px" },
  { token: "base", sample: "Body — the velvet tray the jewellery sits on.", note: "16px" },
  { token: "sm", sample: "Secondary / helper text", note: "14px" },
  { token: "xs", sample: "Captions and meta", note: "12px" },
  { token: "2xs", sample: "SKU · DGR42 · 18KT", note: "11px" },
];

const SPACING = [4, 8, 12, 16, 24, 32, 48, 64, 96];
const RADII = ["xs", "sm", "md", "lg", "pill"];
const SHADOWS = ["xs", "sm", "md", "lg"];

const FONT_ROLES = [
  {
    font: "display",
    name: "Fraunces",
    role: "Display · Editorial",
    weights: "400 · 500 · 600 · 700 · italic",
    note: "h1–h3, hero, section titles",
  },
  {
    font: "ui",
    name: "General Sans",
    role: "UI · Body",
    weights: "400 · 500 · 600 · 700",
    note: "UI, body, labels — intentional, not default Inter",
  },
  {
    font: "mono",
    name: "Geist Mono",
    role: "Data · Price · SKU",
    weights: "400 · 500",
    note: "Tabular figures for prices, SKUs, admin tables",
  },
];

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-6 pb-24 md:px-10">
      <header className="py-16">
        <div className="mb-4 flex items-center gap-2.5">
          <span aria-hidden="true" className="size-2 rotate-45 bg-accent" />
          <span className="font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-primary-700">
            Palette A · Ceremony
          </span>
        </div>
        <h1 className="max-w-[15ch] text-4xl font-normal tracking-[var(--sz-tracking-tight)]">
          The Ceremony System
        </h1>
        <p className="mt-5 max-w-[64ch] text-md leading-[var(--sz-leading-relaxed)] text-body">
          Foundations and components for the Sazuna storefront and admin. Every value on this page
          resolves to a token in{" "}
          <code className="rounded-[var(--sz-radius-xs)] border border-line bg-surface px-1.5 py-0.5 font-mono text-xs">
            app/globals.css
          </code>
          , which is checked against the design spec on every build.
        </p>
      </header>

      {/* ============ COLOUR ============ */}
      <Section
        id="colour"
        eyebrow="Foundations · Colour"
        title="Colour"
        intro="Oxblood carries action, champagne gold carries occasion, warm ivory carries everything else. Each brand colour ships a hex track and an -rgb twin for alpha compositing."
      >
        <Panel label="Primary — Oxblood">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {PRIMARY_STEPS.map((step) => (
              <div key={step}>
                <div
                  className="h-16 rounded-[var(--sz-radius-sm)] border border-line"
                  style={{ background: `var(--sz-primary-${step})` }}
                />
                <p className="mt-1.5 font-mono text-2xs text-muted">{step}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">700 is the default CTA · 800 hover · 900 active.</p>

          <Divider />
          <p className="mb-[18px] font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-muted">
            Accent — Champagne Gold
          </p>
          <div className="grid grid-cols-3 gap-2">
            {["accent-soft", "accent", "accent-strong"].map((token) => (
              <div key={token}>
                <div
                  className="h-16 rounded-[var(--sz-radius-sm)] border border-line"
                  style={{ background: `var(--sz-${token})` }}
                />
                <p className="mt-1.5 font-mono text-2xs text-muted">{token}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Panel label="Neutrals — Warm Ivory">
            <div className="grid grid-cols-4 gap-2">
              {NEUTRALS.map((neutral) => (
                <div key={neutral.token}>
                  <div
                    className="h-14 rounded-[var(--sz-radius-sm)] border border-line"
                    style={{ background: `var(--sz-${neutral.token})` }}
                  />
                  <p className="mt-1.5 font-mono text-2xs text-muted">{neutral.label}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel label="Semantic">
            <div className="grid grid-cols-4 gap-2">
              {SEMANTIC.map((token) => (
                <div key={token}>
                  <div
                    className="flex h-14 items-end justify-start rounded-[var(--sz-radius-sm)] border border-line p-1.5"
                    style={{ background: `var(--sz-${token}-soft)` }}
                  >
                    <span
                      className="size-5 rounded-[var(--sz-radius-xs)]"
                      style={{ background: `var(--sz-${token})` }}
                    />
                  </div>
                  <p className="mt-1.5 font-mono text-2xs capitalize text-muted">{token}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </Section>

      {/* ============ TYPOGRAPHY ============ */}
      <Section
        id="typography"
        eyebrow="Foundations · Typography"
        title="Typography"
        intro="Three intentional roles carry the maison voice. All three are self-hosted and subset; font-display: swap with a metrics-matched fallback protects CLS."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {FONT_ROLES.map((entry) => (
            <Panel key={entry.font} label={entry.role}>
              <p
                className="text-3xl leading-none text-heading"
                style={{ fontFamily: `var(--sz-font-${entry.font})` }}
              >
                Aa
              </p>
              <p
                className="mt-4 text-lg text-heading"
                style={{ fontFamily: `var(--sz-font-${entry.font})` }}
              >
                {entry.name}
              </p>
              <p className="mt-1.5 text-sm text-body">{entry.note}</p>
              <p className="mt-3 font-mono text-2xs text-muted">{entry.weights}</p>
              <p className="mt-1 font-mono text-2xs text-muted">--sz-font-{entry.font}</p>
            </Panel>
          ))}
        </div>

        <Panel label="Type scale" className="mt-4">
          <div className="flex flex-col gap-4">
            {TYPE_SCALE.map((step) => (
              <div key={step.token} className="flex items-baseline justify-between gap-6">
                <span
                  className="min-w-0 truncate text-heading"
                  style={{
                    fontSize: `var(--sz-text-${step.token})`,
                    fontFamily: ["4xl", "3xl", "2xl", "xl", "lg"].includes(step.token)
                      ? "var(--sz-font-display)"
                      : "var(--sz-font-ui)",
                    lineHeight: "var(--sz-leading-tight)",
                  }}
                >
                  {step.sample}
                </span>
                <span className="shrink-0 font-mono text-2xs text-muted">
                  {step.token} · {step.note}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </Section>

      {/* ============ SCALES ============ */}
      <Section
        id="scales"
        eyebrow="Foundations · Scales"
        title="Spacing, radius & elevation"
        intro="A 4px spacing base, five radii, and four warm-tinted shadows. Shadows are tinted with the body colour rather than pure black, so they sit in the ivory world."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel label="Spacing · 4px base">
            <div className="flex flex-col gap-2">
              {SPACING.map((step) => (
                <div key={step} className="flex items-center gap-3">
                  <span className="h-3 bg-primary-200" style={{ width: `var(--sz-space-${step})` }} />
                  <span className="font-mono text-2xs text-muted">{step}px</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel label="Radius">
            <div className="flex flex-wrap gap-3">
              {RADII.map((radius) => (
                <div key={radius} className="text-center">
                  <div
                    className="size-16 border border-line bg-surface"
                    style={{ borderRadius: `var(--sz-radius-${radius})` }}
                  />
                  <p className="mt-1.5 font-mono text-2xs text-muted">{radius}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel label="Elevation">
            <div className="flex flex-wrap gap-4">
              {SHADOWS.map((shadow) => (
                <div key={shadow} className="text-center">
                  <div
                    className="size-16 rounded-[var(--sz-radius-md)] bg-raised"
                    style={{ boxShadow: `var(--sz-shadow-${shadow})` }}
                  />
                  <p className="mt-2 font-mono text-2xs text-muted">{shadow}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel label="Motion" className="mt-4">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { label: "--sz-dur-fast", value: "120ms", note: "hover, colour" },
              { label: "--sz-dur", value: "200ms", note: "most transitions" },
              { label: "--sz-dur-slow", value: "360ms", note: "drawers, card lift" },
            ].map((entry) => (
              <div key={entry.label}>
                <p className="font-mono text-sm text-heading">{entry.value}</p>
                <p className="mt-1 font-mono text-2xs text-muted">{entry.label}</p>
                <p className="mt-1 text-xs text-muted">{entry.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs text-muted">
            Easing: <code className="font-mono">--sz-ease-out</code> cubic-bezier(.22, 1, .36, 1) ·{" "}
            <code className="font-mono">--sz-ease-in-out</code> cubic-bezier(.65, 0, .35, 1). All
            motion is suppressed under <code className="font-mono">prefers-reduced-motion</code>.
          </p>
        </Panel>
      </Section>

      {/* ============ ICONS ============ */}
      <Section
        id="icons"
        eyebrow="Foundations · Iconography"
        title="Line icons"
        intro="24×24 viewBox, 1.7 stroke, rounded caps, currentColor only. Never pass a fill or stroke colour — icons inherit from their context."
      >
        <Panel label={`${iconNames.length} icons`}>
          <div className="grid grid-cols-4 gap-4 sm:grid-cols-8 lg:grid-cols-12">
            {iconNames.map((name) => (
              <div key={name} className="flex flex-col items-center gap-2 text-body">
                <Icon name={name} size={22} />
                <span className="text-center font-mono text-[9px] leading-tight text-muted">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </Section>

      {/* ============ BUTTON ============ */}
      <Section
        id="button"
        eyebrow="Component · Button"
        title="Button"
        intro="One filled primary per view. Focus rings come from the global :focus-visible rule, so no button restyles its own."
      >
        <Panel label="Variants">
          <div className="flex flex-wrap items-center gap-3.5">
            <Button>
              <Icon name="bag" size={18} />
              Add to Bag
            </Button>
            <Button variant="secondary">Buy Now</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="link">View all →</Button>
          </div>

          <Divider />
          <p className="mb-[18px] font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-muted">
            Sizes & icon-only
          </p>
          <div className="flex flex-wrap items-center gap-3.5">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button variant="icon" size="icon" aria-label="Search">
              <Icon name="search" size={20} />
            </Button>
            <Button variant="icon" size="icon" aria-label="Share">
              <Icon name="share" size={20} />
            </Button>
          </div>

          <Divider />
          <p className="mb-[18px] font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-muted">
            States — default · disabled · loading
          </p>
          <div className="flex flex-wrap items-center gap-3.5">
            <Button>Default</Button>
            <Button disabled>Disabled</Button>
            <Button loading>Adding…</Button>
          </div>
          <p className="mt-4 text-xs text-muted">
            Hover and focus are live — hover a button, or tab to one, to see them.
          </p>
        </Panel>
      </Section>

      {/* ============ FORMS ============ */}
      <Section
        id="forms"
        eyebrow="Component · Input & forms"
        title="Input & forms"
        intro="Every control is a real native element, so keyboard behaviour, form submission and screen-reader semantics come for free."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel label="Text field · states">
            <div className="flex flex-col gap-5">
              <Input
                id="demo-name"
                label="Full name"
                placeholder="Type here — this one is live"
                helper="We'll only use this for delivery."
              />
              <Input
                id="demo-address"
                label="Error"
                placeholder="Address"
                error="Please enter your delivery address."
              />
              <Input id="demo-disabled" label="Disabled" defaultValue="Not editable" disabled />
            </div>
          </Panel>

          <Panel label="Select · textarea · stepper">
            <div className="flex flex-col gap-5">
              <Select id="demo-sort" label="Sort by" defaultValue="popularity">
                <option value="popularity">Popularity</option>
                <option value="asc">Price · low to high</option>
                <option value="desc">Price · high to low</option>
                <option value="newest">Newest</option>
              </Select>
              <Textarea
                id="demo-note"
                label="Personalized note"
                placeholder="Add a message for the recipient…"
                maxLength={200}
                helper="Max 200 characters."
              />
              <div>
                <p className="mb-[7px] text-[length:var(--sz-text-control-sm)] font-semibold text-body">
                  Quantity
                </p>
                <StepperDemo />
              </div>
            </div>
          </Panel>
        </div>

        <Panel label="Toggle · checkbox · radio" className="mt-4">
          <div className="grid gap-7 md:grid-cols-[1fr_1fr_1.3fr]">
            <Toggle defaultChecked label="Insured shipping" helper="Interactive — click to toggle." />
            <Checkbox label="Add gift wrap · रु 250" helper="Interactive — click to check." />
            <RadioGroup
              name="demo-metal"
              legend="Gold colour"
              options={METAL_OPTIONS}
              defaultValue="yellow"
            />
          </div>
        </Panel>
      </Section>

      {/* ============ PRODUCT CARD ============ */}
      <Section
        id="cards"
        eyebrow="Component · Card"
        title="Product card"
        intro="The product is the hero. Sale pricing is a hard rule — oxblood, weight 600, Geist Mono, with the original struck alongside. Regular prices stay ink."
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <ProductCard
            title="Solitaire Halo Ring"
            href="/jewellery/solitaire-halo-ring"
            price="रु 1,25,000"
            compareAtPrice="रु 1,40,000"
            offerLabel="Offer"
            certified
          />
          <ProductCard
            title="Petal Drop Earrings"
            href="/jewellery/petal-drop-earrings"
            price="रु 78,500"
            certified
          />
          <ProductCard
            title="Halo Solitaire Pendant"
            href="/jewellery/halo-solitaire-pendant"
            price="रु 96,000"
            outOfStock
          />
          <div className="rounded-[var(--sz-radius-lg)] border border-line bg-raised p-4">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="mt-3.5 h-3.5 w-3/4" />
            <Skeleton className="mt-2 h-3.5 w-1/2" />
            <p className="mt-3 font-mono text-2xs text-muted">Loading state</p>
          </div>
        </div>
      </Section>

      {/* ============ BADGE & CHIP ============ */}
      <Section
        id="badges"
        eyebrow="Component · Badge & chip"
        title="Badge & chip"
        intro="Badges carry status; pick by meaning, not by the colour you want. Chips carry applied filters and are removable."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Panel label="Badges">
            <div className="flex flex-wrap gap-2.5">
              <Badge tone="inStock">In stock</Badge>
              <Badge tone="lowStock">Low stock</Badge>
              <Badge tone="outOfStock">Out of stock</Badge>
              <Badge tone="sale">Sale</Badge>
              <Badge tone="accent">Bestseller</Badge>
              <Badge tone="outline">Bridal</Badge>
              <Badge tone="info">Yellow gold</Badge>
              <Badge tone="neutral" mono size="sm">
                SGL certified
              </Badge>
            </div>
          </Panel>

          <FilterChipsDemo />
        </div>
      </Section>

      {/* ============ OVERLAYS ============ */}
      <Section
        id="overlays"
        eyebrow="Component · Overlays & navigation"
        title="Overlays & navigation"
        intro="Modal and drawer are built on native <dialog>, so focus trapping, Escape and background inerting come from the platform."
      >
        <div className="grid gap-4">
          <OverlayDemos />
          <TabsDemo />
          <Panel label="Accordion">
            <Accordion
              exclusive
              items={[
                {
                  id: "shipping",
                  question: "How long does delivery take?",
                  answer:
                    "Insured delivery within Kathmandu takes 1–2 working days, and 3–5 working days elsewhere in Nepal.",
                },
                {
                  id: "returns",
                  question: "Can I return a personalised piece?",
                  answer:
                    "Personalised and engraved pieces are made to order and cannot be returned, unless the piece arrives damaged or not as described.",
                },
                {
                  id: "certificate",
                  question: "Where is my SGL certificate?",
                  answer:
                    "The physical certificate ships inside the box, and a digital copy is attached to your order record in your account.",
                },
              ]}
            />
          </Panel>
        </div>
      </Section>
    </div>
  );
}
