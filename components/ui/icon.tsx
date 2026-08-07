import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Ceremony line icons — 24×24 viewBox, `currentColor`, 1.7 stroke, rounded caps.
 * Colour comes from `currentColor` only — never pass a fill or stroke colour.
 */

const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  "chevron-down": <polyline points="6 9 12 15 18 9" />,
  "chevron-up": <polyline points="18 15 12 9 6 15" />,
  "chevron-right": <polyline points="9 6 15 12 9 18" />,
  "chevron-left": <polyline points="15 6 9 12 15 18" />,
  bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="17" cy="20" r="1.5" /><path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.6L21 7H7" /></>,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 20c1.6-3.5 5-5 8-5s6.4 1.5 8 5" /></>,
  heart: <path d="M12 21s-7-4.5-9.4-9.1A5 5 0 0 1 12 6.4a5 5 0 0 1 9.4 5.5C19 16.5 12 21 12 21z" />,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  minus: <line x1="5" y1="12" x2="19" y2="12" />,
  info: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
  alert: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
  shield: <path d="M12 2 4 5v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V5l-8-3z" />,
  star: <polygon points="12 2 15.1 8.6 22 9.5 17 14.4 18.2 21.5 12 18.1 5.8 21.5 7 14.4 2 9.5 8.9 8.6" />,
  truck: <><path d="M1 3h15v13H1z" /><path d="M16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
  refresh: <><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.6-4.2" /><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.6 4.2" /><polyline points="21 3 19.6 7.2 15.4 7.2" /><polyline points="3 21 4.4 16.8 8.6 16.8" /></>,
  filter: <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5" />,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="2 6 12 13 22 6" /></>,
  whatsapp: <path d="M20.5 3.5A11 11 0 0 0 3.7 17.3L2.5 21.5l4.3-1.2A11 11 0 1 0 20.5 3.5zM8.4 7.5c.2 0 .4 0 .6.5l.8 1.9c.1.3 0 .5-.1.7l-.5.6c-.2.2-.2.4 0 .7a9 9 0 0 0 4 3.5c.3.1.5.1.7-.1l.7-.8c.2-.2.4-.2.6-.1l1.9.9c.3.1.4.3.4.5 0 1-.8 2-1.8 2.2-.9.2-2 .2-4.6-1.1a12 12 0 0 1-4.6-4.7c-1-1.9-.9-3.3-.6-4a2.4 2.4 0 0 1 2.1-1.2z" />,
  instagram: <><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></>,
  facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><polygon points="10 9 15 12 10 15" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** Rendered size in px, applied to both axes. */
  size?: number;
}

export function Icon({ name, size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}

export const iconNames = Object.keys(PATHS) as IconName[];
