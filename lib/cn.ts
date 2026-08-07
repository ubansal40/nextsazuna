import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones.
 * Every component takes a `className` prop and funnels it through here, so a
 * caller can always override a default without `!important` or specificity wars.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
