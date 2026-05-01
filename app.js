'use strict';

/* ================================================================
   Smart Shop — Vanilla JS PWA
   OOP Architecture: Product · Category · AppManager
   ================================================================ */

// ----------------------------------------------------------------
// Product – represents a single shopping item
// ----------------------------------------------------------------
class Product {
  constructor(id, name, category, isBought = false) {
    this.id       = id;
    this.name     = name;
    this.category = category; // Category ID string
    this.isBought = isBought;
  }

  toggleStatus() {
    this.isBought = !this.isBought;
  }
}

// ----------------------------------------------------------------
// Category – represents a product group
// ----------------------------------------------------------------
class Category {
  constructor(id, name) {
    this.id   = id;
    this.name = name;
  }
}

// ----------------------------------------------------------------
// AppManager – main controller (singleton)
// ----------------------------------------------------------------
class AppManager {
  constructor() {
    this.productsList   = [];
    this.categoriesList = [];
    this._initDefaultCategories();
    this.loadData();
    this._bindEvents();
    this.renderUI();
  }

  // ── Default Categories ───────────────────────────────────────
  _initDefaultCategories() {
    const defaults = [
      { id: 'cat_veg',    name: 'פירות וירקות'   },
      { id: 'cat_dairy',  name: 'מוצרי חלב'      },
      { id: 'cat_meat',   name: 'בשר ודגים'      },
      { id: 'cat_bread',  name: 'לחם ומאפים'     },
      { id: 'cat_canned', name: 'שימורים ויבשים' },
      { id: 'cat_clean',  name: 'מוצרי ניקיון'   },
      { id: 'cat_misc',   name: 'שונות'           },
    ];
    this.categoriesList = defaults.map(d => new Category(d.id, d.name));
  }

  // ── Data Persistence ─────────────────────────────────────────
  saveData() {
    localStorage.setItem('ss_products',   JSON.stringify(this.productsList));
    localStorage.setItem('ss_categories', JSON.stringify(this.categoriesList));
  }

  loadData() {
    const savedCats  = localStorage.getItem('ss_categories');
    const savedProds = localStorage.getItem('ss_products');

    if (savedCats) {
      this.categoriesList = JSON.parse(savedCats)
        .map(c => new Category(c.id, c.name));
    }
    if (savedProds) {
      this.productsList = JSON.parse(savedProds)
        .map(p => new Product(p.id, p.name, p.category, p.isBought));
    }
  }

  // ── Products CRUD ─────────────────────────────────────────────
  addNewProduct(name, categoryId) {
    if (!name || !categoryId) return;
    const id = 'prod_' + Date.now();
    this.productsList.push(new Product(id, name.trim(), categoryId));
    this.saveData();
    this.renderUI();
  }

  toggleProduct(id) {
    const product = this.productsList.find(p => p.id === id);
    if (!product) return;
    product.toggleStatus();
    this.saveData();
    this._patchProductDOM(product);
  }

  deleteProduct(id) {
    this.productsList = this.productsList.filter(p => p.id !== id);
    this.saveData();
    this.renderUI();
  }

  clearBought() {
    this.productsList = this.productsList.filter(p => !p.isBought);
    this.saveData();
    this.renderUI();
  }

  // ── Categories ───────────────────────────────────────────────
  addNewCategory(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = this.categoriesList.find(c => c.name === trimmed);
    if (existing) return existing.id;
    const id = 'cat_' + Date.now();
    this.categoriesList.push(new Category(id, trimmed));
    this.saveData();
    return id;
  }

  // ── Render (full rebuild) ─────────────────────────────────────
  renderUI() {
    const container = document.getElementById('categoriesContainer');
    const emptyState = document.getElementById('emptyState');
    const fabBtn     = document.getElementById('fabWhatsApp');

    this._updateProgressBar();

    if (this.productsList.length === 0) {
      container.innerHTML = '';
      container.appendChild(emptyState);
      emptyState.style.display = 'flex';
      fabBtn.classList.remove('fab--visible');
      return;
    }

    emptyState.style.display = 'none';
    fabBtn.classList.add('fab--visible');

    // Group by category (preserve categoriesList order)
    const groups = [];
    this.categoriesList.forEach(cat => {
      const prods = this.productsList.filter(p => p.category === cat.id);
      if (prods.length > 0) groups.push({ cat, prods });
    });

    // Orphan products (unknown / deleted category)
    const knownIds = new Set(this.categoriesList.map(c => c.id));
    const orphans  = this.productsList.filter(p => !knownIds.has(p.category));
    if (orphans.length > 0) {
      groups.push({ cat: new Category('__orphan__', 'שונות'), prods: orphans });
    }

    // Build HTML
    const boughtTotal = this.productsList.filter(p => p.isBought).length;
    const clearBtnHtml = boughtTotal > 0
      ? `<button class="btn-clear-bought" id="btnClearBought">🗑️ נקה נרכשו (${boughtTotal})</button>`
      : '';

    container.innerHTML =
      groups.map(({ cat, prods }) => this._buildCategoryHtml(cat, prods)).join('') +
      clearBtnHtml;

    this._bindProductEvents();
    if (boughtTotal > 0) {
      document.getElementById('btnClearBought')
        .addEventListener('click', () => this.clearBought());
    }
  }

  _buildCategoryHtml(cat, prods) {
    const bought = prods.filter(p => p.isBought).length;
    return `
<section class="cat-section" data-cat-id="${this._esc(cat.id)}">
  <div class="cat-header">
    <span class="cat-icon">${this._getCatIcon(cat.name)}</span>
    <span class="cat-name">${this._esc(cat.name)}</span>
    <span class="cat-badge">${bought}/${prods.length}</span>
  </div>
  <ul class="prod-list">
    ${prods.map(p => this._buildProductHtml(p)).join('')}
  </ul>
</section>`;
  }

  _buildProductHtml(p) {
    const boughtClass = p.isBought ? ' is-bought' : '';
    const checked     = p.isBought ? ' checked'   : '';
    return `
<li class="prod-item${boughtClass}" data-id="${this._esc(p.id)}">
  <label class="prod-label">
    <input class="prod-cb" type="checkbox"${checked} data-id="${this._esc(p.id)}">
    <span class="prod-name">${this._esc(p.name)}</span>
  </label>
  <button class="prod-del" data-id="${this._esc(p.id)}" aria-label="מחק">✕</button>
</li>`;
  }

  // ── DOM Patch (toggle without full re-render) ─────────────────
  _patchProductDOM(product) {
    const li = document.querySelector(`.prod-item[data-id="${product.id}"]`);
    if (!li) { this.renderUI(); return; }

    li.classList.toggle('is-bought', product.isBought);

    // Update category badge
    const section = li.closest('.cat-section');
    if (section) {
      const catId    = section.dataset.catId;
      const catProds = this.productsList.filter(p => p.category === catId);
      const boughtCnt = catProds.filter(p => p.isBought).length;
      const badge = section.querySelector('.cat-badge');
      if (badge) badge.textContent = `${boughtCnt}/${catProds.length}`;
    }

    this._updateProgressBar();

    // Update / insert / remove clear-bought button
    const boughtTotal = this.productsList.filter(p => p.isBought).length;
    const existing = document.getElementById('btnClearBought');

    if (boughtTotal > 0) {
      if (existing) {
        existing.innerHTML = `🗑️ נקה נרכשו (${boughtTotal})`;
      } else {
        const btn = document.createElement('button');
        btn.className = 'btn-clear-bought';
        btn.id        = 'btnClearBought';
        btn.innerHTML = `🗑️ נקה נרכשו (${boughtTotal})`;
        btn.addEventListener('click', () => this.clearBought());
        document.getElementById('categoriesContainer').appendChild(btn);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  // ── Progress Bar ─────────────────────────────────────────────
  _updateProgressBar() {
    const total  = this.productsList.length;
    const bought = this.productsList.filter(p => p.isBought).length;
    const wrap = document.getElementById('progressWrap');
    const bar  = document.getElementById('progressBar');
    if (!wrap || !bar) return;

    if (total === 0) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    bar.style.width = `${Math.round((bought / total) * 100)}%`;
  }

  // ── WhatsApp Summary ──────────────────────────────────────────
  generateWhatsAppSummary() {
    if (this.productsList.length === 0) {
      alert('הרשימה ריקה. הוסף מוצרים תחילה.');
      return;
    }

    const notBought = this.productsList.filter(p => !p.isBought);
    const bought    = this.productsList.filter(p => p.isBought);

    const today = new Date().toLocaleDateString('he-IL', {
      day: 'numeric', month: 'long', year: 'numeric'
    });

    let msg = `🛒 *רשימת הקניות שלי*\n📅 ${today}\n`;

    if (notBought.length > 0) {
      msg += '\n📋 *עדיין צריך לקנות:*\n';
      const knownIds = new Set(this.categoriesList.map(c => c.id));

      this.categoriesList.forEach(cat => {
        const items = notBought.filter(p => p.category === cat.id);
        if (items.length === 0) return;
        msg += `\n📦 _${cat.name}:_\n`;
        items.forEach(p => { msg += `  ☐ ${p.name}\n`; });
      });

      // Orphans
      notBought
        .filter(p => !knownIds.has(p.category))
        .forEach(p => { msg += `  ☐ ${p.name}\n`; });
    }

    if (bought.length > 0) {
      msg += '\n✅ *כבר נקנה:*\n';
      bought.forEach(p => { msg += `  ✓ ${p.name}\n`; });
    }

    msg += '\n_נשלח מ-Smart Shop_ 🛒';

    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  }

  // ── Event Binding ─────────────────────────────────────────────
  _bindEvents() {
    document.getElementById('btnOpenModal')
      .addEventListener('click', () => this._openModal());

    ['modalClose', 'btnCancel'].forEach(id =>
      document.getElementById(id).addEventListener('click', () => this._closeModal())
    );

    document.getElementById('modalOverlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) this._closeModal();
    });

    document.getElementById('btnSave')
      .addEventListener('click', () => this._handleSave());

    document.getElementById('productName')
      .addEventListener('keydown', e => { if (e.key === 'Enter') this._handleSave(); });

    document.getElementById('categorySelect').addEventListener('change', e => {
      document.getElementById('newCategoryGroup').style.display =
        e.target.value === '__new__' ? 'block' : 'none';
    });

    document.getElementById('fabWhatsApp')
      .addEventListener('click', () => this.generateWhatsAppSummary());

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }

  _bindProductEvents() {
    document.querySelectorAll('.prod-cb').forEach(cb => {
      cb.addEventListener('change', e => this.toggleProduct(e.target.dataset.id));
    });

    document.querySelectorAll('.prod-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('למחוק את הפריט?')) {
          this.deleteProduct(e.currentTarget.dataset.id);
        }
      });
    });
  }

  // ── Modal ─────────────────────────────────────────────────────
  _openModal() {
    const sel = document.getElementById('categorySelect');
    sel.innerHTML = '<option value="">-- בחר קטגוריה --</option>';
    this.categoriesList.forEach(c => {
      const opt = document.createElement('option');
      opt.value       = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    const newOpt = document.createElement('option');
    newOpt.value       = '__new__';
    newOpt.textContent = '+ הוסף קטגוריה חדשה';
    sel.appendChild(newOpt);

    document.getElementById('productName').value     = '';
    document.getElementById('newCategoryName').value = '';
    document.getElementById('newCategoryGroup').style.display = 'none';
    sel.value = '';

    document.getElementById('modalOverlay').classList.add('is-open');
    setTimeout(() => document.getElementById('productName').focus(), 150);
  }

  _closeModal() {
    document.getElementById('modalOverlay').classList.remove('is-open');
  }

  _handleSave() {
    const nameInput    = document.getElementById('productName');
    const catSel       = document.getElementById('categorySelect');
    const name = nameInput.value.trim();
    let   catId = catSel.value;

    if (!name)  { this._shake(nameInput); nameInput.focus(); return; }
    if (!catId) { this._shake(catSel);    return; }

    if (catId === '__new__') {
      const newNameInput = document.getElementById('newCategoryName');
      const newName = newNameInput.value.trim();
      if (!newName) { this._shake(newNameInput); newNameInput.focus(); return; }
      catId = this.addNewCategory(newName);
    }

    this.addNewProduct(name, catId);
    this._closeModal();
  }

  // ── Utilities ─────────────────────────────────────────────────
  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _shake(el) {
    el.classList.add('shake');
    el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
  }

  _getCatIcon(name) {
    const MAP = {
      'פירות וירקות':   '🥑',
      'מוצרי חלב':      '🧀',
      'בשר ודגים':      '🥩',
      'לחם ומאפים':     '🍞',
      'שימורים ויבשים': '🥫',
      'מוצרי ניקיון':   '🧹',
      'שונות':          '🛒',
    };
    return MAP[name] || '📦';
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AppManager();
});
