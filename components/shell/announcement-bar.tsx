import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui";

const MESSAGES: { icon: IconName; label: string; hideOnMobile?: boolean }[] = [
  { icon: "truck", label: "Free insured shipping" },
  { icon: "refresh", label: "Cash on delivery available nationwide", hideOnMobile: true },
];

/**
 * Announcement bar — spec §Global shell. Oxblood-900 strip above the header,
 * which collapses once the page scrolls so the sticky header stays compact.
 */
export function AnnouncementBar({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div
      aria-hidden={collapsed}
      className={cn(
        "overflow-hidden bg-primary-900 text-canvas",
        "transition-[max-height,opacity] duration-[340ms] ease-[var(--sz-ease-out)]",
        collapsed ? "max-h-0 opacity-0" : "max-h-[42px] opacity-100",
      )}
    >
      <div className="mx-auto flex h-[42px] max-w-[var(--sz-container)] items-center justify-center gap-4 px-6 md:px-10">
        {MESSAGES.map(({ icon, label, hideOnMobile }) => (
          <span
            key={label}
            className={cn(
              "inline-flex items-center gap-2.5 text-2xs tracking-[var(--sz-tracking-wide)]",
              hideOnMobile && "hidden sm:inline-flex",
            )}
          >
            <Icon name={icon} size={14} className="text-accent" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
