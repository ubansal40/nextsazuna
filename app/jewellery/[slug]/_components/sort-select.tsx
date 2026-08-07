"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";

const OPTIONS = [
  { value: "popularity", label: "Popularity" },
  { value: "price-asc", label: "Price · low to high" },
  { value: "price-desc", label: "Price · high to low" },
  { value: "newest", label: "Newest" },
];

/**
 * Sort control.
 *
 * Navigates rather than fetching, so the sorted URL is shareable, bookmarkable
 * and crawlable, and the server does the querying. Changing sort resets to page
 * one — staying on page 7 of a reordered list shows the customer an arbitrary
 * slice of results.
 */
export function SortSelect({ basePath }: { basePath: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("sort") ?? "popularity";

  return (
    <Select
      id="plp-sort"
      aria-label="Sort by"
      value={current}
      fieldClassName="w-auto"
      className="w-auto min-w-[200px]"
      onChange={(event) => {
        const next = new URLSearchParams(params.toString());
        if (event.target.value === "popularity") next.delete("sort");
        else next.set("sort", event.target.value);
        next.delete("page");
        const qs = next.toString();
        router.push(qs ? `${basePath}?${qs}` : basePath);
      }}
    >
      {OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
