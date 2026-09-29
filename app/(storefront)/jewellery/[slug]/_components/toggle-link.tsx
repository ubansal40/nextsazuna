"use client";

import Link from "next/link";
import type { ComponentProps, KeyboardEvent } from "react";

/**
 * A filter or sort link that also answers to Space.
 *
 * The listing's options are links, so filtering and sorting work without
 * JavaScript and every combination has a URL, but they carry `role="checkbox"`
 * and `role="radio"` because that is what they are to the reader. A screen
 * reader announces them as such, and the one key a checkbox or radio promises
 * is Space — which on a link does nothing but scroll the page. Enter still
 * follows the link as it always did, and without JavaScript nothing changes.
 */
export function ToggleLink({ onKeyDown, ...props }: ComponentProps<typeof Link>) {
  function handleKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== " ") return;
    event.preventDefault();
    event.currentTarget.click();
  }

  return <Link {...props} onKeyDown={handleKeyDown} />;
}
