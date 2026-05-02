'use strict';

/* ================================================================
   Smart Shop v3 — Chapter 3: Premium UX
   Features added: Swipe gestures · Undo toast · Vibration API
                   Wake Lock · Confetti · Web Audio · Dark Mode
   ================================================================ */

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

// ── AppManager ────────────────────────────────────────────────────

class AppManager {
  constructor() {
    this.storageKey          = 'smart_shop_products_v1';
    this.historyKey          = 'smart_shop_history_v1';
    this.products            = [];
    this.history             = [];
    this.focusMode           = false;
    this._priority           = 0;
    this._undoTimer          = null;
    this._lastAllBought      = false;
    this.wakeLock            = null;
    this._swipeTouch         = null;   // { item, inner, startX, startY, lastX, tracking }

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
    this.els = {
      focusModeBtn:   document.getElementById('focusModeBtn'),
      summaryStrip:   document.getElementById('summaryStrip'),
      summaryTotal:   document.getElementById('summaryTotal'),
      summaryBought:  document.getElementById('summaryBought'),
      summaryLeft:    document.getElementById('summaryLeft'),
      summaryBudget:  document.getElementById('summaryBudget'),
      emptyState:     document.getElementById('emptyState'),
      categoriesEl:   document.getElementById('categoriesContainer'),
      shareButton:    document.getElementById('shareWhatsAppButton'),
      modal:          document.getElementById('productModal'),
      form:           document.getElementById('productForm'),
      nameInput:      document.getElementById('productName'),
      nameHistory:    document.getElementById('nameHistory'),
      categorySelect: document.getElementById('productCategory'),
      quantityInput:  document.getElementById('productQuantity'),
      unitSelect:     document.getElementById('productUnit'),
      priceInput:     document.getElementById('productPrice'),
      priorityToggle: document.getElementById('priorityToggle'),
      undoToast:      document.getElementById('undoToast'),
      undoMessage:    document.getElementById('undoMessage'),
      undoBtn:        document.getElementById('undoBtn'),
    };
  }

  // ── שמירה / טעינה ─────────────────────────────────────────────────

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
    } catch { this.products = []; }
  }

  // ── היסטוריית השלמה ───────────────────────────────────────────────

  loadHistory() {
    try {
      const saved = localStorage.getItem(this.historyKey);
      this.history = saved ? JSON.parse(saved) : [];
    } catch { this.history = []; }
    this.updateSuggestions();
  }

  saveHistory() {
    localStorage.setItem(this.historyKey, JSON.stringify(this.history));
  }

  addToHistory(name) {
    const clean = name.trim();
    if (!clean) return;
    this.history = [clean, ...this.history.filter(h => h !== clean)].slice(0, 60);
    this.saveHistory();
    this.updateSuggestions();
  }

  updateSuggestions() {
    if (!this.els.nameHistory) return;
    this.els.nameHistory.innerHTML = this.history
      .map(n => `<option value="${this.escapeHtml(n)}">`)
      .join('');
  }

  // ── מוצרים ───────────────────────────────────────────────────────

  addProduct(name, category, quantity, price = 0, priority = 0, unit = '') {
    this.products.unshift(new Product(
      this.createId(), name.trim(), category,
      quantity, false, price, priority, unit
    ));
    this.addToHistory(name);
    this.saveData();
    this.render();
    this.playClick();
  }

  toggleProduct(id) {
    const product = this.products.find(p => p.id === id);
    if (!product) return;
    product.toggleStatus();
    this.saveData();
    this.render();
    this.vibrate(product.isBought ? [60, 30, 60] : [30]);
    this.checkCompletion();
  }

  deleteProduct(id) {
    this.products = this.products.filter(p => p.id !== id);
    this.saveData();
    this.render();
  }

  /** מחיקה עם אפשרות ביטול (3 שניות) */
  deleteProductWithUndo(id) {
    const product = this.products.find(p => p.id === id);
    if (!product) return;

    const snapshot  = { ...product };
    const origIndex = this.products.indexOf(product);

    this.products = this.products.filter(p => p.id !== id);
    this.saveData();
    this.render();
    this.vibrate([50, 50, 80]);

    this.showUndoToast(`נמחק: ${product.name}`, () => {
      // שחזור במיקום המקורי
      const restored = new Product(
        snapshot.id, snapshot.name, snapshot.category,
        snapshot.quantity, snapshot.isBought,
        snapshot.price, snapshot.priority, snapshot.unit
      );
      this.products.splice(Math.min(origIndex, this.products.length), 0, restored);
      this.saveData();
      this.render();
      this.vibrate([80]);
    });
  }

  handleProductSubmit() {
    const name     = this.els.nameInput.value.trim();
    const category = this.els.categorySelect.value;
    const quantity = Number(this.els.quantityInput.value);
    const price    = Number(this.els.priceInput.value) || 0;
    const unit     = this.els.unitSelect.value;
    const priority = this._priority;

    if (!name)                                       { this.markInvalid(this.els.nameInput);     return; }
    if (!category)                                   { this.markInvalid(this.els.categorySelect); return; }
    if (!Number.isFinite(quantity) || quantity < 1)  { this.markInvalid(this.els.quantityInput);  return; }

    this.addProduct(name, category, quantity, price, priority, unit);
    this.closeModal();
  }

  // ── רינדור ───────────────────────────────────────────────────────

  render() {
    const total  = this.products.length;
    const bought = this.products.filter(p => p.isBought).length;
    const left   = total - bought;
    const budget = this.products
      .filter(p => !p.isBought && p.price > 0)
      .reduce((s, p) => s + p.price * p.quantity, 0);

    this.els.emptyState.hidden   = total > 0;
    this.els.summaryStrip.hidden = total === 0;
    this.els.shareButton.hidden  = total === 0;

    this.els.summaryTotal.textContent  = `${total} ${total === 1 ? 'מוצר' : 'מוצרים'}`;
    this.els.summaryBought.textContent = `${bought} נקנו`;
    this.els.summaryLeft.textContent   = `${left} חסרים`;
    this.els.summaryBudget.textContent = budget > 0 ? `₪${budget.toFixed(0)} משוער` : '';

    this.els.categoriesEl.innerHTML = CATEGORIES
      .map(cat => this.renderCategory(cat))
      .filter(Boolean)
      .join('');

    this.setupSwipes();
  }

  renderCategory(category) {
    let products = this.products.filter(p => p.category === category.id);
    if (products.length === 0) return '';

    // מיון: ⭐ + לא-נקנה → רגיל + לא-נקנה → ⭐ + נקנה → רגיל + נקנה
    products = [
      ...products.filter(p => p.priority === 1 && !p.isBought),
      ...products.filter(p => p.priority === 0 && !p.isBought),
      ...products.filter(p => p.priority === 1 &&  p.isBought),
      ...products.filter(p => p.priority === 0 &&  p.isBought),
    ];

    const boughtCount = products.filter(p => p.isBought).length;
    return `
<article class="category-section">
  <header class="category-header">
    <div class="category-title">
      <span class="category-icon" aria-hidden="true">${category.icon}</span>
      <span>${this.escapeHtml(category.name)}</span>
    </div>
    <span class="category-count">${boughtCount}/${products.length}</span>
  </header>
  <ul class="product-list">${products.map(p => this.renderProduct(p)).join('')}</ul>
</article>`;
  }

  renderProduct(product) {
    const boughtClass    = product.isBought ? ' is-bought' : '';
    const priorityClass  = product.priority === 1 ? ' is-priority' : '';
    const checked        = product.isBought ? 'checked' : '';
    const starHtml       = product.priority === 1
      ? '<span class="priority-star" aria-hidden="true">⭐</span>' : '';
    const quantityText   = product.unit
      ? `${product.quantity} ${this.escapeHtml(product.unit)}`
      : `כמות: ${product.quantity}`;
    const priceHtml      = product.price > 0
      ? `<span class="price-tag">₪${(product.price * product.quantity).toFixed(0)}</span>` : '';
    const id = this.escapeHtml(product.id);

    return `
<li class="product-item${boughtClass}${priorityClass}" data-id="${id}">
  <div class="product-inner">
    <label class="product-label">
      <input class="product-checkbox" type="checkbox"
             data-action="toggle-product" data-id="${id}" ${checked}>
      <span class="product-text">
        <span class="product-name">${starHtml}${this.escapeHtml(product.name)}</span>
        <span class="product-quantity">${quantityText}${priceHtml}</span>
      </span>
    </label>
    <button class="delete-button" type="button"
            data-action="delete-product" data-id="${id}"
            aria-label="מחק מוצר">×</button>
  </div>
</li>`;
  }

  // ── Swipe-to-Action ───────────────────────────────────────────────

  setupSwipes() {
    const container = this.els.categoriesEl;
    const THRESHOLD = 72;   // px to trigger action
    const MAX_SHIFT = 110;  // px cap during drag

    const reset = (touch) => {
      if (!touch) return;
      touch.inner.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)';
      touch.inner.style.transform  = '';
      touch.item.classList.remove('swipe-right-active', 'swipe-left-active');
    };

    container.addEventListener('touchstart', e => {
      const item = e.target.closest('.product-item');
      if (!item) return;
      const inner = item.querySelector('.product-inner');
      const t = e.touches[0];
      this._swipeTouch = {
        item, inner,
        startX: t.clientX, startY: t.clientY,
        lastX:  t.clientX,
        tracking: false,
      };
      inner.style.transition = 'none';
    }, { passive: true });

    container.addEventListener('touchmove', e => {
      const touch = this._swipeTouch;
      if (!touch) return;
      const t  = e.touches[0];
      const dx = t.clientX - touch.startX;
      const dy = t.clientY - touch.startY;

      // זיהוי גלילה אנכית — לא להפריע לה
      if (!touch.tracking) {
        if (Math.abs(dy) > Math.abs(dx) + 6) { this._swipeTouch = null; return; }
        if (Math.abs(dx) > 8) touch.tracking = true;
      }
      if (!touch.tracking) return;

      e.preventDefault();
      touch.lastX = t.clientX;

      const capped = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, dx));
      touch.inner.style.transform = `translateX(${capped}px)`;
      touch.item.classList.toggle('swipe-right-active', dx >  30);
      touch.item.classList.toggle('swipe-left-active',  dx < -30);
    }, { passive: false });

    const onEnd = () => {
      const touch = this._swipeTouch;
      if (!touch) return;
      this._swipeTouch = null;

      if (!touch.tracking) { reset(touch); return; }

      const dx = touch.lastX - touch.startX;
      reset(touch);

      const id = touch.item.dataset.id;
      if      (dx >  THRESHOLD) this.toggleProduct(id);
      else if (dx < -THRESHOLD) this.deleteProductWithUndo(id);
    };

    container.addEventListener('touchend',    onEnd);
    container.addEventListener('touchcancel', () => {
      reset(this._swipeTouch);
      this._swipeTouch = null;
    });
  }

  // ── Undo Toast ────────────────────────────────────────────────────

  showUndoToast(message, undoFn) {
    clearTimeout(this._undoTimer);

    // החלפת כפתור ה"בטל" כדי להסיר listener ישן
    const oldBtn = this.els.undoBtn;
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.replaceWith(newBtn);
    this.els.undoBtn = newBtn;

    this.els.undoMessage.textContent = message;
    this.els.undoToast.hidden = false;
    requestAnimationFrame(() => this.els.undoToast.classList.add('visible'));

    newBtn.addEventListener('click', () => {
      clearTimeout(this._undoTimer);
      undoFn();
      this.hideUndoToast();
    }, { once: true });

    this._undoTimer = setTimeout(() => this.hideUndoToast(), 3500);
  }

  hideUndoToast() {
    this.els.undoToast.classList.remove('visible');
    setTimeout(() => { this.els.undoToast.hidden = true; }, 320);
  }

  // ── Vibration API ─────────────────────────────────────────────────

  vibrate(pattern) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch { /* ignore */ }
    }
  }

  // ── Wake Lock API ─────────────────────────────────────────────────

  async requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch { /* ignore — user may have denied or device doesn't support */ }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  // ── Focus Mode ────────────────────────────────────────────────────

  toggleFocusMode() {
    this.focusMode = !this.focusMode;
    document.body.classList.toggle('focus-mode', this.focusMode);
    this.els.focusModeBtn.classList.toggle('focus-active', this.focusMode);
    this.els.focusModeBtn.title = this.focusMode ? 'יציאה ממצב סופר' : 'מצב סופר';
    this.els.focusModeBtn.setAttribute('aria-pressed', String(this.focusMode));

    if (this.focusMode) {
      this.requestWakeLock();
      this.vibrate([100, 50, 100]);
    } else {
      this.releaseWakeLock();
      this.vibrate([50]);
    }
  }

  // ── Completion Check + Confetti + Sound ───────────────────────────

  checkCompletion() {
    if (this.products.length === 0) return;
    const allBought = this.products.every(p => p.isBought);
    if (allBought && !this._lastAllBought) {
      this.launchConfetti();
      this.playSuccess();
      this.vibrate([100, 50, 100, 50, 200]);
    }
    this._lastAllBought = allBought;
  }

  launchConfetti() {
    const colors = ['#f5a623', '#1f7a4d', '#25d366', '#ff6b6b', '#4ecdc4', '#a78bfa'];
    const wrap = document.createElement('div');
    wrap.className = 'confetti-container';
    document.body.appendChild(wrap);

    for (let i = 0; i < 90; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.cssText = [
        `--color:${colors[i % colors.length]}`,
        `--x:${5 + Math.random() * 90}vw`,
        `--delay:${(Math.random() * 0.5).toFixed(2)}s`,
        `--dur:${(0.8 + Math.random() * 0.8).toFixed(2)}s`,
        `--spin:${Math.floor(Math.random() * 720)}deg`,
        `--size:${6 + Math.floor(Math.random() * 8)}px`,
      ].join(';');
      wrap.appendChild(piece);
    }

    setTimeout(() => wrap.remove(), 2600);
  }

  // ── Web Audio ─────────────────────────────────────────────────────

  playSuccess() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t);
        osc.stop(t + 0.22);
      });
    } catch { /* ignore */ }
  }

  playClick() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1100;
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.055);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.055);
    } catch { /* ignore */ }
  }

  // ── WhatsApp ──────────────────────────────────────────────────────

  generateWhatsAppText() {
    const missing = this.products.filter(p => !p.isBought);
    const bought  = this.products.filter(p => p.isBought);
    const budget  = missing.filter(p => p.price > 0)
                           .reduce((s, p) => s + p.price * p.quantity, 0);

    const lines = ['🛒 *רשימת הקניות שלי*'];

    lines.push('', '*חסר לי:*');
    if (missing.length === 0) {
      lines.push('הכל נקנה! 🎉');
    } else {
      const prio   = missing.filter(p => p.priority === 1);
      const normal = missing.filter(p => p.priority === 0);
      if (prio.length)   { lines.push('⭐ _דחוף:_');  prio.forEach(p   => lines.push(`- ${p.name} (${p.quantity}${p.unit ? ' ' + p.unit : ''})`)); }
      if (normal.length) { if (prio.length) lines.push(''); normal.forEach(p => lines.push(`- ${p.name} (${p.quantity}${p.unit ? ' ' + p.unit : ''})`)); }
    }

    if (budget > 0) lines.push('', `💰 *סה"כ משוער: ₪${budget.toFixed(0)}*`);

    lines.push('', '*כבר קניתי:*');
    if (bought.length === 0) lines.push('עדיין לא סומן שום מוצר.');
    else bought.forEach(p => lines.push(`- ~${p.name} (${p.quantity})~`));

    return lines.join('\n');
  }

  openWhatsAppShare() {
    const text = this.generateWhatsAppText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  // ── Events ────────────────────────────────────────────────────────

  bindEvents() {
    this.els.focusModeBtn.addEventListener('click', () => this.toggleFocusMode());

    document.getElementById('openProductModal').addEventListener('click', () => this.openModal());
    document.getElementById('emptyAddButton').addEventListener('click',  () => this.openModal());
    document.getElementById('closeProductModal').addEventListener('click',  () => this.closeModal());
    document.getElementById('cancelProductButton').addEventListener('click', () => this.closeModal());
    this.els.modal.addEventListener('click', e => { if (e.target === this.els.modal) this.closeModal(); });
    this.els.form.addEventListener('submit', e => { e.preventDefault(); this.handleProductSubmit(); });

    this.els.priorityToggle.addEventListener('click', () => {
      this._priority = this._priority === 0 ? 1 : 0;
      this.els.priorityToggle.dataset.priority = String(this._priority);
      this.els.priorityToggle.textContent = this._priority === 1 ? '⭐ חשוב' : '☆ רגיל';
    });

    // Event delegation — checkbox & delete button
    this.els.categoriesEl.addEventListener('change', e => {
      const cb = e.target.closest('[data-action="toggle-product"]');
      if (cb) this.toggleProduct(cb.dataset.id);
    });
    this.els.categoriesEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="delete-product"]');
      if (btn) this.deleteProductWithUndo(btn.dataset.id);
    });

    this.els.shareButton.addEventListener('click', () => this.openWhatsAppShare());

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.els.modal.hidden) this.closeModal();
    });

    // Re-request Wake Lock if page becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.focusMode && !this.wakeLock) {
        this.requestWakeLock();
      }
    });
  }

  // ── Modal ─────────────────────────────────────────────────────────

  populateCategories() {
    this.els.categorySelect.innerHTML = CATEGORIES
      .map(c => `<option value="${this.escapeHtml(c.id)}">${this.escapeHtml(c.name)}</option>`)
      .join('');
  }

  openModal() {
    this._priority = 0;
    this.els.form.reset();
    this.els.quantityInput.value             = '1';
    this.els.priorityToggle.textContent      = '☆ רגיל';
    this.els.priorityToggle.dataset.priority = '0';
    this.els.modal.hidden        = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => this.els.nameInput.focus(), 50);
  }

  closeModal() {
    this.els.modal.hidden        = true;
    document.body.style.overflow = '';
  }

  // ── Helpers ───────────────────────────────────────────────────────

  markInvalid(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    el.focus();
  }

  createId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  escapeHtml(v) {
    return String(v)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('service-worker.js')
      .catch(err => console.warn('SW error', err));
  }
}

document.addEventListener('DOMContentLoaded', () => { window.smartShop = new AppManager(); });
