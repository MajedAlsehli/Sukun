/**
 * The Sukun icon set — inline SVG primitives, one consistent grammar:
 * 24x24 viewBox, `currentColor`, round caps/joins, strokeWidth 1.5.
 *
 * Deliberately not a dependency: every one of the 21 converted screens
 * already draws its own inline `<svg>` paths, and the anti-emoji rule this
 * set exists to satisfy asks for "clean SVG primitives", not a package.
 * Adding an icon library would leave two icon grammars in the same app.
 *
 * These replace the emoji characters the prototype screens shipped with
 * (camera, upload, bell, heart, sparkle, pin, money) — emojis render
 * differently per-platform and read as unfinished in a premium product.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SparkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.2 13.7 8a4 4 0 0 0 2.3 2.3l4.8 1.7-4.8 1.7A4 4 0 0 0 13.7 16L12 20.8 10.3 16A4 4 0 0 0 8 13.7L3.2 12 8 10.3A4 4 0 0 0 10.3 8Z" />
    <path d="M18.5 3.5v3M20 5h-3" />
  </Icon>
);

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 9.5A2.5 2.5 0 0 1 5.5 7h1.6a1.5 1.5 0 0 0 1.3-.75l.7-1.2A1.5 1.5 0 0 1 10.4 4h3.2a1.5 1.5 0 0 1 1.3.75l.7 1.2A1.5 1.5 0 0 0 16.9 7h1.6A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
    <circle cx="12" cy="12.8" r="3.4" />
  </Icon>
);

export const GalleryIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <circle cx="8.5" cy="9.8" r="1.6" />
    <path d="m3.5 16.5 4.4-4a2 2 0 0 1 2.7 0l3.1 2.9a2 2 0 0 0 2.7 0l2.1-1.9" />
  </Icon>
);

export const UploadCloudIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 17.5a4.2 4.2 0 0 1-.4-8.4 5.6 5.6 0 0 1 10.7-1.3A3.9 3.9 0 0 1 18 17.5" />
    <path d="M12 12v8M9 14.5 12 11.5l3 3" />
  </Icon>
);

export const ScanIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8V6.2A2.7 2.7 0 0 1 6.2 3.5H8M16 3.5h1.8A2.7 2.7 0 0 1 20.5 6.2V8M20.5 16v1.8a2.7 2.7 0 0 1-2.7 2.7H16M8 20.5H6.2a2.7 2.7 0 0 1-2.7-2.7V16" />
    <path d="M3.5 12h17" />
  </Icon>
);

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.2 5 5.8v5.4c0 4.3 2.9 7.6 7 9.6 4.1-2 7-5.3 7-9.6V5.8Z" />
    <path d="m9.2 12.1 2 2 3.6-3.8" />
  </Icon>
);

export const WrenchIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.8 6.2a4.4 4.4 0 0 0 5.5 5.6l-8 8a2.6 2.6 0 0 1-3.7-3.7Z" />
    <path d="M17.4 3.6 20.4 6.6" />
  </Icon>
);

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 11 12 4l8.5 7" />
    <path d="M5.8 9.4V20h12.4V9.4" />
    <path d="M10 20v-5h4v5" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20.5 20.5-4.2-4.2" />
  </Icon>
);

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 9.5a6 6 0 1 0-12 0c0 4.2-1.5 5.6-1.5 5.6h15S18 13.7 18 9.5" />
    <path d="M10.3 18.5a2 2 0 0 0 3.4 0" />
  </Icon>
);

export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p} fill={filled ? "currentColor" : "none"}>
    <path d="M12 19.6 4.9 12.7a4.3 4.3 0 0 1 6.1-6.1l1 1 1-1a4.3 4.3 0 0 1 6.1 6.1Z" />
  </Icon>
);

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 10.4c0 5-7 11-7 11s-7-6-7-11a7 7 0 0 1 14 0Z" />
    <circle cx="12" cy="10.2" r="2.6" />
  </Icon>
);

export const WalletIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8.2A2.2 2.2 0 0 1 5.7 6h11.1a2.2 2.2 0 0 1 2.2 2.2" />
    <rect x="3.5" y="8.2" width="17" height="10.3" rx="2.4" />
    <circle cx="16.4" cy="13.4" r="1.2" />
  </Icon>
);

export const BedIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 18v-9M3.5 13.4h17V18M20.5 13.4a3 3 0 0 0-3-3h-5.2v3" />
    <circle cx="7.6" cy="10" r="1.9" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5.2" width="17" height="15.3" rx="2.4" />
    <path d="M3.5 10h17M8.4 3.5v3.4M15.6 3.5v3.4" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.8 12.6 4.6 4.6 9.8-10.4" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.2 21 19.6H3Z" />
    <path d="M12 10v4.2M12 17.2v.1" />
  </Icon>
);

export const ArrowIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m14.5 5.5-6 6.5 6 6.5" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6" />
  </Icon>
);

export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 4 3.8 10.4l6.3 2.6 2.6 6.3Z" />
    <path d="M20 4 10.1 13" />
  </Icon>
);

export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16.4 4.6a2.3 2.3 0 0 1 3.2 3.2L8.4 19H5.2v-3.2Z" />
    <path d="M14.6 6.4 17.8 9.6" />
  </Icon>
);

export const NoteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 4.5h9.2L19 8.8v10.7H5.5Z" />
    <path d="M14.2 4.7v4.4h4.5M8.8 13h6.4M8.8 16.2h4.2" />
  </Icon>
);

export const BuildingIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 20.5V6.2L12 3.5l7.5 2.7v14.3" />
    <path d="M4.5 20.5h15M9 9.4h1.6M13.4 9.4H15M9 13.2h1.6M13.4 13.2H15M10.4 20.5v-3.7h3.2v3.7" />
  </Icon>
);
