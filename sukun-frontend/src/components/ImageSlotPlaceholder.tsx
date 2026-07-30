/**
 * Stand-in for the source `.dc.html` files' `<image-slot>` placeholder —
 * almost every slot across the export has no bound photo (only one slot in
 * the whole 20-file export does), so this renders the same neutral
 * "no photo yet" treatment the design tool itself shows, instead of a
 * broken <img>. Shared across screens (H2 Auth, H1 Landing) per
 * `07_Frontend_Status.md`'s own stated policy: extract a primitive once a
 * second screen genuinely needs it, rather than speculatively up front.
 */
export function ImageSlotPlaceholder({
  label,
  src,
  className,
  style,
}: {
  label: string;
  /** Real photo for this slot. Falls back to the neutral label box without it. */
  src?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={className}
        src={src}
        alt={label}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
      />
    );
  }
  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--n-surface2)",
        color: "var(--t-tertiary)",
        fontSize: 13,
        ...style,
      }}
    >
      {label}
    </div>
  );
}
