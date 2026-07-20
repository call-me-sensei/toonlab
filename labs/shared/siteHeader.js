import './siteHeader.css';

const NAV_ITEMS = Object.freeze([
  { id: 'labs', label: 'Labs', href: '/' },
  { id: 'gallery', label: 'Gallery', href: '/gallery/' },
  { id: 'settings', label: 'Settings', href: '/settings/' },
  { id: 'docs', label: 'Docs', href: '/docs/' },
  {
    id: 'github',
    label: 'GitHub',
    href: 'https://github.com/call-me-sensei/toonlab',
    external: true,
  },
  {
    id: 'pro',
    label: 'ToonLab Pro',
    href: 'https://toonlab.io',
    external: true,
  },
]);

function navLink(item, active) {
  const current = item.id === active ? ' aria-current="page"' : '';
  const external = item.external ? ' target="_blank" rel="noreferrer"' : '';
  return `<a href="${item.href}"${current}${external}>${item.label}</a>`;
}

/**
 * Shared site chrome for the OSS home, gallery, asset, docs, and settings
 * pages. Lab workspaces intentionally keep their purpose-built toolbars.
 */
export class SiteHeader extends HTMLElement {
  static observedAttributes = ['active'];

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  render() {
    const active = this.getAttribute('active') ?? '';
    this.innerHTML = `
      <header class="site-header">
        <a class="site-header__brand" href="/" aria-label="ToonLab labs">
          <span class="site-header__brand-mark" aria-hidden="true">ト</span>
          <span class="site-header__brand-word">TOONLAB</span>
          <span class="site-header__brand-tag">Open Source</span>
        </a>
        <nav class="site-header__nav" aria-label="Primary">
          ${NAV_ITEMS.map((item) => navLink(item, active)).join('')}
        </nav>
      </header>
    `;
  }
}

if (!customElements.get('toonlab-site-header')) {
  customElements.define('toonlab-site-header', SiteHeader);
}
