// Simple i18n implementation for Vanilla JS
class I18n {
  constructor() {
    this.locale = 'ja'; // default
    this.translations = {};
  }

  async loadLocale(lang) {
    try {
      const response = await fetch(`./locales/${lang}.json`);
      this.translations[lang] = await response.json();
      this.locale = lang;
    } catch (e) {
      console.warn(`Failed to load locale '${lang}'. Falling back to 'ja'.`);
      if (lang !== 'ja') await this.loadLocale('ja');
    }
  }

  t(key) {
    if (this.translations[this.locale] && this.translations[this.locale][key]) {
      return this.translations[this.locale][key];
    }
    return key; // Fallback to key itself if not found
  }

  // Update all DOM elements with data-i18n attribute
  updateDOM() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (el.tagName === 'INPUT' && el.type === 'button') {
        el.value = this.t(key);
      } else {
        el.textContent = this.t(key);
      }
    });

    // Update placeholders if needed
    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.t(key);
    });
  }
}

const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
}

// Global instance
window.i18n = new I18n();
