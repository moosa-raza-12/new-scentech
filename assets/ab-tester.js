// Scentech AB Price Tester — frontend script
(function () {
  'use strict';

  const CONFIG = window.AB_TESTER_CONFIG || {};
  const BACKEND = CONFIG.backendUrl || '';
  const VISITOR_KEY = '_ab_visitor_id';

  // ── Visitor ID ────────────────────────────────────────────────────────────

  function getVisitorId() {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }

  // ── Price formatting ──────────────────────────────────────────────────────

  function formatPrice(cents) {
    return (cents / 100).toLocaleString('nl-NL', {
      style: 'currency',
      currency: CONFIG.currency || 'EUR',
    });
  }

  // ── DOM price update (non-destructive text node) ──────────────────────────

  function setPriceTextNode(el, formatted) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.textContent.trim()) nodes.push(n);
    }
    if (nodes.length > 0) {
      nodes[nodes.length - 1].textContent = ' ' + formatted;
    } else {
      el.textContent = formatted;
    }
  }

  // ── Product page price update ─────────────────────────────────────────────

  const PRICE_SELECTORS = [
    '.price-list--lg sale-price',
    'sale-price.text-lg',
    '.price__regular .price-item--regular',
    '.price-item--regular',
    '[data-product-price]',
    '.product__price',
  ];

  function updatePriceInDom(priceInCents) {
    const formatted = formatPrice(priceInCents);
    const updated = new Set();
    PRICE_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (updated.has(el)) return;
        if (el.closest('.cart, .cart-drawer, .kv-cart')) return;
        updated.add(el);
        setPriceTextNode(el, formatted);
      });
    });

    let buttonUpdated = 0;
    document.querySelectorAll('buy-buttons .button span').forEach((span) => {
      if (span.closest('.cart, .cart-drawer, .kv-cart')) return;
      const lastText = Array.from(span.childNodes)
        .reverse()
        .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (lastText) { lastText.textContent = '\u00a0' + formatted; buttonUpdated++; }
    });

    console.log(`[AB] DOM update: ${updated.size} prijs-element(en), ${buttonUpdated} buy-button(s) → ${formatted}`);
  }

  // ── Sections HTML patching ────────────────────────────────────────────────
  // Patch de sections HTML vóórdat de theme het in de DOM injecteert.
  // DOMParser verplaatst root-level <style> naar <head> — die bewaren we.

  function patchSectionsHtml(sections, priceInCents) {
    const formatted = formatPrice(priceInCents);
    const patched = {};
    for (const [key, html] of Object.entries(sections)) {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const salePrices = doc.querySelectorAll('sale-price');
        salePrices.forEach((el) => setPriceTextNode(el, formatted));
        // kv-cart line item prijs (Impact theme cart drawer)
        doc.querySelectorAll('.kv-cart__line-item-price').forEach((el) => {
          el.textContent = formatted;
        });
        let result = '';
        for (const node of doc.head.childNodes) {
          if (node.outerHTML) result += node.outerHTML;
          else if (node.textContent) result += node.textContent;
        }
        result += doc.body.innerHTML;
        patched[key] = result;
      } catch {
        patched[key] = html;
      }
    }
    console.log(`[AB] Sections gepatcht (${Object.keys(patched).join(', ')}) → ${formatted}`);
    return patched;
  }

  // ── Body MutationObserver (vangnet voor alle cart re-renders) ─────────────
  // Werkt ongeacht hoe de theme de cart drawer updatet.

  const CART_CONTEXTS = [
    'cart-drawer', 'cart-drawer-items', '.cart-drawer',
    '.cart-notification', 'cart-notification-drawer',
    '.kv-cart', '.mini-cart', '[data-cart-drawer]',
    'cart-items', '.cart__items',
  ];

  function isInCartContext(el) {
    if (!el.closest) return false;
    for (const sel of CART_CONTEXTS) {
      if (el.closest(sel)) return true;
    }
    return false;
  }

  function startBodyPriceObserver(priceInCents) {
    if (window._abPriceObserver) window._abPriceObserver.disconnect();

    const formatted = formatPrice(priceInCents);

    function patchEl(el) {
      if (el.dataset.abPatched === String(priceInCents)) return;
      setPriceTextNode(el, formatted);
      el.dataset.abPatched = String(priceInCents);
    }

    function patchKvPrice(el) {
      if (el.dataset.abPatched === String(priceInCents)) return;
      el.textContent = formatted;
      el.dataset.abPatched = String(priceInCents);
    }

    function scanNode(root) {
      if (!root.matches) return;
      if (root.matches('sale-price') && isInCartContext(root)) patchEl(root);
      if (root.matches('.kv-cart__line-item-price')) patchKvPrice(root);
      if (root.querySelectorAll) {
        root.querySelectorAll('sale-price').forEach((el) => { if (isInCartContext(el)) patchEl(el); });
        root.querySelectorAll('.kv-cart__line-item-price').forEach(patchKvPrice);
      }
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scanNode(node);
          }
          // Text node in kv-cart prijs span (JS herrender)
          if (node.nodeType === Node.TEXT_NODE && mutation.target?.matches?.('.kv-cart__line-item-price')) {
            patchKvPrice(mutation.target);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window._abPriceObserver = observer;

    // Direct scan van bestaande cart elementen
    document.querySelectorAll('sale-price').forEach((el) => { if (isInCartContext(el)) patchEl(el); });
    document.querySelectorAll('.kv-cart__line-item-price').forEach(patchKvPrice);

    console.log('[AB] Body price observer actief');
  }

  // ── Session storage ───────────────────────────────────────────────────────

  function storeAssignment(productId, testId, variant, price) {
    sessionStorage.setItem(
      `_ab_${productId}`,
      JSON.stringify({ testId, variant, price })
    );
  }

  function getAssignment(productId) {
    try {
      const raw = sessionStorage.getItem(`_ab_${productId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getAnyAssignment() {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('_ab_')) {
        try { return JSON.parse(sessionStorage.getItem(key)); } catch { /* */ }
      }
    }
    return null;
  }

  // ── Fetch assignment van backend ──────────────────────────────────────────

  async function fetchAssignment(productId) {
    const visitorId = getVisitorId();
    const url = `${BACKEND}/api/assign?visitor_id=${encodeURIComponent(visitorId)}&product_id=${encodeURIComponent(productId)}`;
    try {
      const res = await _origFetch.call(window, url, { credentials: 'omit' });
      if (res.status === 204) return null;
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // ── Cart attributes (voor webhook: visitor_id + test_id) ─────────────────

  async function setCartAttributes(visitorId, testId) {
    try {
      await _origFetch.call(window, '/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributes: { _ab_visitor_id: visitorId, _ab_test_id: testId },
        }),
      });
    } catch { /* niet kritiek */ }
  }

  // ── Add-to-cart interceptie (form submit) ─────────────────────────────────

  document.addEventListener('submit', function (e) {
    const form = e.target.closest('form[action="/cart/add"]');
    if (!form) return;

    const productId =
      form.querySelector('[data-product-id]')?.dataset?.productId ||
      form.closest('[data-product-id]')?.dataset?.productId;
    if (!productId) return;

    const assignment = getAssignment(productId);
    if (!assignment) return;

    let igpInput = form.querySelector('[name="properties[_igp]"]');
    if (!igpInput) {
      igpInput = document.createElement('input');
      igpInput.type = 'hidden';
      igpInput.name = 'properties[_igp]';
      form.appendChild(igpInput);
    }
    igpInput.value = String(assignment.price);
    setCartAttributes(getVisitorId(), assignment.testId);
  });

  // ── Fetch interceptie (AJAX cart add/change/update) ───────────────────────

  const _origFetch = window.fetch;

  const CART_MUTATE_ENDPOINTS = ['/cart/add', '/cart/change', '/cart/update'];

  async function patchCartResponse(result, assignment) {
    try {
      const json = await result.clone().json();
      if (json.sections && typeof json.sections === 'object') {
        json.sections = patchSectionsHtml(json.sections, assignment.price);
        return new Response(JSON.stringify(json), {
          status: result.status,
          statusText: result.statusText,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch { /* geen sections */ }
    return result;
  }

  window.fetch = async function (url, options = {}) {
    const urlStr = typeof url === 'string' ? url : url?.url || '';

    const isCartAdd = urlStr.includes('/cart/add');
    const isCartMutate = CART_MUTATE_ENDPOINTS.some((ep) => urlStr.includes(ep));

    if (isCartAdd) {
      const assignment = getAnyAssignment();
      if (assignment) {
        console.log(`[AB] Cart add — injecteer _igp=${assignment.price}`);
        options = injectIgp(options, assignment.price);
        setCartAttributes(getVisitorId(), assignment.testId);
        const result = await _origFetch.call(this, url, options);
        return patchCartResponse(result, assignment);
      } else {
        console.log('[AB] Cart add zonder assignment');
      }
    } else if (isCartMutate) {
      const assignment = getAnyAssignment();
      if (assignment) {
        const result = await _origFetch.call(this, url, options);
        return patchCartResponse(result, assignment);
      }
    }

    return _origFetch.call(this, url, options);
  };

  function injectIgp(options, price) {
    try {
      const body = options.body;
      if (!body) return options;

      if (body instanceof FormData) {
        body.set('properties[_igp]', String(price));
        console.log('[AB] _igp ingezet in FormData');
        return { ...options, body };
      }
      if (typeof body === 'string') {
        const parsed = JSON.parse(body);
        if (parsed.items && Array.isArray(parsed.items)) {
          parsed.items.forEach((item) => {
            item.properties = item.properties || {};
            item.properties['_igp'] = String(price);
          });
          console.log('[AB] _igp ingezet in items[] formaat');
        } else {
          parsed.properties = parsed.properties || {};
          parsed.properties['_igp'] = String(price);
          console.log('[AB] _igp ingezet in root formaat');
        }
        return { ...options, body: JSON.stringify(parsed) };
      }
    } catch (e) {
      console.log('[AB] injectIgp fout:', e.message);
    }
    return options;
  }

  // ── Product pagina init ───────────────────────────────────────────────────

  async function initProductPage() {
    const productId =
      window.ShopifyAnalytics?.meta?.product?.id ||
      document.querySelector('[data-product-id]')?.dataset?.productId ||
      document.querySelector('form[action="/cart/add"] [name="product-id"]')?.value;

    if (!productId) return;

    const fullProductId = String(productId).startsWith('gid://')
      ? productId
      : `gid://shopify/Product/${productId}`;

    console.log('[AB] Product ID:', fullProductId);

    const assignment = await fetchAssignment(fullProductId);
    if (!assignment) {
      console.log('[AB] Geen actieve test voor dit product.');
      return;
    }

    console.log(`[AB] ✓ Variant ${assignment.variant} — prijs: €${(assignment.price / 100).toFixed(2)} (A=€${(assignment.price_a / 100).toFixed(2)}, B=€${(assignment.price_b / 100).toFixed(2)})`);

    storeAssignment(productId, assignment.test_id, assignment.variant, assignment.price);
    document.body.dataset.abVariant = assignment.variant;
    document.body.dataset.abPrice = assignment.price;

    updatePriceInDom(assignment.price);
    setTimeout(() => updatePriceInDom(assignment.price), 500);
    setTimeout(() => updatePriceInDom(assignment.price), 2000);

    // Start body observer: vangt elke cart re-render op
    startBodyPriceObserver(assignment.price);
  }

  // ── Start ─────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductPage);
  } else {
    initProductPage();
  }
})();
