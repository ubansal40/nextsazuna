"use client";

import { useState } from "react";
import {
  Button,
  Chip,
  Drawer,
  Modal,
  QuantityStepper,
  Tabs,
  useToast,
} from "@/components/ui";
import { Panel } from "./section";

/** Removable filter chips — needs client state so removal actually removes. */
const DEFAULT_FILTERS = ["Rose gold", "White gold", "Under रु 1,00,000"];

export function FilterChipsDemo() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  return (
    <Panel label="Applied filters · removable">
      <div className="flex flex-wrap items-center gap-2.5">
        {filters.map((filter) => (
          <Chip
            key={filter}
            onRemove={() => setFilters((current) => current.filter((item) => item !== filter))}
          >
            {filter}
          </Chip>
        ))}
        {filters.length > 0 ? (
          <Button variant="link" onClick={() => setFilters([])}>
            Clear all
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Reset demo
          </Button>
        )}
      </div>
    </Panel>
  );
}

/** Modal + drawer + toast, which only demonstrate anything when driven. */
export function OverlayDemos() {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { toast } = useToast();

  return (
    <Panel label="Modal · Drawer · Toast">
      <div className="flex flex-wrap gap-3.5">
        <Button onClick={() => setModalOpen(true)}>Open modal</Button>
        <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
          Open drawer
        </Button>
        <Button variant="ghost" onClick={() => toast("success", "Added to your bag.")}>
          Fire success
        </Button>
        <Button variant="ghost" onClick={() => toast("error", "That size is out of stock.")}>
          Fire error
        </Button>
        <Button variant="ghost" onClick={() => toast("info", "Certificate sent to your email.")}>
          Fire info
        </Button>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        eyebrow="Certification"
        title="SGL certified diamonds"
      >
        <p className="m-0">
          Every Sazuna diamond is graded and certified by SGL. Your certificate details the 4Cs —
          carat, cut, colour and clarity — and travels with the piece, physically and in your order
          record.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-y-2 rounded-[var(--sz-radius-md)] border border-line bg-raised px-4 py-3.5 font-mono text-[length:var(--sz-text-control-sm)]">
          <dt className="text-muted">Certified by</dt>
          <dd className="m-0 text-right">SGL</dd>
          <dt className="text-muted">Diamond weight</dt>
          <dd className="m-0 text-right">0.52 ct</dd>
          <dt className="text-muted">Net weight</dt>
          <dd className="m-0 text-right">3.410 g</dd>
        </dl>
      </Modal>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Your bag">
        <p className="text-sm text-muted">
          The mini-cart uses this drawer. See the header bag icon for the real thing.
        </p>
      </Drawer>
    </Panel>
  );
}

export function StepperDemo() {
  return <QuantityStepper defaultValue={1} label="Quantity" />;
}

export function TabsDemo() {
  return (
    <Panel label="Tabs">
      <Tabs
        items={[
          {
            id: "specs",
            label: "Specifications",
            content: (
              <dl className="grid max-w-[420px] grid-cols-2 gap-y-2 font-mono text-[length:var(--sz-text-control-sm)]">
                <dt className="text-muted">Gold colour</dt>
                <dd className="m-0">Yellow · 18KT</dd>
                <dt className="text-muted">Diamond weight</dt>
                <dd className="m-0">0.52 ct</dd>
                <dt className="text-muted">Net weight</dt>
                <dd className="m-0">3.410 g</dd>
              </dl>
            ),
          },
          {
            id: "care",
            label: "Care",
            content: (
              <p className="m-0 max-w-[64ch]">
                Store separately in the pouch provided. Avoid perfume and chlorine. We clean and
                re-polish free of charge at any Sazuna store.
              </p>
            ),
          },
          {
            id: "story",
            label: "The Story",
            content: (
              <p className="m-0 max-w-[64ch]">
                Hand-set in our Kathmandu atelier, the halo is built stone by stone around a single
                certified solitaire.
              </p>
            ),
          },
        ]}
      />
    </Panel>
  );
}
