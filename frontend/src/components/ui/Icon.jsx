/**
 * Inline SVG icon set.
 *
 * Deliberately not a dependency (lucide-react / heroicons): the app needs ~35 glyphs and this
 * file is smaller than the import cost, keeps the "nothing heavier than fetch + Context" rule
 * the rest of the frontend follows, and ships zero runtime.
 *
 * All glyphs are drawn on the same 24x24 grid with `stroke="currentColor"` and no fill, so an
 * icon inherits its colour from the text around it and optically matches at any size. Stroke
 * width is 1.75 by default — 2 reads chunky next to Inter at 13-14px.
 */

const PATHS = {
  // --- navigation ---------------------------------------------------------
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </>
  ),
  package: (
    <>
      <path d="m21 8-9-5-9 5v8l9 5 9-5Z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v8" />
    </>
  ),
  plane: (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 2h14v20l-2.3-1.7L14.4 22l-2.4-1.7L9.6 22l-2.3-1.7L5 22Z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9.5 22v-4.5h5V22" />
      <path d="M8.5 6.5h.01M12 6.5h.01M15.5 6.5h.01M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-1.8a4 4 0 0 0-4-4H6.5a4 4 0 0 0-4 4V21" />
      <circle cx="9.2" cy="7.2" r="3.7" />
      <path d="M21.5 21v-1.8a4 4 0 0 0-2.9-3.8" />
      <path d="M16.2 3.5a3.7 3.7 0 0 1 0 7.2" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7.5 15.5v-3M12 15.5v-7M16.5 15.5v-5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 20v-6M4 10V4M12 20v-9M12 7V4M20 20v-4M20 12V4" />
      <path d="M1.5 14h5M9.5 7h5M17.5 16h5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M2.8 12h18.4" />
      <path d="M12 2.8a14 14 0 0 1 0 18.4 14 14 0 0 1 0-18.4Z" />
    </>
  ),

  // --- actions ------------------------------------------------------------
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="M20 6.5 9.5 17 4.5 12" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7.2" />
      <path d="m20.5 20.5-4.2-4.2" />
    </>
  ),
  pencil: (
    <>
      <path d="M12.5 20.5H21" />
      <path d="M16.7 3.8a2.1 2.1 0 0 1 3 3L7.6 18.9l-4.1 1.1 1.1-4.1Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 6.5h17" />
      <path d="M9 6.5V4.2h6v2.3" />
      <path d="M18.5 6.5 17.6 20a1.6 1.6 0 0 1-1.6 1.5H8a1.6 1.6 0 0 1-1.6-1.5L5.5 6.5" />
      <path d="M10.5 11v6M13.5 11v6" />
    </>
  ),
  archive: (
    <>
      <rect x="2.5" y="4" width="19" height="4.6" rx="1.4" />
      <path d="M4.5 8.6V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8.6" />
      <path d="M10 13h4" />
    </>
  ),
  restore: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3.5V9h-5.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11.5" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 20.5h15" />
    </>
  ),
  upload: (
    <>
      <path d="M12 20.5V9" />
      <path d="m7.5 13.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 3.5h15" />
    </>
  ),
  file: (
    <>
      <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z" />
      <path d="M13.8 2.5V8h5.6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.2 12S6 5.5 12 5.5 21.8 12 21.8 12 18 18.5 12 18.5 2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="3.1" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M10.6 5.7A8.9 8.9 0 0 1 12 5.5c6 0 9.8 6.5 9.8 6.5a17 17 0 0 1-2.8 3.6" />
      <path d="M6.4 7.5A17 17 0 0 0 2.2 12S6 18.5 12 18.5c1.5 0 2.9-.4 4.1-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3.5 3.5 17 17" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12.5" height="12.5" rx="2" />
      <path d="M5.5 15h-.5a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2H13a2 2 0 0 1 2 2V5" />
    </>
  ),
  logout: (
    <>
      <path d="M15.5 3.5H19a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-3.5" />
      <path d="m10 16.5 4.5-4.5L10 7.5" />
      <path d="M14.5 12H3" />
    </>
  ),
  external: (
    <>
      <path d="M14.5 3.5H20.5v6" />
      <path d="M10 14 20.5 3.5" />
      <path d="M20.5 14.5V19a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2H10" />
    </>
  ),
  menu: <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />,
  filter: <path d="M21.5 3.5h-19l7.6 9v6.4l3.8 1.8V12.5Z" />,

  // --- directional --------------------------------------------------------
  'chevron-down': <path d="m6 9.5 6 6 6-6" />,
  'chevron-up': <path d="m18 14.5-6-6-6 6" />,
  'chevron-left': <path d="m14.5 18-6-6 6-6" />,
  'chevron-right': <path d="m9.5 6 6 6-6 6" />,
  'arrow-left': (
    <>
      <path d="M19.5 12H4.5" />
      <path d="m11 19-7-7 7-7" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M4.5 12h15" />
      <path d="m13 5 7 7-7 7" />
    </>
  ),
  'arrow-up-right': (
    <>
      <path d="M7 17 17 7" />
      <path d="M8.5 7H17v8.5" />
    </>
  ),

  // --- status -------------------------------------------------------------
  'check-circle': (
    <>
      <path d="M21.5 11.1V12a9.5 9.5 0 1 1-5.6-8.7" />
      <path d="m8.8 11.5 3 3 8-8" />
    </>
  ),
  'x-circle': (
    <>
      <circle cx="12" cy="12" r="9.2" />
      <path d="m14.8 9.2-5.6 5.6M9.2 9.2l5.6 5.6" />
    </>
  ),
  'alert-triangle': (
    <>
      <path d="M10.3 4.1 2.5 17.9A1.9 1.9 0 0 0 4.2 20.8h15.6a1.9 1.9 0 0 0 1.7-2.9L13.7 4.1a1.9 1.9 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 16.5v-5M12 8h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 7v5.3l3.4 2" />
    </>
  ),
  bell: (
    <>
      <path d="M6.4 9a5.6 5.6 0 0 1 11.2 0c0 5.6 2.4 7 2.4 7H4s2.4-1.4 2.4-7Z" />
      <path d="M10.2 19.5a2 2 0 0 0 3.6 0" />
    </>
  ),
  shield: (
    <>
      <path d="M12 21.5s7.8-3.6 7.8-9.5V5.2L12 2.4 4.2 5.2v6.8c0 5.9 7.8 9.5 7.8 9.5Z" />
      <path d="m9.2 11.8 2 2 3.6-3.6" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
      <path d="M18.5 15.5v3.5M16.75 17.25h3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="4.8" width="17" height="16.2" rx="2" />
      <path d="M16 3v3.6M8 3v3.6M3.5 10.4h17" />
    </>
  ),
  'map-pin': (
    <>
      <path d="M19.5 10.3c0 5.7-7.5 11.2-7.5 11.2S4.5 16 4.5 10.3a7.5 7.5 0 0 1 15 0Z" />
      <circle cx="12" cy="10.1" r="2.8" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h3" />
    </>
  ),
  star: <path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9Z" />,
  phone: (
    <path d="M4.5 3.5h3.4l1.5 4.2-2 1.7a12.3 12.3 0 0 0 5.7 5.7l1.7-2 4.2 1.5v3.4a1.7 1.7 0 0 1-1.9 1.7A16.7 16.7 0 0 1 3 5.4a1.7 1.7 0 0 1 1.5-1.9Z" />
  ),
};

function Icon({ name, size = 18, strokeWidth = 1.75, className = '', title, ...rest }) {
  const glyph = PATHS[name];
  if (!glyph) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      className={className}
      // Icons must never shrink inside a flex row next to a long label.
      style={{ flexShrink: 0 }}
      {...rest}
    >
      {title && <title>{title}</title>}
      {glyph}
    </svg>
  );
}

export default Icon;
export { PATHS as ICON_NAMES };
