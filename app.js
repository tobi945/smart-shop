'use strict';

/* ================================================================
   Smart Shop v2 — Chapter 2: Shopping Engine
   Classes: Product · AppManager
   Features: מחיר · עדיפות ⭐ · יחידות · תקציב · היסטוריה · מצב סופר
   ================================================================ */

// ── קטגוריות ──────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'fruits_vegetables', name: 'פירות וירקות',     icon: '🥦' },
  { id: 'dairy_eggs',        name: 'חלב וביצים',       icon: '🥛' },
  { id: 'bakery',            name: 'לחם ומאפים',       icon: '🍞' },
  { id: 'meat_fish',         name: 'בשר ודגים',        icon: '🥩' },
  { id: 'pantry',            name: 'מזווה ושימורים',   icon: '🥫' },
  { id: 'cleaning',          name: 'ניקיון וטואלטיקה', icon: '🧴' },
  { id: 'other',             name: 'שונות',             icon: '📦' },
];

// ── מחלקת מוצר ────────────────────────────────────────────────────

class Product {
  /**
   * @param {string} id
   * @param {string} name       - שם המוצר
   * @param {string} category   - מזהה קטגוריה
   * @param {number} quantity   - כמות (ברירת מחדל: 1)
   * @param {boolean} isBought  - האם נרכש
   * @param {number}  price     - מחיר משוער ב-₪ (0 = לא הוזן)
   * @param {number}  priority  - 0=רגיל, 1=חשוב ⭐
   * @param {string}  unit      - יחידת מידה (ק"ג, ליטר וכו')
   */
  constructor(id, name, category, quantity = 1, isBought = false,
              price = 0, priority = 0, unit = '') {
    this.id       = id;
    this.name     = name;
    this.category = category;
    this.quantity = Number.isFinite(Number(quantity)) ? Math.max(1, Number(quantity)) : 1;
    this.isBought = Boolean(isBought);
    this.price    = Number.isFinite(Number(price))    ? Math.max(0, Number(price))    : 0;
    this.priority = Number(priority) === 1 ? 1 : 0;
    this.unit     = String(unit || '').slice(0, 10);
  }

  toggleStatus() { this.isBought = !this.isBought; }
}

// ── מחלקת מנהל האפליקציה ──────────────────────────────────────────

class AppManager {
  constructor() {
    this.storageKey  = 'smart_shop_products_v1';
    this.historyKey  = 'smart_shop_history_v1';
    this.products    = [];
    this.history     = [];      // שמות שהוקלדו בעבר להשלמה אוטומטית
    this.focusMode   = false;
    this._priority   = 0;       // ערך זמני לבורר עדיפות במודאל

    this.cacheDom();
    this.loadData();
    this.loadHistory();
    this.populateCategories();
    this.bindEvents();
    this.render();
    this.registerServiceWorker();
  }

  // ── DOM ──────────────────────────────────────────────────────────

  cacheDom() {
    this.elements = {
      // כותרת
      focusModeBtn:   document.getElementById('focusModeBtn'),

      // סיכום
      summaryStrip:   document.getElementById('summaryStrip'),
      summaryTotal:   document.getElementById('summaryTotal'),
      summaryBought:  document.getElementById('summaryBought'),
      summaryLeft:    document.getElementById('summaryLeft'),
      summaryBudget:  document.getElementById('summaryBudget'),

      // תוכן ראשי
      emptyState:     document.getElementById('emptyState'),
      categoriesEl:   document.getElementById('categoriesContainer'),
      shareButton:    document.getElementById('shareWhatsAppButton'),

      // מודאל
      modal:          document.getElementById('productModal'),
      form:           document.getElementById('productForm'),
      nameInput:      document.getElementById('productName'),
      nameHistory:    document.getElementById('nameHistory'),
      categorySelect: document.getElementById('productCategory'),
      quantityInput:  document.getElementById('productQuantity'),
      unitSelect:     document.getElementById('productUnit'),
      priceInput:     document.getElementById('productPrice'),
      priorityToggle: document.getElementById('priorityToggle'),
    };
  }

  // ── שמירה וטעינה ─────────────────────────────────────────────────

  saveData() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.products));
  }

  loadData() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      const parsed = saved ? JSON.parse(saved) : [];
      this.products = parsed.map(item => new Product(
        item.id, item.name, item.category,
        item.quantity, item.isBought,
        item.price, item.priority, item.unit
      ));
    } catch {
      this.products = [];
    }
  }

  // ── היסטוריית שמות (השלמה אוטומטית) ─────────────────────────────

  loadHistory() {
    try {
      const saved = localStorage.getItem(this.historyKey);
      this.history = saved ? JSON.parse(saved) : [];
    } catch {
      this.history = [];
    }
    this.updateSuggestions();
  }

  saveHistory() {
    localStorage.setItem(this.historyKey, JSON.stringify(this.history));
  }

  addToHistory(name) {
    const clean = name.trim();
    if (!clean) return;
    // הוסף בתחילה, הסר כפילויות, שמור עד 60 רשומות
    this.history = [clean, ...this.history.filter(h => h !== clean)].slice(0, 60);
    this.saveHistory();
    this.updateSuggestions();
  }

  updateSuggestions() {
    if (!this.elements.nameHistory) return;
    this.elements.nameHistory.innerHTML = this.history
      .map(name => `<option value="${this.escapeHtml(name)}">`)
      .join('');
  }

  // ── ניהול מוצרים ─────────────────────────────────────────────────

  addProduct(name, category, quantity, price = 0, priority = 0, unit = '') {
    const product = new Product(
      this.createId(),
      name.trim(),
      category,
      quantity,
      false,
      price,
      priority,
      unit
    );
    this.products.unshift(product);
    this.addToHistory(name);
    this.saveData();
    this.render();
  }

  deleteProduct(id) {
    this.products = this.products.filter(p => p.id !== id);
    this.saveData();
    this.render();
  }

  toggleProduct(id) {
    const product = this.products.find(p => p.id === id);
    if (!product) return;
    product.toggleStatus();
    this.saveData();
    this.render();
  }

  handleProductSubmit() {
    const name     = this.elements.nameInput.value.trim();
    const category = this.elements.categorySelect.value;
    const quantity = Number(this.elements.quantityInput.value);
    const price    = Number(this.elements.priceInput.value) || 0;
    const unit     = this.elements.unitSelect.value;
    const priority = this._priority;

    if (!name)                                       { this.markInvalid(this.elements.nameInput);     return; }
    if (!category)                                   { this.markInvalid(this.elements.categorySelect); return; }
    if (!Number.isFinite(quantity) || quantity < 1)  { this.markInvalid(this.elements.quantityInput);  return; }

    this.addProduct(name, category, quantity, price, priority, unit);
    this.closeModal();
  }

  // ── רינדור ───────────────────────────────────────────────────────

  render() {
    const total  = this.products.length;
    const bought = this.products.filter(p => p.isBought).length;
    const left   = total - bought;

    // חישוב תקציב (רק מוצרים עם מחיר שעדיין לא נקנו)
    const pendingWithPrice = this.products.filter(p => !p.isBought && p.price > 0);
    const budget = pendingWithPrice.reduce((sum, p) => sum + (p.price * p.quantity), 0);

    // עדכון הסיכום
    this.elements.emptyState.hidden   = total > 0;
    this.elements.summaryStrip.hidden = total === 0;
    this.elements.shareButton.hidden  = total === 0;

    this.elements.summaryTotal.textContent  = `${total} ${total === 1 ? 'מוצר' : 'מוצרים'}`;
    this.elements.summaryBought.textContent = `${bought} נקנו`;
    this.elements.summaryLeft.textContent   = `${left} חסרים`;

    if (budget > 0) {
      this.elements.summaryBudget.textContent = `₪${budget.toFixed(0)} משוער`;
      this.elements.summaryBudget.hidden = false;
    } else {
      this.elements.summaryBudget.textContent = '';
    }

    // רינדור קטגוריות
    this.elements.categoriesEl.innerHTML = CATEGORIES
      .map(cat => this.renderCategory(cat))
      .filter(Boolean)
      .join('');
  }

  renderCategory(category) {
    let products = this.products.filter(p => p.category === category.id);
    if (products.length === 0) return '';

    // מיון: פריטים בעדיפות גבוהה (⭐) קודמים, בתוך כל קבוצה — שלא נקנו לפני שנקנו
    products = [
      ...products.filter(p => p.priority === 1 && !p.isBought),
      ...products.filter(p => p.priority === 0 && !p.isBought),
      ...products.filter(p => p.priority === 1 &&  p.isBought),
      ...products.filter(p => p.priority === 0 &&  p.isBought),
    ];

    const boughtCount = products.filter(p => p.isBought).length;
    const itemsHtml   = products.map(p => this.renderProduct(p)).join('');

    return `
<article class="category-section">
  <header class="category-header">
    <div class="category-title">
      <span class="category-icon" aria-hidden="true">${category.icon}</span>
      <span>${this.escapeHtml(category.name)}</span>
    </div>
    <span class="category-count">${boughtCount}/${products.length}</span>
  </header>
  <ul class="product-list">${itemsHtml}</ul>
</article>`;
  }

  renderProduct(product) {
    const checked     = product.isBought ? 'checked' : '';
    const boughtClass = product.isBought ? ' is-bought' : '';
    const starHtml    = product.priority === 1
      ? '<span class="priority-star" aria-label="עדיפות גבוהה">⭐</span>' : '';

    // יחידה ומחיר
    const quantityText = product.unit
      ? `${product.quantity} ${this.escapeHtml(product.unit)}`
      : `כמות: ${product.quantity}`;
    const priceText = product.price > 0
      ? `<span class="price-tag">₪${(product.price * product.quantity).toFixed(0)}</span>` : '';

    return `
<li class="product-item${boughtClass}${product.priority === 1 ? ' is-priority' : ''}">
  <label class="product-label">
    <input class="product-checkbox" type="checkbox"
           data-action="toggle-product" data-id="${this.escapeHtml(product.id)}" ${checked}>
    <span class="product-text">
      <span class="product-name">${starHtml}${this.escapeHtml(product.name)}</span>
      <span class="product-quantity">${quantityText}${priceText}</span>
    </span>
  </label>
  <button class="delete-button" type="button"
          data-action="delete-product" data-id="${this.escapeHtml(product.id)}"
          aria-label="מחק מוצר">×</button>
</li>`;
  }

  // ── WhatsApp ──────────────────────────────────────────────────────

  generateWhatsAppText() {
    const missing = this.products.filter(p => !p.isBought);
    const bought  = this.products.filter(p => p.isBought);

    // חישוב תקציב לסיכום
    const budget = missing
      .filter(p => p.price > 0)
      .reduce((sum, p) => sum + p.price * p.quantity, 0);

    const lines = ['🛒 *רשימת הקניות שלי*'];

    lines.push('', '*חסר לי:*');
    if (missing.length === 0) {
      lines.push('הכל נקנה! 🎉');
    } else {
      // עדיפות גבוהה תחילה
      const priority = missing.filter(p => p.priority === 1);
      const normal   = missing.filter(p => p.priority === 0);

      if (priority.length > 0) {
        lines.push('⭐ _דחוף:_');
        priority.forEach(p => {
          const unit = p.unit ? ` ${p.unit}` : '';
          lines.push(`- ${p.name} (${p.quantity}${unit})`);
        });
      }
      if (normal.length > 0) {
        if (priority.length > 0) lines.push('');
        normal.forEach(p => {
          const unit = p.unit ? ` ${p.unit}` : '';
          lines.push(`- ${p.name} (${p.quantity}${unit})`);
        });
      }
    }

    if (budget > 0) {
      lines.push('', `💰 *סה"כ משוער: ₪${budget.toFixed(0)}*`);
    }

    lines.push('', '*כבר קניתי:*');
    if (bought.length === 0) {
      lines.push('עדיין לא סומן שום מוצר.');
    } else {
      bought.forEach(p => { lines.push(`- ~${p.name} (${p.quantity})~`); });
    }

    return lines.join('\n');
  }

  openWhatsAppShare() {
    const text = this.generateWhatsAppText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  // ── מצב סופר (Focus Mode) ─────────────────────────────────────────

  toggleFocusMode() {
    this.focusMode = !this.focusMode;
    document.body.classList.toggle('focus-mode', this.focusMode);
    this.elements.focusModeBtn.classList.toggle('focus-active', this.focusMode);
    this.elements.focusModeBtn.title = this.focusMode ? 'יציאה ממצב סופר' : 'מצב סופר';
    this.elements.focusModeBtn.setAttribute('aria-pressed', String(this.focusMode));
  }

  // ── אירועים ──────────────────────────────────────────────────────

  bindEvents() {
    // כפתור מצב סופר
    this.elements.focusModeBtn.addEventListener('click', () => this.toggleFocusMode());

    // פתיחת מודאל
    document.getElementById('openProductModal').addEventListener('click', () => this.openModal());
    document.getElementById('emptyAddButton').addEventListener('click', () => this.openModal());

    // סגירת מודאל
    document.getElementById('closeProductModal').addEventListener('click',  () => this.closeModal());
    document.getElementById('cancelProductButton').addEventListener('click', () => this.closeModal());
    this.elements.modal.addEventListener('click', e => {
      if (e.target === this.elements.modal) this.closeModal();
    });

    // שליחת טופס
    this.elements.form.addEventListener('submit', e => {
      e.preventDefault();
      this.handleProductSubmit();
    });

    // כפתור עדיפות בטופס
    this.elements.priorityToggle.addEventListener('click', () => {
      this._priority = this._priority === 0 ? 1 : 0;
      this.elements.priorityToggle.dataset.priority = String(this._priority);
      this.elements.priorityToggle.textContent = this._priority === 1 ? '⭐ חשוב' : '☆ רגיל';
    });

    // פעולות על מוצרים (Event delegation)
    this.elements.categoriesEl.addEventListener('change', e => {
      const cb = e.target.closest('[data-action="toggle-product"]');
      if (cb) this.toggleProduct(cb.dataset.id);
    });
    this.elements.categoriesEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="delete-product"]');
      if (btn) this.deleteProduct(btn.dataset.id);
    });

    // WhatsApp
    this.elements.shareButton.addEventListener('click', () => this.openWhatsAppShare());

    // Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.elements.modal.hidden) this.closeModal();
    });
  }

  // ── מודאל ────────────────────────────────────────────────────────

  populateCategories() {
    this.elements.categorySelect.innerHTML = CATEGORIES
      .map(c => `<option value="${this.escapeHtml(c.id)}">${this.escapeHtml(c.name)}</option>`)
      .join('');
  }

  openModal() {
    this._priority = 0;
    this.elements.form.reset();
    this.elements.quantityInput.value      = '1';
    this.elements.priorityToggle.textContent      = '☆ רגיל';
    this.elements.priorityToggle.dataset.priority = '0';
    this.elements.modal.hidden       = false;
    document.body.style.overflow     = 'hidden';
    window.setTimeout(() => this.elements.nameInput.focus(), 50);
  }

  closeModal() {
    this.elements.modal.hidden   = true;
    document.body.style.overflow = '';
  }

  // ── עזרים ────────────────────────────────────────────────────────

  markInvalid(element) {
    element.classList.remove('shake');
    void element.offsetWidth;
    element.classList.add('shake');
    element.focus();
  }

  createId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('service-worker.js')
      .catch(err => console.warn('Service Worker registration failed.', err));
  }
}

// ── אתחול ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.smartShop = new AppManager();
});
