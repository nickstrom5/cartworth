// Minimal inline SVG icon set (stroke icons, 24px grid).
import { h } from '/vendor/preact.mjs';

const P = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2',
  refresh: 'M20 11a8 8 0 0 0-14.8-4M4 5v4h4M4 13a8 8 0 0 0 14.8 4M20 19v-4h-4',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  chart: 'M4 19h16M6 15l4-5 3 3 5-7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2 1.2l-.3 2h-4l-.3-2a7 7 0 0 1-2-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L2.6 9.3l2-3.4 1.9.7a7 7 0 0 1 2-1.2l.3-2h4l.3 2a7 7 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3z',
  tag: 'M3 12V4h8l9 9-8 8zM7.5 7.5h.01',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  basket: 'M4 10h16l-1.6 9a2 2 0 0 1-2 1.6H7.6a2 2 0 0 1-2-1.6zM8 10l3-6M16 10l-3-6M9 14v3M15 14v3M12 14v3',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  right: 'M9 6l6 6-6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  printer: 'M7 9V4h10v5M7 18H5a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  cart: 'M3 4h2l2.4 11h10.2L20 7H6.2M9 20h.01M17 20h.01',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  store: 'M4 9l1.5-5h13L20 9M4 9h16M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5 11v9h14v-9M10 20v-5h4v5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
};

export function Icon({ name, size = 16, stroke = 2, fill = 'none', class: cls = '', title }) {
  const d = P[name];
  if (!d) return null;
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: fill === 'current' ? 'currentColor' : fill,
      stroke: 'currentColor',
      'stroke-width': stroke,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: cls,
      'aria-hidden': title ? undefined : 'true',
      role: title ? 'img' : undefined,
    },
    title ? h('title', null, title) : null,
    h('path', { d }),
  );
}
