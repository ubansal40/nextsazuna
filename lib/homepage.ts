import "server-only";

import { getContentBlock } from "./content";
import { toBlocks } from "./homepage-blocks";

/**
 * Homepage composition — the database half.
 *
 * All the parsing lives in `./homepage-blocks`, which carries no `server-only`
 * so the admin's draft validation and `scripts/check-content.mts` can run the
 * REAL parser rather than a second copy of its rules. This file is only the
 * read.
 */

export type {
  HeroSlide,
  Tile,
  UspItem,
  FeatureCard,
  Review,
  ProductTab,
  HomeBlock,
} from "./homepage-blocks";

export async function getHomepageBlocks(): Promise<import("./homepage-blocks").HomeBlock[]> {
  return toBlocks(await getContentBlock<{ blocks?: unknown }>("homepage_layout"));
}
