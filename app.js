'use strict';

/* ================================================================
   Smart Shop v6 — Sprint 6 + Multi-List
   Ch2: Price · Priority · Budget · Focus Mode · Autocomplete
   Ch3: Swipe · Undo Toast · Vibration · Wake Lock · Confetti · Audio
   Ch4: Magic Link · QR Generate/Scan · WhatsApp Import · Dark Mode
   Ch5: App Lock (PIN) · Settings · OTA Updates · Offline-First SW
   Ch6: Multi-List · Dashboard · Templates · Archive · Dynamic Theme
        · Voice Recognition · App Badging · Predictive Lists · RTL Fix
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

const THEMES = [
  { id: 'green',  label: 'ירוק',   primary: '#1f7a4d', strong: '#135c37', light: '#2ea862', accent: '#f0b429' },
  { id: 'blue',   label: 'כחול',   primary: '#2563eb', strong: '#1d4ed8', light: '#60a5fa', accent: '#f59e0b' },
  { id: 'purple', label: 'סגול',   primary: '#7c3aed', strong: '#6d28d9', light: '#a78bfa', accent: '#f472b6' },
  { id: 'red',    label: 'אדום',   primary: '#dc2626', strong: '#b91c1c', light: '#f87171', accent: '#fbbf24' },
  { id: 'teal',   label: 'טורקיז', primary: '#0d9488', strong: '#0f766e', light: '#2dd4bf', accent: '#f0b429' },
  { id: 'pink',   label: 'ורוד',   primary: '#db2777', strong: '#be185d', light: '#f472b6', accent: '#a3e635' },
];

const TEMPLATES = [
  { name: 'קניות בסיסיות', icon: '🥗', items: [
    { name: 'לחם',        cat: 'bakery',            qty: 1 },
    { name: 'חלב',        cat: 'dairy_eggs',        qty: 1 },
    { name: 'ביצים',      cat: 'dairy_eggs',        qty: 1 },
    { name: 'עגבניות',    cat: 'fruits_vegetables', qty: 1 },
    { name: 'מלפפון',     cat: 'fruits_vegetables', qty: 1 },
    { name: 'גבינה לבנה', cat: 'dairy_eggs',        qty: 1 },
  ]},
  { name: 'שישי בבית', icon: '🏠', items: [
    { name: 'חלות',       cat: 'bakery',            qty: 2 },
    { name: 'יין',        cat: 'other',             qty: 1 },
    { name: 'סלט ירקות',  cat: 'fruits_vegetables', qty: 1 },
    { name: 'דג',         cat: 'meat_fish',         qty: 1 },
  ]},
  { name: 'מסיבה', icon: '🎉', items: [
    { name: 'שתייה קלה',  cat: 'other',      qty: 4 },
    { name: 'חטיפים',     cat: 'pantry',     qty: 3 },
    { name: 'נקניקיות',   cat: 'meat_fish',  qty: 2 },
    { name: 'לחמניות',    cat: 'bakery',     qty: 12 },
  ]},
];

// ── Product class ────────────────────────────────────────────────────

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
    this.storageKeyV2     = 'smart_shop_v2';
    this.storageKeyV1     = 'smart_shop_products_v1';
    this.historyKey       = 'smart_shop_history_v1';
    this.purchaseLogKey   = 'smart_shop_purchase_log';
    this.snoozeKey        = 'smart_shop_snooze';
    this.themeKey         = 'smart_shop_theme';

    this.workspace        = null;       // V2 workspace { version, lists }
    this.activeListId     = null;       // currently viewed list ID
    this.currentView      = 'lists';    // 'lists' | 'list-detail' | 'templates' | 'settings'
    this.history          = [];
    this.purchaseLog      = {};         // { name: { category, dates[] } }
    this.snoozeMap        = {};         // { name: timestamp }
    this.focusMode        = false;
    this._priority        = 0;
    this._undoTimer       = null;
    this._lastAllBought   = false;
    this.wakeLock         = null;
    this._swipeTouch      = null;
    this._pendingImport   = null;
    this._scanStream      = null;
    this._scanActive      = false;
    this._pinBuffer       = '';
    this._lockEnabled     = false;
    this._pinHash         = null;
    this._swReg           = null;
    this._predictiveOpen  = true;
    this._selectedIcon    = '🛒';

    this.cacheDom();
    this.applyTheme(localStorage.getItem(this.themeKey) || 'green');

    // Quick sync check — hide lock screen immediately if user disabled it
    if (localStorage.getItem('smart_shop_lock_enabled') === 'false') {
      this.els.lockScreen.hidden = true;
    }
    this.initLock();

    this.loadData();
    this.loadHistory();
    this.loadPurchaseLog();
    this.loadSnooze();
    this.populateCategories();
    this.renderThemePicker();
    this.bindEvents();
    this.setupSwipes();

    // Auto-navigate: if exactly 1 active list, jump into it
    const activeLists = this.workspace.lists.filter(l => !l.isArchived);
    if (activeLists.length === 1) {
      this.activeListId = activeLists[0].id;
      this.currentView = 'list-detail';
    }

    this.render();
    this.checkIncomingLink();
    this.registerServiceWorker();
  }

  // ── DOM ──────────────────────────────────────────────────────────

  cacheDom() {
    this.els = {
      // Header
      headerEyebrow: document.getElementById('headerEyebrow'),
      headerTitle:   document.getElementById('headerTitle'),
      headerActions: document.getElementById('headerActions'),
      btnBack:       document.getElementById('btnBack'),
      focusModeBtn:  document.getElementById('focusModeBtn'),
      summaryStrip:  document.getElementById('summaryStrip'),
      summaryTotal:  document.getElementById('summaryTotal'),
      summaryBought: document.getElementById('summaryBought'),
      summaryLeft:   document.getElementById('summaryLeft'),
      summaryBudget: document.getElementById('summaryBudget'),
      // Views
      viewLists:      document.getElementById('viewLists'),
      viewListDetail: document.getElementById('viewListDetail'),
      viewTemplates:  document.getElementById('viewTemplates'),
      viewSettings:   document.getElementById('viewSettings'),
      listsGrid:      document.getElementById('listsGrid'),
      emptyDashboard: document.getElementById('emptyDashboard'),
      templatesGrid:  document.getElementById('templatesGrid'),
      // List detail
      emptyState:     document.getElementById('emptyState'),
      categoriesEl:   document.getElementById('categoriesContainer'),
      archiveListBtn: document.getElementById('archiveListBtn'),
      // Predictive
      predictiveSection: document.getElementById('predictiveSection'),
      predictiveList:    document.getElementById('predictiveList'),
      // Bottom nav
      bottomNav:      document.getElementById('bottomNav'),
      // WhatsApp FAB
      shareButton:    document.getElementById('shareWhatsAppButton'),
      // Product modal
      modal:          document.getElementById('productModal'),
      form:           document.getElementById('productForm'),
      nameInput:      document.getElementById('productName'),
      nameHistory:    document.getElementById('nameHistory'),
      categorySelect: document.getElementById('productCategory'),
      quantityInput:  document.getElementById('productQuantity'),
      unitSelect:     document.getElementById('productUnit'),
      priceInput:     document.getElementById('productPrice'),
      priorityToggle: document.getElementById('priorityToggle'),
      voiceBtn:       document.getElementById('voiceBtn'),
      // Undo toast
      undoToast:      document.getElementById('undoToast'),
      undoMessage:    document.getElementById('undoMessage'),
      undoBtn:        document.getElementById('undoBtn'),
      // Share modal (Ch4)
      shareModal:     document.getElementById('shareModal'),
      magicLinkInput: document.getElementById('magicLinkInput'),
      copyLinkBtn:    document.getElementById('copyLinkBtn'),
      toggleQrBtn:    document.getElementById('toggleQrBtn'),
      qrContainer:    document.getElementById('qrContainer'),
      importTextarea: document.getElementById('importTextarea'),
      importPreview:  document.getElementById('importPreview'),
      incomingBanner: document.getElementById('incomingBanner'),
      incomingCount:  document.getElementById('incomingCount'),
      qrScanWrapper:  document.getElementById('qrScanWrapper'),
      qrVideo:        document.getElementById('qrVideo'),
      qrCanvas:       document.getElementById('qrCanvas'),
      // Lock screen (Ch5)
      lockScreen:     document.getElementById('lockScreen'),
      lockInner:      document.getElementById('lockInner'),
      pinDots:        document.getElementById('pinDots'),
      pinPad:         document.getElementById('pinPad'),
      lockError:      document.getElementById('lockError'),
      lockHint:       document.getElementById('lockHint'),
      // Settings (now a view)
      lockToggle:     document.getElementById('lockToggle'),
      newPinInput:    document.getElementById('newPinInput'),
      changePinSection: document.getElementById('changePinSection'),
      themePicker:    document.getElementById('themePicker'),
      // New list modal
      newListModal:   document.getElementById('newListModal'),
      newListName:    document.getElementById('newListName'),
      iconPicker:     document.getElementById('iconPicker'),
      // Archive modal
      archiveModal:   document.getElementById('archiveModal'),
      archiveContent: document.getElementById('archiveContent'),
      // Update toast
      updateToast:    document.getElementById('updateToast'),
    };
  }

  // ── Data V2 ──────────────────────────────────────────────────────

  loadData() {
    // Try V2 first
    const v2raw = localStorage.getItem(this.storageKeyV2);
    if (v2raw) {
      try {
        this.workspace = this.hydrateWorkspace(JSON.parse(v2raw));
      } catch { this.workspace = { version: 2, lists: [] }; }
      return;
    }

    // Migrate from V1
    const v1raw = localStorage.getItem(this.storageKeyV1);
    if (v1raw) {
      try {
        const items = JSON.parse(v1raw);
        const products = items.map(item => new Product(
          item.id, item.name, item.category,
          item.quantity, item.isBought,
          item.price, item.priority, item.unit
        ));
        const list = {
          id: this.createId(), name: 'הרשימה שלי',
          icon: '🛒', createdAt: Date.now(), isArchived: false,
          products
        };
        this.workspace = { version: 2, lists: [list] };
        this.saveData();
        localStorage.removeItem(this.storageKeyV1);
      } catch { this.workspace = { version: 2, lists: [] }; }
      return;
    }

    // Fresh start
    this.workspace = { version: 2, lists: [] };
  }

  hydrateWorkspace(raw) {
    return {
      version: 2,
      lists: (raw.lists || []).map(l => ({
        id:         l.id,
        name:       l.name || 'רשימה',
        icon:       l.icon || '🛒',
        createdAt:  l.createdAt || Date.now(),
        isArchived: Boolean(l.isArchived),
        products:   (l.products || []).map(p => new Product(
          p.id, p.name, p.category,
          p.quantity, p.isBought,
          p.price, p.priority, p.unit
        ))
      }))
    };
  }

  saveData() {
    localStorage.setItem(this.storageKeyV2, JSON.stringify(this.workspace));
  }

  getActiveList() {
    if (!this.activeListId) return null;
    return this.workspace.lists.find(l => l.id === this.activeListId) || null;
  }

  get products() {
    const list = this.getActiveList();
    return list ? list.products : [];
  }

  set products(val) {
    const list = this.getActiveList();
    if (list) list.products = val;
  }

  // ── List Management ──────────────────────────────────────────────

  createList(name, icon) {
    const list = {
      id: this.createId(), name: name.trim() || 'רשימה חדשה',
      icon: icon || '🛒', createdAt: Date.now(), isArchived: false,
      products: []
    };
    this.workspace.lists.unshift(list);
    this.saveData();
    this.navigateTo('list-detail', list.id);
  }

  deleteList(id) {
    const list = this.workspace.lists.find(l => l.id === id);
    if (!list) return;
    if (!confirm(`למחוק את "${list.name}"?`)) return;
    this.workspace.lists = this.workspace.lists.filter(l => l.id !== id);
    this.saveData();
    if (this.activeListId === id) {
      this.activeListId = null;
      this.navigateTo('lists');
    } else {
      this.render();
    }
  }

  archiveList(id) {
    const list = this.workspace.lists.find(l => l.id === id);
    if (!list) return;
    list.isArchived = true;
    this.saveData();
    this.launchConfetti();
    this.playSuccess();
    this.vibrate([100, 50, 100, 50, 200]);
    this.activeListId = null;
    this.navigateTo('lists');
    this.showToast(`📦 "${list.name}" הועבר לארכיון`);
  }

  restoreList(id) {
    const list = this.workspace.lists.find(l => l.id === id);
    if (!list) return;
    list.isArchived = false;
    list.products.forEach(p => { p.isBought = false; });
    this.saveData();
    this.renderArchive();
    this.showToast(`✅ "${list.name}" שוחזר`);
  }

  deleteArchivedList(id) {
    const list = this.workspace.lists.find(l => l.id === id);
    if (!list) return;
    if (!confirm(`למחוק לצמיתות את "${list.name}"?`)) return;
    this.workspace.lists = this.workspace.lists.filter(l => l.id !== id);
    this.saveData();
    this.renderArchive();
  }

  applyTemplate(templateIndex) {
    const tmpl = TEMPLATES[templateIndex];
    if (!tmpl) return;
    const list = {
      id: this.createId(), name: tmpl.name,
      icon: tmpl.icon, createdAt: Date.now(), isArchived: false,
      products: tmpl.items.map(it =>
        new Product(this.createId(), it.name, it.cat, it.qty)
      )
    };
    this.workspace.lists.unshift(list);
    this.saveData();
    this.navigateTo('list-detail', list.id);
    this.showToast(`✅ נוצרה רשימה "${tmpl.name}"`);
  }

  // ── History ──────────────────────────────────────────────────────

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

  // ── Purchase Log (Predictive) ──────────────────────────────────

  loadPurchaseLog() {
    try {
      const raw = localStorage.getItem(this.purchaseLogKey);
      this.purchaseLog = raw ? JSON.parse(raw) : {};
    } catch { this.purchaseLog = {}; }
  }

  savePurchaseLog() {
    localStorage.setItem(this.purchaseLogKey, JSON.stringify(this.purchaseLog));
  }

  recordPurchase(name, category) {
    if (!this.purchaseLog[name]) {
      this.purchaseLog[name] = { category, dates: [] };
    }
    this.purchaseLog[name].dates.push(Date.now());
    if (this.purchaseLog[name].dates.length > 10) {
      this.purchaseLog[name].dates = this.purchaseLog[name].dates.slice(-10);
    }
    this.savePurchaseLog();
  }

  loadSnooze() {
    try {
      const raw = localStorage.getItem(this.snoozeKey);
      this.snoozeMap = raw ? JSON.parse(raw) : {};
    } catch { this.snoozeMap = {}; }
  }

  saveSnooze() {
    localStorage.setItem(this.snoozeKey, JSON.stringify(this.snoozeMap));
  }

  snoozeSuggestion(name) {
    this.snoozeMap[name] = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    this.saveSnooze();
    this.renderPredictive();
  }

  addSuggestionToList(name, category) {
    this.addProduct(name, category, 1);
    this.renderPredictive();
  }

  getSuggestions() {
    const now = Date.now();
    const suggestions = [];

    for (const [name, data] of Object.entries(this.purchaseLog)) {
      if (data.dates.length < 3) continue;

      const intervals = [];
      for (let i = 1; i < data.dates.length; i++) {
        intervals.push(data.dates[i] - data.dates[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const lastPurchase = data.dates[data.dates.length - 1];
      const elapsed = now - lastPurchase;
      const ratio = elapsed / avgInterval;

      if (ratio < 0.8) continue;

      // Skip snoozed
      const snoozeUntil = this.snoozeMap[name];
      if (snoozeUntil && now < snoozeUntil) continue;

      // Skip if already in current list and not bought
      if (this.products.some(p => p.name === name && !p.isBought)) continue;

      suggestions.push({
        name,
        category: data.category,
        avgDays: Math.round(avgInterval / (1000 * 60 * 60 * 24)),
        daysSince: Math.round(elapsed / (1000 * 60 * 60 * 24)),
        urgency: ratio
      });
    }

    return suggestions.sort((a, b) => b.urgency - a.urgency).slice(0, 8);
  }

  // ── Products ───────────────────────────────────────────────────

  addProduct(name, category, quantity, price = 0, priority = 0, unit = '') {
    const list = this.getActiveList();
    if (!list) return;
    list.products.unshift(new Product(
      this.createId(), name.trim(), category,
      quantity, false, price, priority, unit
    ));
    this.addToHistory(name);
    this._lastAllBought = false;
    this.saveData();
    this.render();
    this.playClick();
  }

  toggleProduct(id) {
    const product = this.products.find(p => p.id === id);
    if (!product) return;
    const wasBought = product.isBought;
    product.toggleStatus();
    // Record purchase for predictive engine
    if (product.isBought && !wasBought) {
      this.recordPurchase(product.name, product.category);
    }
    this.saveData();
    this.render();
    this.vibrate(product.isBought ? [60, 30, 60] : [30]);
    this.checkCompletion();
  }

  deleteProductWithUndo(id) {
    const list = this.getActiveList();
    if (!list) return;
    const product = list.products.find(p => p.id === id);
    if (!product) return;

    const snapshot  = { ...product };
    const origIndex = list.products.indexOf(product);

    list.products = list.products.filter(p => p.id !== id);
    this.saveData();
    this.render();
    this.vibrate([50, 50, 80]);

    this.showUndoToast(`נמחק: ${product.name}`, () => {
      const restored = new Product(
        snapshot.id, snapshot.name, snapshot.category,
        snapshot.quantity, snapshot.isBought,
        snapshot.price, snapshot.priority, snapshot.unit
      );
      const activeList = this.getActiveList();
      if (activeList) {
        activeList.products.splice(Math.min(origIndex, activeList.products.length), 0, restored);
        this.saveData();
        this.render();
        this.vibrate([80]);
      }
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

  // ── Navigation ─────────────────────────────────────────────────

  navigateTo(view, listId = null) {
    if (listId) this.activeListId = listId;
    this.currentView = view;

    // If navigating to list-detail, verify list exists
    if (view === 'list-detail') {
      const list = this.getActiveList();
      if (!list) {
        this.currentView = 'lists';
        this.activeListId = null;
      }
    }

    this.render();
  }

  updateHeader() {
    const isDetail = this.currentView === 'list-detail';
    const list     = this.getActiveList();

    this.els.btnBack.hidden       = !isDetail;
    this.els.headerActions.hidden = !isDetail;
    this.els.summaryStrip.hidden  = !isDetail || this.products.length === 0;

    if (isDetail && list) {
      this.els.headerEyebrow.textContent = `${list.icon} ${this.escapeHtml(list.name)}`;
      this.els.headerTitle.textContent   = 'Smart Shop';
    } else if (this.currentView === 'templates') {
      this.els.headerEyebrow.textContent = '📋 תבניות מוכנות';
      this.els.headerTitle.textContent   = 'Smart Shop';
    } else if (this.currentView === 'settings') {
      this.els.headerEyebrow.textContent = '⚙️ הגדרות';
      this.els.headerTitle.textContent   = 'Smart Shop';
    } else {
      this.els.headerEyebrow.textContent = 'רשימת קניות אישית';
      this.els.headerTitle.textContent   = 'Smart Shop';
    }
  }

  updateBottomNav() {
    const tabName = (this.currentView === 'list-detail') ? 'lists' : this.currentView;
    this.els.bottomNav.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
  }

  // ── Rendering ──────────────────────────────────────────────────

  render() {
    // Hide all views
    this.els.viewLists.hidden      = true;
    this.els.viewListDetail.hidden = true;
    this.els.viewTemplates.hidden  = true;
    this.els.viewSettings.hidden   = true;

    switch (this.currentView) {
      case 'lists':       this.renderDashboard(); break;
      case 'list-detail': this.renderListDetail(); break;
      case 'templates':   this.renderTemplates(); break;
      case 'settings':    this.renderSettingsView(); break;
    }

    this.updateHeader();
    this.updateBottomNav();
    this.updateBadge();
  }

  renderDashboard() {
    this.els.viewLists.hidden = false;
    this.els.shareButton.hidden = true;

    const activeLists = this.workspace.lists.filter(l => !l.isArchived);
    this.els.emptyDashboard.hidden = activeLists.length > 0;

    if (activeLists.length === 0) {
      this.els.listsGrid.innerHTML = '';
      return;
    }

    this.els.listsGrid.innerHTML = activeLists.map(list => {
      const total  = list.products.length;
      const bought = list.products.filter(p => p.isBought).length;
      const pct    = total > 0 ? Math.round((bought / total) * 100) : 0;
      const timeLeft = total > 0 ? Math.ceil((total - bought) * 1.5) : 0;
      const statusText = total === 0
        ? 'ריקה'
        : bought === total
          ? '✅ הושלמה!'
          : `${bought}/${total} (${pct}%) · ⏱ ~${timeLeft} דק׳`;

      return `
<article class="list-card" data-list-id="${this.escapeHtml(list.id)}">
  <div class="list-card-top">
    <span class="list-card-icon">${list.icon}</span>
    <div class="list-card-info">
      <h3 class="list-card-name">${this.escapeHtml(list.name)}</h3>
      <p class="list-card-status">${statusText}</p>
    </div>
    <button class="list-card-delete" data-action="delete-list"
            data-list-id="${this.escapeHtml(list.id)}" aria-label="מחק רשימה">×</button>
  </div>
  <div class="list-card-progress">
    <div class="list-card-bar" style="width:${pct}%"></div>
  </div>
</article>`;
    }).join('') + `
<button class="new-list-card" id="newListCardBtn" type="button">
  <span class="new-list-card-icon">+</span>
  <span>רשימה חדשה</span>
</button>`;
  }

  renderListDetail() {
    this.els.viewListDetail.hidden = false;
    const list = this.getActiveList();
    if (!list) return;

    const total  = list.products.length;
    const bought = list.products.filter(p => p.isBought).length;
    const left   = total - bought;
    const budget = list.products
      .filter(p => !p.isBought && p.price > 0)
      .reduce((s, p) => s + p.price * p.quantity, 0);
    const timeLeft = Math.ceil(left * 1.5);

    this.els.emptyState.hidden   = total > 0;
    this.els.summaryStrip.hidden = total === 0;
    this.els.shareButton.hidden  = total === 0;

    this.els.summaryTotal.textContent  = `${total} ${total === 1 ? 'מוצר' : 'מוצרים'}`;
    this.els.summaryBought.textContent = `${bought} נקנו`;
    this.els.summaryLeft.textContent   = left > 0
      ? `${left} חסרים · ⏱~${timeLeft}דק׳`
      : '✅ הכל נאסף!';
    this.els.summaryBudget.textContent = budget > 0 ? `₪${budget.toFixed(0)} משוער` : '';

    // Show archive button when all bought
    this.els.archiveListBtn.hidden = !(total > 0 && bought === total);

    this.els.categoriesEl.innerHTML = CATEGORIES
      .map(cat => this.renderCategory(cat))
      .filter(Boolean)
      .join('');

    this.renderPredictive();
  }

  renderCategory(category) {
    let products = this.products.filter(p => p.category === category.id);
    if (products.length === 0) return '';

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

  renderTemplates() {
    this.els.viewTemplates.hidden = false;
    this.els.shareButton.hidden   = true;

    this.els.templatesGrid.innerHTML = TEMPLATES.map((tmpl, i) => `
<article class="template-card">
  <div class="template-card-top">
    <span class="template-card-icon">${tmpl.icon}</span>
    <div>
      <h3 class="template-card-name">${this.escapeHtml(tmpl.name)}</h3>
      <p class="template-card-count">${tmpl.items.length} מוצרים</p>
    </div>
  </div>
  <ul class="template-items">${tmpl.items.map(it =>
    `<li>${this.escapeHtml(it.name)}${it.qty > 1 ? ` ×${it.qty}` : ''}</li>`
  ).join('')}</ul>
  <button class="primary-button template-apply-btn" data-template="${i}" type="button">
    + צור רשימה מתבנית
  </button>
</article>`).join('');
  }

  renderSettingsView() {
    this.els.viewSettings.hidden = false;
    this.els.shareButton.hidden  = true;

    // Sync lock toggle
    this.els.lockToggle.checked = this._lockEnabled;
    this.els.changePinSection.hidden = !this._lockEnabled;
  }

  renderPredictive() {
    if (this.currentView !== 'list-detail') return;
    const suggestions = this.getSuggestions();
    if (suggestions.length === 0) {
      this.els.predictiveSection.hidden = true;
      return;
    }

    this.els.predictiveSection.hidden = false;
    const ICON = Object.fromEntries(CATEGORIES.map(c => [c.id, c.icon]));
    this.els.predictiveList.hidden = !this._predictiveOpen;
    this.els.predictiveList.innerHTML = suggestions.map(s => `
<div class="predict-item">
  <span class="predict-icon">${ICON[s.category] || '📦'}</span>
  <div class="predict-info">
    <span class="predict-name">${this.escapeHtml(s.name)}</span>
    <span class="predict-meta">כל ~${s.avgDays} ימים · ${s.daysSince} ימים עברו</span>
  </div>
  <div class="predict-actions">
    <button class="predict-add" data-action="predict-add"
            data-name="${this.escapeHtml(s.name)}" data-cat="${this.escapeHtml(s.category)}">+</button>
    <button class="predict-snooze" data-action="predict-snooze"
            data-name="${this.escapeHtml(s.name)}">💤</button>
  </div>
</div>`).join('');
  }

  renderArchive() {
    const archived = this.workspace.lists.filter(l => l.isArchived);
    if (archived.length === 0) {
      this.els.archiveContent.innerHTML = '<p class="archive-empty">הארכיון ריק</p>';
      return;
    }
    this.els.archiveContent.innerHTML = archived.map(list => {
      const total = list.products.length;
      const date  = new Date(list.createdAt).toLocaleDateString('he-IL');
      return `
<div class="archive-item">
  <span class="archive-icon">${list.icon}</span>
  <div class="archive-info">
    <span class="archive-name">${this.escapeHtml(list.name)}</span>
    <span class="archive-meta">${total} מוצרים · ${date}</span>
  </div>
  <div class="archive-actions">
    <button class="secondary-button small" data-action="restore-list"
            data-list-id="${this.escapeHtml(list.id)}">♻️ שחזר</button>
    <button class="danger-btn-sm" data-action="delete-archived"
            data-list-id="${this.escapeHtml(list.id)}">🗑</button>
  </div>
</div>`;
    }).join('');
  }

  // ── Theme ──────────────────────────────────────────────────────

  applyTheme(themeId) {
    const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
    const root  = document.documentElement;
    root.style.setProperty('--primary',       theme.primary);
    root.style.setProperty('--primary-strong', theme.strong);
    root.style.setProperty('--primary-light',  theme.light);
    root.style.setProperty('--accent',         theme.accent);
    // Update meta theme-color
    const meta = document.getElementById('metaThemeColor');
    if (meta) meta.content = theme.primary;
    localStorage.setItem(this.themeKey, themeId);
    this._currentTheme = themeId;
  }

  renderThemePicker() {
    if (!this.els.themePicker) return;
    const current = this._currentTheme || 'green';
    this.els.themePicker.innerHTML = THEMES.map(t => `
<button class="theme-swatch${t.id === current ? ' selected' : ''}"
        data-theme="${t.id}" title="${t.label}"
        style="--swatch:${t.primary}" type="button">
  ${t.id === current ? '✓' : ''}
</button>`).join('');
  }

  // ── Voice Recognition ──────────────────────────────────────────

  startVoiceRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.showToast('❌ הקלטה קולית אינה נתמכת בדפדפן זה');
      return;
    }

    const recognition = new SR();
    recognition.lang = 'he-IL';
    recognition.continuous = false;
    recognition.interimResults = false;

    this.els.voiceBtn.classList.add('voice-active');

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      // Split on commas and Hebrew "ו" (and)
      const items = text
        .split(/[,،]\s*|\s+ו(?:\s+|$)/)
        .map(s => s.trim())
        .filter(s => s.length >= 2);

      if (items.length === 1) {
        this.els.nameInput.value = items[0];
        this.els.nameInput.focus();
      } else if (items.length > 1) {
        items.forEach(name => {
          this.addProduct(name, this.guessCategory(name), 1);
        });
        this.closeModal();
        this.showToast(`✅ נוספו ${items.length} מוצרים`);
      }
    };

    recognition.onerror = () => {
      this.els.voiceBtn.classList.remove('voice-active');
      this.showToast('❌ שגיאה בהקלטה');
    };

    recognition.onend = () => {
      this.els.voiceBtn.classList.remove('voice-active');
    };

    recognition.start();
  }

  // ── App Badging ────────────────────────────────────────────────

  updateBadge() {
    if (!('setAppBadge' in navigator)) return;
    // Count total missing items across all active lists
    const total = this.workspace.lists
      .filter(l => !l.isArchived)
      .reduce((sum, l) => sum + l.products.filter(p => !p.isBought).length, 0);
    if (total > 0) {
      navigator.setAppBadge(total).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }

  // ── Swipe-to-Action ─────────────────────────────────────────────

  setupSwipes() {
    const container = this.els.categoriesEl;
    const THRESHOLD = 72;
    const MAX_SHIFT = 110;

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
        lastX: t.clientX, tracking: false,
      };
      inner.style.transition = 'none';
    }, { passive: true });

    container.addEventListener('touchmove', e => {
      const touch = this._swipeTouch;
      if (!touch) return;
      const t  = e.touches[0];
      const dx = t.clientX - touch.startX;
      const dy = t.clientY - touch.startY;

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

  // ── Undo Toast ──────────────────────────────────────────────────

  showUndoToast(message, undoFn) {
    clearTimeout(this._undoTimer);
    const oldBtn = this.els.undoBtn;
    const newBtn = oldBtn.cloneNode(true);
    newBtn.hidden = false;
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
    setTimeout(() => {
      this.els.undoToast.hidden = true;
      this.els.undoBtn.hidden   = false;
    }, 320);
  }

  showToast(message) {
    this.els.undoMessage.textContent = message;
    this.els.undoBtn.hidden          = true;
    this.els.undoToast.hidden        = false;
    requestAnimationFrame(() => this.els.undoToast.classList.add('visible'));
    clearTimeout(this._undoTimer);
    this._undoTimer = setTimeout(() => this.hideUndoToast(), 2400);
  }

  // ── Vibration API ───────────────────────────────────────────────

  vibrate(pattern) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch { /* ignore */ }
    }
  }

  // ── Wake Lock API ───────────────────────────────────────────────

  async requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch { /* ignore */ }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  // ── Focus Mode ──────────────────────────────────────────────────

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

  // ── Completion Check + Confetti + Sound ─────────────────────────

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

  // ── Web Audio ───────────────────────────────────────────────────

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

  // ── WhatsApp ────────────────────────────────────────────────────

  generateWhatsAppText() {
    const missing = this.products.filter(p => !p.isBought);
    const bought  = this.products.filter(p => p.isBought);
    const budget  = missing.filter(p => p.price > 0)
                           .reduce((s, p) => s + p.price * p.quantity, 0);
    const list = this.getActiveList();
    const title = list ? list.name : 'הרשימה שלי';

    const lines = [`🛒 *${title}*`];

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

  // ── Events ──────────────────────────────────────────────────────

  bindEvents() {
    // Focus mode
    this.els.focusModeBtn.addEventListener('click', () => this.toggleFocusMode());

    // Product modal
    document.getElementById('openProductModal').addEventListener('click', () => this.openModal());
    document.getElementById('emptyAddButton').addEventListener('click',  () => this.openModal());
    document.getElementById('closeProductModal').addEventListener('click',  () => this.closeModal());
    document.getElementById('cancelProductButton').addEventListener('click', () => this.closeModal());
    this.els.modal.addEventListener('click', e => { if (e.target === this.els.modal) this.closeModal(); });
    this.els.form.addEventListener('submit', e => { e.preventDefault(); this.handleProductSubmit(); });

    // Priority toggle
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

    // WhatsApp FAB
    this.els.shareButton.addEventListener('click', () => this.openWhatsAppShare());

    // Escape key
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!this.els.modal.hidden)         this.closeModal();
      else if (!this.els.shareModal.hidden)   this.closeShareModal();
      else if (!this.els.newListModal.hidden) this.closeNewListModal();
      else if (!this.els.archiveModal.hidden) this.closeArchiveModal();
    });

    // Wake Lock re-request
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.focusMode && !this.wakeLock) {
        this.requestWakeLock();
      }
    });

    // ── Navigation: Back button ──────────────────────────────
    this.els.btnBack.addEventListener('click', () => this.navigateTo('lists'));

    // ── Navigation: Bottom nav ───────────────────────────────
    this.els.bottomNav.addEventListener('click', e => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      const tab = btn.dataset.tab;
      if (tab === 'lists') {
        this.activeListId = null;
      }
      this.navigateTo(tab);
    });

    // ── Dashboard: list cards ────────────────────────────────
    this.els.listsGrid.addEventListener('click', e => {
      // Delete list
      const delBtn = e.target.closest('[data-action="delete-list"]');
      if (delBtn) {
        e.stopPropagation();
        this.deleteList(delBtn.dataset.listId);
        return;
      }
      // New list card
      if (e.target.closest('#newListCardBtn')) {
        this.openNewListModal();
        return;
      }
      // Click list card
      const card = e.target.closest('.list-card');
      if (card) this.navigateTo('list-detail', card.dataset.listId);
    });

    // Empty dashboard new list button
    document.getElementById('emptyNewListBtn').addEventListener('click', () => this.openNewListModal());

    // ── Templates ────────────────────────────────────────────
    this.els.templatesGrid.addEventListener('click', e => {
      const btn = e.target.closest('.template-apply-btn');
      if (btn) this.applyTemplate(Number(btn.dataset.template));
    });

    // ── New list modal ───────────────────────────────────────
    document.getElementById('closeNewListModal').addEventListener('click', () => this.closeNewListModal());
    this.els.newListModal.addEventListener('click', e => {
      if (e.target === this.els.newListModal) this.closeNewListModal();
    });
    this.els.iconPicker.addEventListener('click', e => {
      const btn = e.target.closest('.icon-btn');
      if (!btn) return;
      this.els.iconPicker.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      this._selectedIcon = btn.dataset.icon;
    });
    document.getElementById('createListBtn').addEventListener('click', () => {
      const name = this.els.newListName.value.trim();
      if (!name) { this.markInvalid(this.els.newListName); return; }
      this.createList(name, this._selectedIcon);
      this.closeNewListModal();
    });

    // ── Archive button in list detail ────────────────────────
    this.els.archiveListBtn.addEventListener('click', () => {
      if (this.activeListId) this.archiveList(this.activeListId);
    });

    // ── Archive modal ────────────────────────────────────────
    document.getElementById('openArchiveBtn').addEventListener('click', () => this.openArchiveModal());
    document.getElementById('closeArchiveModal').addEventListener('click', () => this.closeArchiveModal());
    this.els.archiveModal.addEventListener('click', e => {
      if (e.target === this.els.archiveModal) this.closeArchiveModal();
    });
    this.els.archiveContent.addEventListener('click', e => {
      const restoreBtn = e.target.closest('[data-action="restore-list"]');
      if (restoreBtn) { this.restoreList(restoreBtn.dataset.listId); return; }
      const deleteBtn = e.target.closest('[data-action="delete-archived"]');
      if (deleteBtn) { this.deleteArchivedList(deleteBtn.dataset.listId); return; }
    });

    // ── Settings view ────────────────────────────────────────
    this.els.lockToggle.addEventListener('change', () => this.handleLockToggle());
    document.getElementById('savePinBtn').addEventListener('click', () => this.handleSavePin());
    document.getElementById('clearAllBtn').addEventListener('click', () => this.handleClearAll());

    // Theme picker
    this.els.themePicker.addEventListener('click', e => {
      const swatch = e.target.closest('.theme-swatch');
      if (!swatch) return;
      this.applyTheme(swatch.dataset.theme);
      this.renderThemePicker();
    });

    // ── Voice recognition ────────────────────────────────────
    this.els.voiceBtn.addEventListener('click', () => this.startVoiceRecognition());

    // ── Predictive section ───────────────────────────────────
    document.getElementById('togglePredictive').addEventListener('click', () => {
      this._predictiveOpen = !this._predictiveOpen;
      this.els.predictiveList.hidden = !this._predictiveOpen;
      document.getElementById('togglePredictive').textContent = this._predictiveOpen ? '▾' : '▸';
    });
    this.els.predictiveList.addEventListener('click', e => {
      const addBtn = e.target.closest('[data-action="predict-add"]');
      if (addBtn) { this.addSuggestionToList(addBtn.dataset.name, addBtn.dataset.cat); return; }
      const snzBtn = e.target.closest('[data-action="predict-snooze"]');
      if (snzBtn) { this.snoozeSuggestion(snzBtn.dataset.name); return; }
    });

    // ── Share modal (Ch4) ────────────────────────────────────
    document.getElementById('openShareModal').addEventListener('click',  () => this.openShareModal());
    document.getElementById('closeShareModal').addEventListener('click', () => this.closeShareModal());
    this.els.shareModal.addEventListener('click', e => {
      if (e.target === this.els.shareModal) this.closeShareModal();
    });
    this.els.shareModal.querySelectorAll('.share-tab').forEach(tab =>
      tab.addEventListener('click', () => this.switchShareTab(tab))
    );
    this.els.copyLinkBtn.addEventListener('click',                             () => this.handleCopyLink());
    document.getElementById('toggleQrBtn').addEventListener('click',          () => this.handleToggleQR());
    document.getElementById('shareViaWhatsApp').addEventListener('click',     () => this.handleShareViaWhatsApp());
    this.els.importTextarea.addEventListener('input',                         () => this.updateImportPreview());
    document.getElementById('importFromTextBtn').addEventListener('click',    () => this.handleImportFromText());
    document.getElementById('incomingAcceptBtn').addEventListener('click',    () => this.acceptIncomingLink());
    document.getElementById('incomingDenyBtn').addEventListener('click',      () => this.dismissIncomingBanner());
    document.getElementById('scanQrBtn').addEventListener('click',            () => this.startQrScan());
    document.getElementById('stopScanBtn').addEventListener('click',          () => this.stopQrScan());

    // ── Lock screen (Ch5) ────────────────────────────────────
    this.els.pinPad.addEventListener('click', e => {
      const btn = e.target.closest('[data-digit]');
      if (btn) this.handlePinDigit(btn.dataset.digit);
    });
    document.getElementById('forgotPinBtn').addEventListener('click', () => this.handleForgotPin());

    // ── OTA ──────────────────────────────────────────────────
    document.getElementById('updateBtn').addEventListener('click', () => this.handleUpdate());
  }

  // ── Modal ───────────────────────────────────────────────────────

  populateCategories() {
    this.els.categorySelect.innerHTML = CATEGORIES
      .map(c => `<option value="${this.escapeHtml(c.id)}">${this.escapeHtml(c.name)}</option>`)
      .join('');
  }

  openModal() {
    if (!this.getActiveList()) {
      this.showToast('❌ בחר רשימה קודם');
      return;
    }
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

  // ── New List Modal ──────────────────────────────────────────────

  openNewListModal() {
    this.els.newListName.value = '';
    this._selectedIcon = '🛒';
    this.els.iconPicker.querySelectorAll('.icon-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.icon === '🛒');
    });
    this.els.newListModal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.els.newListName.focus(), 50);
  }

  closeNewListModal() {
    this.els.newListModal.hidden = true;
    document.body.style.overflow = '';
  }

  // ── Archive Modal ───────────────────────────────────────────────

  openArchiveModal() {
    this.renderArchive();
    this.els.archiveModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  closeArchiveModal() {
    this.els.archiveModal.hidden = true;
    document.body.style.overflow = '';
  }

  // ── Settings ────────────────────────────────────────────────────

  handleLockToggle() {
    this._lockEnabled = this.els.lockToggle.checked;
    localStorage.setItem('smart_shop_lock_enabled', String(this._lockEnabled));
    this.els.changePinSection.hidden = !this._lockEnabled;
  }

  async handleSavePin() {
    const pin = this.els.newPinInput.value;
    if (!/^\d{4}$/.test(pin)) {
      this.markInvalid(this.els.newPinInput);
      return;
    }
    this._pinHash = await this.hashPin(pin);
    localStorage.setItem('smart_shop_pin_hash', this._pinHash);
    localStorage.setItem('smart_shop_pin_custom', 'true');
    if (this.els.lockHint) this.els.lockHint.hidden = true;
    this.showToast('✅ קוד PIN עודכן');
    this.els.newPinInput.value = '';
  }

  handleClearAll() {
    if (!confirm('פעולה זו תמחק את כל הנתונים.\nלהמשיך?')) return;
    localStorage.clear();
    window.location.reload();
  }

  // ── Helpers ─────────────────────────────────────────────────────

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

  // ── Magic Link (Ch4) ───────────────────────────────────────────

  encodeMagicLink() {
    const compact = this.products.map(p =>
      [p.name, p.category, p.quantity, p.unit, p.price, p.priority]
    );
    const json = JSON.stringify(compact);
    const b64  = btoa(unescape(encodeURIComponent(json)));
    return `${location.origin}${location.pathname}?data=${encodeURIComponent(b64)}`;
  }

  decodeMagicLink(raw) {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(raw))));
    const arr  = JSON.parse(json);
    if (!Array.isArray(arr)) throw new Error('invalid');
    const validCats = new Set(CATEGORIES.map(c => c.id));
    return arr.map(([name, category, quantity, unit, price, priority]) => {
      const cat = validCats.has(category) ? category : 'other';
      return new Product(
        this.createId(), String(name || ''), cat,
        Number(quantity) || 1, false,
        Number(price) || 0, Number(priority) || 0, String(unit || '')
      );
    });
  }

  checkIncomingLink() {
    const params  = new URLSearchParams(location.search);
    const encoded = params.get('data');
    if (!encoded) return;
    history.replaceState({}, '', location.pathname + location.hash);
    try {
      const products = this.decodeMagicLink(encoded);
      if (products.length === 0) return;
      this._pendingImport = products;
      this.els.incomingCount.textContent = ` — ${products.length} מוצרים`;
      this.els.incomingBanner.hidden = false;
    } catch { /* ignore malformed */ }
  }

  acceptIncomingLink() {
    if (!this._pendingImport) return;
    const count = this._pendingImport.length;

    // If no active list, create one for the import
    if (!this.getActiveList()) {
      const list = {
        id: this.createId(), name: 'רשימה מיובאת',
        icon: '📥', createdAt: Date.now(), isArchived: false,
        products: []
      };
      this.workspace.lists.unshift(list);
      this.activeListId = list.id;
      this.currentView = 'list-detail';
    }

    this._pendingImport.forEach(p => {
      this.products.push(p);
      this.addToHistory(p.name);
    });
    this._pendingImport = null;
    this._lastAllBought = false;
    this.els.incomingBanner.hidden = true;
    this.saveData();
    this.render();
    this.vibrate([80, 40, 80]);
    this.showToast(`✅ יובאו ${count} מוצרים`);
  }

  dismissIncomingBanner() {
    this._pendingImport = null;
    this.els.incomingBanner.hidden = true;
  }

  // ── Share Modal (Ch4) ───────────────────────────────────────────

  openShareModal() {
    this.els.magicLinkInput.value    = this.encodeMagicLink();
    this.els.qrContainer.hidden      = true;
    this.els.qrContainer.innerHTML   = '';
    this.els.toggleQrBtn.textContent = '📷 הצג QR';
    this.els.importTextarea.value    = '';
    this.els.importPreview.hidden    = true;
    this.switchShareTab(
      this.els.shareModal.querySelector('[data-panel="panelExport"]')
    );
    this.els.shareModal.hidden   = false;
    document.body.style.overflow = 'hidden';
  }

  closeShareModal() {
    this.stopQrScan();
    this.els.shareModal.hidden   = true;
    document.body.style.overflow = '';
  }

  switchShareTab(activeTab) {
    if (activeTab.dataset.panel !== 'panelImport') this.stopQrScan();
    this.els.shareModal.querySelectorAll('.share-tab').forEach(t =>
      t.classList.remove('active')
    );
    this.els.shareModal.querySelectorAll('.share-panel').forEach(p => {
      p.hidden = true;
    });
    activeTab.classList.add('active');
    document.getElementById(activeTab.dataset.panel).hidden = false;
  }

  async handleCopyLink() {
    const url = this.els.magicLinkInput.value;
    try {
      await navigator.clipboard.writeText(url);
      this.els.copyLinkBtn.textContent = '✅ הועתק!';
      setTimeout(() => { this.els.copyLinkBtn.textContent = '📋 העתק'; }, 2200);
    } catch {
      this.els.magicLinkInput.select();
    }
  }

  handleShareViaWhatsApp() {
    const url = this.els.magicLinkInput.value;
    const msg = `🛒 רשימת הקניות שלי (לחץ לפתיחה): ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  handleToggleQR() {
    if (!this.els.qrContainer.hidden) {
      this.els.qrContainer.hidden      = true;
      this.els.qrContainer.innerHTML   = '';
      this.els.toggleQrBtn.textContent = '📷 הצג QR';
      return;
    }
    this.generateQR(this.els.magicLinkInput.value);
  }

  generateQR(url) {
    try {
      /* global qrcode */
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      const svgStr = qr.createSvgTag(4, 2);
      this.els.qrContainer.innerHTML = svgStr;
      const svgEl = this.els.qrContainer.querySelector('svg');
      if (svgEl) {
        const w = svgEl.getAttribute('width');
        const h = svgEl.getAttribute('height');
        if (w && h) svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
      }
      this.els.qrContainer.hidden      = false;
      this.els.toggleQrBtn.textContent = '🙈 הסתר QR';
    } catch {
      this.els.qrContainer.innerHTML   = '<p class="qr-error">הרשימה ארוכה מדי לקוד QR — השתמש בקישור</p>';
      this.els.qrContainer.hidden      = false;
    }
  }

  // ── WhatsApp Text Import (Ch4) ──────────────────────────────────

  guessCategory(name) {
    const n = name;
    if (/חלב|גבינ|יוגורט|ביצ|קוטג|שמנת|מוצרלה|פרמזן|בולגרי|לאבנה/.test(n))         return 'dairy_eggs';
    if (/לחם|חלה|פיתה|בגט|עוגה|עוגי|קרואסון|מאפה/.test(n))                           return 'bakery';
    if (/עגבני|מלפפ|פלפל|בצל|שום|תפוח|בננ|לימון|אבוקדו|גזר|סלק|תות|ענב|מנגו|אננס|קיווי|ברוקולי|כרוב|חסה|תרד|זוקיני|חציל|דלעת|בטטה/.test(n)) return 'fruits_vegetables';
    if (/בשר|עוף|דג|קציצ|שניצל|טחון|סלמון|טונה|אמנון|נקניק|כבד|פרגית/.test(n))      return 'meat_fish';
    if (/שמן|סוכר|קמח|אורז|פסטה|שוקולד|ריבה|מים|קפה|תה|דבש|חומוס|טחינה|קטשופ|מיונז|מלח|שימורים|שעועית|עדשים/.test(n)) return 'pantry';
    if (/סבון|שמפו|מרכך|נייר|ניקוי|אבקה|ספוג|שקיות/.test(n))                         return 'cleaning';
    return 'other';
  }

  parseWhatsAppText(text) {
    if (!text?.trim()) return [];
    return text
      .split(/[\n,]+/)
      .map(line => line.replace(/^[\s\-\*•✓✗\d.\)]+/, '').trim())
      .filter(line => line.length >= 2)
      .map(line => {
        const afterNum  = line.match(/^(.+?)\s+×?(\d+)\s*$/);
        const beforeNum = line.match(/^×?(\d+)\s+(.+)$/);
        let name, qty;
        if (afterNum)  { name = afterNum[1].trim();  qty = parseInt(afterNum[2],  10); }
        else if (beforeNum) { qty = parseInt(beforeNum[1], 10); name = beforeNum[2].trim(); }
        else           { name = line; qty = 1; }
        name = name.replace(/\s*\(.*\)\s*$/, '').trim();
        if (name.length < 2) return null;
        return { name, quantity: Math.max(1, qty || 1), category: this.guessCategory(name) };
      })
      .filter(Boolean);
  }

  updateImportPreview() {
    const parsed  = this.parseWhatsAppText(this.els.importTextarea.value);
    const preview = this.els.importPreview;
    if (parsed.length === 0) { preview.hidden = true; return; }

    const ICON = Object.fromEntries(CATEGORIES.map(c => [c.id, c.icon]));
    preview.innerHTML = `
      <p class="preview-label">${parsed.length} מוצרים לייבוא:</p>
      <div class="preview-chips">
        ${parsed.map(p => `
          <span class="preview-chip">
            ${ICON[p.category] || '📦'} ${this.escapeHtml(p.name)}${p.quantity > 1 ? ` ×${p.quantity}` : ''}
          </span>`).join('')}
      </div>`;
    preview.hidden = false;
  }

  handleImportFromText() {
    const parsed = this.parseWhatsAppText(this.els.importTextarea.value);
    if (parsed.length === 0) { this.markInvalid(this.els.importTextarea); return; }

    // If no active list, create one
    if (!this.getActiveList()) {
      const list = {
        id: this.createId(), name: 'רשימה מיובאת',
        icon: '📥', createdAt: Date.now(), isArchived: false,
        products: []
      };
      this.workspace.lists.unshift(list);
      this.activeListId = list.id;
      this.currentView = 'list-detail';
    }

    parsed.forEach(({ name, quantity, category }) => {
      const activeList = this.getActiveList();
      if (activeList) {
        activeList.products.unshift(new Product(this.createId(), name, category, quantity));
      }
      this.addToHistory(name);
    });
    this._lastAllBought = false;
    this.saveData();
    this.render();
    this.vibrate([80, 40, 80]);
    this.closeShareModal();
    this.showToast(`✅ יובאו ${parsed.length} מוצרים`);
  }

  // ── QR Camera Scanner (Ch4) ─────────────────────────────────────

  async startQrScan() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.showToast('❌ המצלמה אינה נתמכת בדפדפן זה');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 } }
      });
      this.els.qrVideo.srcObject = stream;
      await this.els.qrVideo.play();
      this._scanStream = stream;
      this._scanActive = true;
      this.els.qrScanWrapper.hidden = false;
      this._tickScan();
    } catch {
      this.showToast('❌ לא ניתן לגשת למצלמה');
    }
  }

  _tickScan() {
    if (!this._scanActive) return;
    const video = this.els.qrVideo;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = this.els.qrCanvas;
      const ctx    = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      /* global jsQR */
      const code = typeof jsQR === 'function'
        ? jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' })
        : null;
      if (code) {
        this.stopQrScan();
        this.handleScannedQR(code.data);
        return;
      }
    }
    setTimeout(() => this._tickScan(), 150);
  }

  stopQrScan() {
    this._scanActive = false;
    if (this._scanStream) {
      this._scanStream.getTracks().forEach(t => t.stop());
      this._scanStream = null;
    }
    if (this.els.qrScanWrapper) this.els.qrScanWrapper.hidden = true;
  }

  handleScannedQR(data) {
    try {
      const url     = new URL(data);
      const encoded = url.searchParams.get('data');
      if (!encoded) throw new Error('no data param');
      const products = this.decodeMagicLink(encoded);
      if (products.length === 0) throw new Error('empty list');
      this._pendingImport = products;
      this.els.incomingCount.textContent = ` — ${products.length} מוצרים`;
      this.els.incomingBanner.hidden = false;
      this.closeShareModal();
      this.vibrate([100, 50, 100]);
    } catch {
      this.showToast('❌ קוד QR לא תקין');
    }
  }

  // ── App Lock (Ch5) ──────────────────────────────────────────────

  async initLock() {
    const enabled = localStorage.getItem('smart_shop_lock_enabled');
    const hash    = localStorage.getItem('smart_shop_pin_hash');

    if (enabled === null) {
      this._lockEnabled = true;
      localStorage.setItem('smart_shop_lock_enabled', 'true');
      this._pinHash = await this.hashPin('1234');
      localStorage.setItem('smart_shop_pin_hash', this._pinHash);
    } else {
      this._lockEnabled = enabled === 'true';
      this._pinHash = hash;
    }

    if (!this._lockEnabled) {
      this.els.lockScreen.hidden = true;
    }

    const isCustom = localStorage.getItem('smart_shop_pin_custom') === 'true';
    if (this.els.lockHint) this.els.lockHint.hidden = isCustom;
  }

  async hashPin(pin) {
    const str = 'smart_shop_' + pin;
    if (crypto?.subtle) {
      const data = new TextEncoder().encode(str);
      const buf  = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return 'f' + Math.abs(h).toString(16).padStart(8, '0');
  }

  handlePinDigit(digit) {
    this.els.lockError.hidden = true;
    if (digit === 'del') {
      this._pinBuffer = this._pinBuffer.slice(0, -1);
      this.updatePinDots();
      return;
    }
    if (this._pinBuffer.length >= 4) return;
    this._pinBuffer += digit;
    this.updatePinDots();
    this.vibrate([15]);

    if (this._pinBuffer.length === 4) this.validatePin();
  }

  updatePinDots() {
    this.els.pinDots.querySelectorAll('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < this._pinBuffer.length);
    });
  }

  async validatePin() {
    const hash = await this.hashPin(this._pinBuffer);
    if (hash === this._pinHash) {
      this.unlockApp();
    } else {
      this.els.lockError.hidden = false;
      this.els.lockInner.classList.add('shake');
      setTimeout(() => this.els.lockInner.classList.remove('shake'), 500);
      this._pinBuffer = '';
      this.updatePinDots();
      this.vibrate([100, 50, 100]);
    }
  }

  unlockApp() {
    this.els.lockScreen.classList.add('lock-unlocking');
    this.vibrate([50]);
    setTimeout(() => {
      this.els.lockScreen.hidden = true;
      this.els.lockScreen.classList.remove('lock-unlocking');
      this._pinBuffer = '';
      this.updatePinDots();
    }, 350);
  }

  handleForgotPin() {
    if (confirm('פעולה זו תמחק את כל הנתונים ותאפס את הקוד ל-1234.\nלהמשיך?')) {
      localStorage.clear();
      window.location.reload();
    }
  }

  // ── OTA + Service Worker (Ch5) ──────────────────────────────────

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('service-worker.js');
      this._swReg = reg;

      if (reg.waiting && navigator.serviceWorker.controller) {
        this.showUpdateBanner();
      }

      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            this.showUpdateBanner();
          }
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn('SW error', err);
    }
  }

  showUpdateBanner() {
    const toast = this.els.updateToast;
    if (!toast) return;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('visible'));
  }

  handleUpdate() {
    if (this._swReg?.waiting) {
      this._swReg.waiting.postMessage('skipWaiting');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => { window.smartShop = new AppManager(); });
