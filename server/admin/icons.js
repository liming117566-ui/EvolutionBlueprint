const paths = {
  home: 'M3 10 12 3l9 7v10H3z M9 21v-8h6v8', grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  book: 'M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3z M12 6v15',
  folder: 'M3 7V5h7l2 3h9v13H3z', globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4',
  ticket: 'M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4z M14 5v3 M14 11v2 M14 16v3',
  audit: 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5', settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  menu: 'M4 6h16 M4 12h16 M4 18h16', help: 'M12 17h.01 M9 9a3 3 0 1 1 4 3v2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  plus: 'M12 5v14 M5 12h14', upload: 'M12 16V3 M7 8l5-5 5 5 M4 16v5h16v-5', arrow: 'M5 12h14 M13 6l6 6-6 6',
  sort: 'M8 3v18 M4 7l4-4 4 4 M16 21V3 M12 17l4 4 4-4', video: 'M3 5h13v14H3z M16 9l5-3v12l-5-3', text: 'M4 4h16 M12 4v16 M8 20h8', file: 'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h6'
};
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'od-icon' })) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name] || paths.book); svg.append(path); return svg;
}
