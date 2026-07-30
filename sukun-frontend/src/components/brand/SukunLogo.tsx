/**
 * The official SUKUN logo, vectorised straight from the brand kit
 * (`SUKUN BY GHADA ALYAHYA.pdf`, p.2 "Logo") — this is the real artwork, not
 * a redrawn approximation.
 *
 *  - ARCH_D  the three nested arches, traced from the kit's own artboard with
 *            the keystone gaps already subtracted (99.4% area match), so the
 *            mark needs no <mask> and sits on any surface.
 *  - GEMS    the three keystone diamonds — navy / blue / gold, top to bottom,
 *            at the kit's exact coordinates.
 *  - WORD_D  "سُكن" set in Etlalah Bold, lifted from the kit's own glyph
 *            outlines, so the wordmark renders identically without shipping
 *            or loading that font.
 *
 * All coordinates live in the kit's 753x753 artboard space, so the lockup
 * keeps the official proportion exactly: the wordmark spans 466 units against
 * the arch's 476, both centred on the same axis. Sizes are driven off a
 * single `size` prop (total height), so the two halves can never drift.
 */

const ARCH_D =
  "M419.5,145.0 441.5,160.0 470.0,184.0 492.0,206.0 513.5,231.0 529.0,251.5 548.5,281.5 569.5,321.0 582.5,351.0 592.5,379.0 601.5,412.0 606.5,436.0 611.5,469.5 614.5,517.0 614.5,615.0 613.5,616.0 477.0,615.5 475.0,586.0 469.0,556.0 459.0,527.0 449.0,506.5 435.0,484.0 421.0,466.0 406.0,450.5 382.5,431.0 418.0,395.0 432.5,407.0 452.5,427.5 464.5,442.5 476.5,460.0 486.5,477.0 498.5,502.0 506.5,522.5 512.5,543.0 516.0,560.0 517.0,573.5 520.0,583.5 521.0,582.5 521.0,571.0 519.0,548.0 516.0,523.5 510.0,493.0 499.0,458.0 491.0,438.0 481.0,417.5 460.0,384.0 437.5,356.0 412.5,331.5 396.5,318.5 382.0,308.5 418.5,272.0 448.0,296.0 466.5,314.0 480.0,329.0 500.0,355.0 523.5,394.0 538.5,426.0 551.5,463.0 560.5,499.0 564.5,526.5 566.0,553.0 566.5,554.5 568.0,555.0 568.5,532.0 567.5,505.0 565.0,475.5 561.0,450.5 557.0,431.5 547.0,396.0 539.0,373.5 529.0,350.0 517.0,326.5 503.0,303.0 486.0,278.5 469.5,258.0 459.0,246.0 434.5,221.5 413.5,203.5 383.5,182.0 419.0,145.5Z M333.0,145.5 369.5,182.5 356.0,191.5 328.0,213.5 289.0,252.0 271.5,273.0 257.0,293.0 237.5,324.0 225.5,347.0 213.5,375.0 203.5,403.5 192.5,446.5 186.5,488.5 184.5,519.5 184.5,554.5 185.5,555.5 187.0,552.5 190.0,513.5 199.0,471.5 206.0,448.5 214.5,425.5 229.0,394.5 243.0,370.0 253.0,355.0 274.0,328.0 303.0,298.0 334.0,273.0 370.5,309.0 339.5,332.5 313.5,358.5 289.5,389.0 270.5,420.5 255.5,453.5 241.5,498.5 234.5,541.5 232.0,575.5 232.0,581.5 233.0,583.0 234.5,581.0 237.0,559.0 243.0,533.5 254.0,503.0 265.0,479.5 276.0,460.5 291.0,439.0 303.5,424.0 321.5,406.0 334.5,395.5 370.5,431.5 356.0,442.5 335.0,463.0 318.5,483.5 303.5,507.5 294.5,526.0 284.5,554.5 278.5,582.0 275.5,616.0 139.5,616.0 138.5,615.5 139.0,501.0 143.0,457.5 148.0,428.0 155.0,398.5 165.0,366.0 175.0,340.0 189.0,310.0 207.0,278.0 224.5,251.5 242.0,228.5 263.0,204.5 286.0,182.0 311.0,161.0 332.5,146.0Z";

const GEM_D = [
  "M376.25,97.74 416.06,137.55 376.25,177.36 336.44,137.55Z",
  "M375.75,228.39 412.4,265.05 375.75,301.7 339.1,265.05Z",
  "M376.42,353.39 412.4,389.38 376.42,425.37 340.43,389.38Z",
];

const WORD_D =
  "M189.97 691.14Q184.71 691.14 180.92 687.44Q177.14 683.74 177.14 678.47Q177.14 673.04 180.92 669.34Q184.71 665.64 189.97 665.64Q195.24 665.64 199.02 669.34Q202.80 673.04 202.80 678.47Q202.80 683.74 199.02 687.44Q195.24 691.14 189.97 691.14ZM237.85 710.06V733.43H236.54V744.94Q236.54 753.67 232.67 761.73Q228.80 769.79 220.99 774.89Q213.17 779.99 201.49 779.99H178.29Q166.61 779.99 158.79 774.89Q150.97 769.79 147.11 761.73Q143.24 753.67 143.24 744.94V710.06H166.61V744.94Q166.61 749.39 169.49 753.01Q172.36 756.63 178.29 756.63H201.49Q207.41 756.63 210.29 753.01Q213.17 749.39 213.17 744.94V710.06Z M233.40 733.43Q229.78 733.43 227.39 731.04Q225.01 728.65 225.01 725.04V718.45Q225.01 714.83 227.39 712.45Q229.78 710.06 233.40 710.06H446.48V698.38Q446.48 692.62 442.78 689.74Q439.08 686.86 434.80 686.86H259.89V663.50L320.94 602.29L337.39 618.74L292.80 663.50H434.80Q443.52 663.50 451.50 667.36Q459.48 671.23 464.58 678.96Q469.68 686.70 469.68 698.38V733.43Z M531.37 671.39V665.47L549.14 662.34V655.10Q549.14 649.18 551.86 646.05Q554.57 642.93 560.33 641.78L562.96 641.45Q568.06 640.79 570.78 643.01Q573.49 645.23 573.49 650.00V652.80Q573.49 663.99 562.31 665.96ZM555.07 661.36 563.79 659.88Q565.43 659.55 566.50 658.15Q567.57 656.75 567.57 655.27V650.83Q567.57 648.19 566.50 647.45Q565.43 646.71 563.13 647.04L558.85 647.86Q557.37 648.19 556.22 649.67Q555.07 651.16 555.07 654.12Z M466.53 733.43Q462.91 733.43 460.53 731.04Q458.14 728.65 458.14 725.04V718.45Q458.14 714.83 460.53 712.45Q462.91 710.06 466.53 710.06H493.03V686.86H516.23V710.06H539.59V686.86H562.96V710.06H574.64Q580.40 710.06 583.36 706.44Q586.32 702.82 586.32 698.38V680.28H609.52V698.38Q609.68 707.10 605.82 715.16Q601.95 723.23 594.14 728.33Q586.32 733.43 574.64 733.43Z";

/* Ink bounds inside the kit artboard */
const ARCH = { x: 138, y: 133, w: 476, h: 482 };
const LOCKUP_H = 780 - ARCH.y; /* arch apex -> wordmark baseline */

export type BrandTone = "ink" | "onDark" | "gold";

/* The kit draws the arches and wordmark in its own near-black ink (#1e1e1d,
   `--brand-ink`), NOT in the navy ramp — that separation is what keeps the
   navy keystone legible against the arch. Reproduced faithfully here. */
const INK: Record<BrandTone, string> = {
  ink: "var(--brand-ink)",
  onDark: "var(--t-on-dark)",
  gold: "var(--a-500)",
};

/** Keystone colours per tone. `ink` is the kit's own navy/blue/gold; the
 *  tonal step (deep -> mid -> gold) is the identity, so on dark surfaces it
 *  inverts instead of disappearing. */
const GEM_INK: Record<BrandTone, string[]> = {
  ink: ["var(--g-900)", "var(--g-700)", "var(--a-500)"],
  onDark: ["var(--t-on-dark)", "var(--g-300)", "var(--a-300)"],
  gold: ["var(--a-700)", "var(--a-500)", "var(--a-300)"],
};

function Glyphs({ tone, word }: { tone: BrandTone; word: boolean }) {
  const gems = GEM_INK[tone];
  return (
    <>
      <path d={ARCH_D} fill={INK[tone]} />
      {GEM_D.map((d, i) => (
        <path key={i} d={d} fill={gems[i]} />
      ))}
      {word && <path d={WORD_D} fill={INK[tone]} />}
    </>
  );
}

/** The standalone arch mark — use where the name is already on screen. */
export function SukunMark({
  size = 32,
  tone = "ink",
  title,
}: {
  size?: number;
  tone?: BrandTone;
  title?: string;
}) {
  return (
    <svg
      width={(size * ARCH.w) / ARCH.h}
      height={size}
      viewBox={`${ARCH.x} ${ARCH.y} ${ARCH.w} ${ARCH.h}`}
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      style={{ display: "block", flex: "none", overflow: "visible" }}
    >
      {title && <title>{title}</title>}
      <Glyphs tone={tone} word={false} />
    </svg>
  );
}

/**
 * The vertical lockup: arch above, "سُكن" below, as one optical unit.
 * `size` is the *total* height, so dropping it into a navbar never changes
 * that navbar's height.
 */
export function SukunLogo({
  size = 44,
  tone = "ink",
  title = "سُكن",
}: {
  size?: number;
  tone?: BrandTone;
  title?: string;
}) {
  return (
    <svg
      width={(size * ARCH.w) / LOCKUP_H}
      height={size}
      viewBox={`${ARCH.x} ${ARCH.y} ${ARCH.w} ${LOCKUP_H}`}
      fill="none"
      role="img"
      style={{ display: "block", flex: "none", overflow: "visible" }}
    >
      <title>{title}</title>
      <Glyphs tone={tone} word />
    </svg>
  );
}
