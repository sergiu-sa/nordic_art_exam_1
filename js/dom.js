// Shared DOM builders reused across the page modules.

import { secureImageUrl, artworkAlt, resolveCardRatio } from "./artworks.js";
import { formatYear } from "./format.js";
import { guardImage } from "./ui.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// A Heroicons <symbol>/<use> reference; decorative, so aria-hidden.
export function icon(id) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "i");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${id}`);
  svg.appendChild(use);
  return svg;
}

// The chaos-grid card shared by the feed and collection grids (identical markup).
// The box takes the work's own measured ratio so the image shows uncropped;
// resolveCardRatio clamps the extremes and falls back to the slot ratio when the probe couldn't measure.
// The ratio is set before paint, so no layout shift. loading is set before src so the browser honours it. href is page-relative, so the caller supplies it.
export function renderCard(work, slot, measuredRatio, href) {
  const figure = el("figure", "card r");
  figure.style.gridColumn = `${slot.col} / span ${slot.span}`;
  figure.style.marginTop = `${slot.mt}px`;
  figure.style.setProperty("--card-ratio", String(resolveCardRatio(measuredRatio, slot.ratio)));

  const link = el("a", "cardlink");
  link.href = href;

  const wrap = el("div", "imgwrap");
  const img = new Image();
  img.loading = "lazy";
  img.src = secureImageUrl(work.image.url);
  img.alt = artworkAlt(work);
  guardImage(img, { title: work.title });
  wrap.appendChild(img);

  const caption = el("figcaption");
  const year = formatYear(work.year);
  caption.append(year ? `${work.title}, ${year}` : work.title, el("br"));
  const byline = el("span", "a");
  byline.textContent = [work.artist, work.medium]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  caption.append(byline, el("br"));
  const view = el("span", "view");
  view.setAttribute("aria-hidden", "true");
  view.append("view artwork ", icon("i-arrow-right"));
  caption.append(view);

  // the link wraps only the image; the figcaption stays a direct child of the figure
  link.appendChild(wrap);
  figure.append(link, caption);
  return figure;
}
