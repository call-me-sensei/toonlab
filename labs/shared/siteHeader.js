import './siteHeader.css';
import { getCopy, getLanguageFlagUrl, getLanguageOptions, getLocale, mountLanguagePicker } from '../../src/i18n/locales.js';

const NAV_ITEMS = Object.freeze([
  { id: 'labs', href: '/' },
  { id: 'generate', href: '/generate/' },
  { id: 'gallery', href: '/gallery/' },
  { id: 'library', href: '/library/' },
  { id: 'styles', href: '/styles/' },
  { id: 'settings', href: '/settings/' },
  { id: 'docs', href: '/docs/' },
  {
    id: 'github',
    href: 'https://github.com/call-me-sensei/toonlab',
    external: true,
  },
  {
    id: 'pro',
    href: 'https://toonlab.io',
    external: true,
  },
]);

function navLink(item, active, copy) {
  const current = item.id === active ? ' aria-current="page"' : '';
  const external = item.external ? ' target="_blank" rel="noreferrer"' : '';
  return `<a href="${item.href}"${current}${external}>${copy[item.id]}</a>`;
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
    const locale = getLocale();
    const copy = getCopy(locale);
    this.querySelectorAll('[data-language-menu]').forEach((menu) => {
      menu.__languageMenuCleanup?.();
    });
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    this.innerHTML = `
      <header class="site-header">
        <a class="site-header__brand" href="/" aria-label="${copy.allLabs}">
          <span class="site-header__brand-mark" aria-hidden="true">ト</span>
          <span class="site-header__brand-word">TOONLAB</span>
          <span class="site-header__brand-tag">Open Source</span>
        </a>
        <nav class="site-header__nav" aria-label="Primary">
          ${NAV_ITEMS.map((item) => navLink(item, active, copy)).join('')}
        </nav>
        <div class="site-header__language tl-language-menu" data-language-menu data-language-picker>
          <span class="sr-only">${copy.language}</span>
          <button
            class="tl-language-trigger"
            type="button"
            data-language-trigger
            aria-haspopup="listbox"
            aria-expanded="false"
            aria-label="${copy.language}"
          >
            <span class="tl-language-trigger__flag" data-language-flag aria-hidden="true"><img src="${getLanguageFlagUrl(locale)}" alt=""></span>
            <span class="tl-language-trigger__current" data-language-current>${getLanguageOptions().find(({ code }) => code === locale)?.nativeName || 'English'}</span>
            <span class="tl-language-trigger__chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="tl-language-list" data-language-options role="listbox" hidden></div>
        </div>
      </header>
    `;
    mountLanguagePicker(this);
  }
}

if (!customElements.get('toonlab-site-header')) {
  customElements.define('toonlab-site-header', SiteHeader);
}
