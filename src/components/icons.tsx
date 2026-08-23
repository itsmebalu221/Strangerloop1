/* Hand-drawn inline SVG icon set — consistent 24px grid, stroke-based. */

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (props: P) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const Logo = (props: P) => (
  <svg {...base(props)} strokeWidth={2.2}>
    <path d="M2 15c2.4-5.5 4.2-5.5 6.6 0s4.2 5.5 6.6 0 3.6-4.5 6.8-1.8" />
    <circle cx="21" cy="6" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRadar = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 12 18.5 5.5" />
    <path d="M12 3a9 9 0 1 0 9 9" />
    <path d="M12 7a5 5 0 1 0 5 5" opacity="0.55" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconSpark = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 2.5 13.8 9l6.7 1.6-6.7 1.7L12 19l-1.8-6.7L3.5 10.6 10.2 9Z" />
    <path d="M19 16.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9Z" strokeWidth="1.4" opacity="0.7" />
  </svg>
);

export const IconChat = (props: P) => (
  <svg {...base(props)}>
    <path d="M4 6.5C4 5.1 5.1 4 6.5 4h11C18.9 4 20 5.1 20 6.5v7c0 1.4-1.1 2.5-2.5 2.5H10l-4.4 3.6c-.6.5-1.6.1-1.6-.8Z" />
    <path d="M8 9h8M8 12h5" opacity="0.65" />
  </svg>
);

export const IconNext = (props: P) => (
  <svg {...base(props)}>
    <path d="M4 6.5v11c0 .8.9 1.3 1.6.9l8-5.5c.6-.4.6-1.4 0-1.8l-8-5.5c-.7-.4-1.6.1-1.6.9Z" />
    <path d="M18.5 5.5v13" />
  </svg>
);

export const IconShield = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 3 5 5.8v5.4c0 4.5 3 7.8 7 9.3 4-1.5 7-4.8 7-9.3V5.8Z" />
    <path d="m9 11.5 2.2 2.2L15.5 9" />
  </svg>
);

export const IconFlag = (props: P) => (
  <svg {...base(props)}>
    <path d="M6 21V4" />
    <path d="M6 4.8c2.5-1.6 5-1.6 7.5 0s4.4 1.4 6 .4v8.2c-1.6 1-3.5 1.2-6-.4s-5-1.6-7.5 0" />
  </svg>
);

export const IconLink = (props: P) => (
  <svg {...base(props)}>
    <circle cx="7" cy="14.5" r="3.2" />
    <circle cx="17" cy="9.5" r="3.2" />
    <path d="M9.6 12.7l4.8-2.4" />
  </svg>
);

export const IconBlock = (props: P) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M6.2 6.2l11.6 11.6" />
  </svg>
);

export const IconUsers = (props: P) => (
  <svg {...base(props)}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
    <path d="M15.5 5.9a3.2 3.2 0 0 1 0 5.2M17.8 14.9c1.6.7 2.5 2.3 2.8 4.6" opacity="0.65" />
  </svg>
);

export const IconGear = (props: P) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" />
  </svg>
);

export const IconBell = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 4a5.5 5.5 0 0 0-5.5 5.5c0 4-1.5 5.4-1.5 5.4h14s-1.5-1.4-1.5-5.4A5.5 5.5 0 0 0 12 4Z" />
    <path d="M10 18.5a2.1 2.1 0 0 0 4 0" />
  </svg>
);

export const IconSearch = (props: P) => (
  <svg {...base(props)}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15.5 15.5 4.5 4.5" />
  </svg>
);

export const IconSend = (props: P) => (
  <svg {...base(props)}>
    <path d="M20 4 4.5 10.4c-.8.3-.8 1.4 0 1.7l5.6 2 2 5.5c.3.8 1.4.8 1.7 0Z" />
    <path d="M20 4 10 14" opacity="0.6" />
  </svg>
);

export const IconCheck = (props: P) => (
  <svg {...base(props)}>
    <path d="m4.5 12.5 5 5L19.5 7" />
  </svg>
);

export const IconX = (props: P) => (
  <svg {...base(props)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconChevronDown = (props: P) => (
  <svg {...base(props)}>
    <path d="m6 9.5 6 6 6-6" />
  </svg>
);

export const IconChevronRight = (props: P) => (
  <svg {...base(props)}>
    <path d="m9.5 6 6 6-6 6" />
  </svg>
);

export const IconArrowLeft = (props: P) => (
  <svg {...base(props)}>
    <path d="M20 12H4M10 6l-6 6 6 6" />
  </svg>
);

export const IconLogout = (props: P) => (
  <svg {...base(props)}>
    <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
    <path d="M17 8.5 20.5 12 17 15.5M9.5 12h11" />
  </svg>
);

export const IconEye = (props: P) => (
  <svg {...base(props)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

export const IconChart = (props: P) => (
  <svg {...base(props)}>
    <path d="M4 4v16h16" />
    <path d="M8 15v-4M12 15V7M16 15v-6" />
  </svg>
);

export const IconGavel = (props: P) => (
  <svg {...base(props)}>
    <path d="m13.5 6.5 4 4M9 11l4 4M11.2 4.2l3.6 3.6-2.5 2.5-3.6-3.6ZM6.7 8.7l3.6 3.6L4.5 18c-.6.6-1.6.6-2.2 0-.6-.6-.6-1.6 0-2.2Z" />
    <path d="M13 20h8" />
  </svg>
);

export const IconGlobe = (props: P) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.2-3.8-8.5s1.3-6.2 3.8-8.5Z" />
  </svg>
);

export const IconClock = (props: P) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5.2l3.4 2" />
  </svg>
);

export const IconWarn = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 4 2.8 19.5h18.4Z" />
    <path d="M12 10v4.2" />
    <circle cx="12" cy="16.8" r="0.4" fill="currentColor" />
  </svg>
);

export const IconTrash = (props: P) => (
  <svg {...base(props)}>
    <path d="M5 7h14M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7M7 7l.8 11.4c.1.9.8 1.6 1.7 1.6h5c.9 0 1.6-.7 1.7-1.6L17 7" />
    <path d="M10.2 11v5M13.8 11v5" opacity="0.6" />
  </svg>
);

export const IconInfo = (props: P) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.4" fill="currentColor" />
  </svg>
);

export const IconHeartHand = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 8.6c1.2-2.4 4.6-2.4 5.6-.1.9 2-1 4-5.6 7.4-4.6-3.4-6.5-5.4-5.6-7.4 1-2.3 4.4-2.3 5.6.1Z" />
    <path d="M4 20c2.4-1.3 5.2-1.3 8 0 2.8-1.3 5.6-1.3 8 0" opacity="0.6" />
  </svg>
);

export const IconWave = (props: P) => (
  <svg {...base(props)}>
    <path d="M2 12c2.5 0 2.5-5 5-5s2.5 8 5 8 2.5-8 5-8 2.5 5 5 5" />
  </svg>
);

export const IconKey = (props: P) => (
  <svg {...base(props)}>
    <circle cx="8" cy="14.5" r="4" />
    <path d="m11 11.5 8-8M16.5 6l2.5 2.5M14 8.5l2 2" />
  </svg>
);

export const IconRefresh = (props: P) => (
  <svg {...base(props)}>
    <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15" />
    <path d="M19.5 4.5V9H15M4.5 19.5V15H9" />
  </svg>
);
