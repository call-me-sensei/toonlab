// Labs home page: renders the card grids from labsShowcase.js and runs the
// scroll-reveal. The legacy-URL redirect runs inline in index.html <head>
// (before paint) so this module only ever executes for real home visits.

import '../shared/siteHeader.js';
import {
  ASSET_LABS_SHOWCASE,
  DEMOS_SHOWCASE,
  SHADER_LABS_SHOWCASE,
  WORLD_SYSTEMS_SHOWCASE,
} from './labsShowcase.js';

const SHOTS_BASE = '/home/shots/';

function renderCard(lab) {
  const card = document.createElement('a');
  card.className = 'lab-card';
  card.href = lab.href;

  const media = document.createElement('div');
  media.className = 'lab-card-media';

  const index = document.createElement('span');
  index.className = 'lab-card-index';
  index.textContent = lab.i;

  const jp = document.createElement('span');
  jp.className = 'lab-card-jp';
  jp.textContent = lab.jp;

  const glyph = document.createElement('span');
  glyph.className = 'lab-card-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = lab.jp.slice(0, 1);

  const img = document.createElement('img');
  img.src = `${SHOTS_BASE}${lab.id}.png`;
  img.alt = `${lab.title} — live screenshot`;
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    media.classList.add('lab-card-media--flat');
  });

  media.append(index, jp, glyph, img);

  const body = document.createElement('div');
  body.className = 'lab-card-body';

  const text = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = lab.title;
  const desc = document.createElement('p');
  desc.textContent = lab.desc;
  text.append(title, desc);

  const arrow = document.createElement('span');
  arrow.className = 'lab-card-arrow';
  arrow.textContent = '→';

  body.append(text, arrow);
  card.append(media, body);
  return card;
}

function renderGrid(gridId, entries) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  for (const entry of entries) grid.appendChild(renderCard(entry));
}

renderGrid('shaderLabGrid', SHADER_LABS_SHOWCASE);
renderGrid('assetLabGrid', ASSET_LABS_SHOWCASE);
renderGrid('worldSystemGrid', WORLD_SYSTEMS_SHOWCASE);
renderGrid('demoGrid', DEMOS_SHOWCASE);

// Scroll reveal: single elements carry data-reveal; grids carry
// data-reveal-stagger and stamp --reveal-i per child for the cascade.
function initReveal() {
  const singles = [...document.querySelectorAll('[data-reveal]')];
  const staggerChildren = [];
  for (const group of document.querySelectorAll('[data-reveal-stagger]')) {
    [...group.children].forEach((child, i) => {
      child.style.setProperty('--reveal-i', String(i % 12));
      staggerChildren.push(child);
    });
  }
  const targets = [...singles, ...staggerChildren];

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    for (const el of targets) el.classList.add('is-revealed');
    return;
  }

  const observer = new IntersectionObserver((observed) => {
    for (const item of observed) {
      if (!item.isIntersecting) continue;
      item.target.classList.add('is-revealed');
      observer.unobserve(item.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });

  for (const el of targets) observer.observe(el);
}

initReveal();

// Automation gate (repo convention: verify scripts wait on body.dataset).
document.body.dataset.homeReady = 'true';
