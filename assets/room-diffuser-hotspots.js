(function () {
  'use strict';

  const PRELOAD_TIMEOUT_MS = 1200;

  function init(section) {
    const sectionId = section.dataset.sectionId;
    if (!sectionId) return;
    // Modal lives as a SIBLING of the section now (Task 6b moved it out) — find by id
    const modal = document.getElementById('rdh-modal-' + sectionId);
    if (!modal) return;

    const loader = modal.querySelector('[data-rdh-loader]');
    const content = modal.querySelector('[data-rdh-content]');
    const hero = modal.querySelector('[data-rdh-hero]');
    const thumbs = modal.querySelector('[data-rdh-thumbs]');
    const roomContext = modal.querySelector('[data-rdh-room-context]');
    const title = modal.querySelector('[data-rdh-title]');
    const tags = modal.querySelector('[data-rdh-tags]');
    const blurb = modal.querySelector('[data-rdh-blurb]');
    const details = modal.querySelector('[data-rdh-details]');
    const price = modal.querySelector('[data-rdh-price]');
    const ctaPrimary = modal.querySelector('[data-rdh-cta-primary]');
    const ctaSecondary = modal.querySelector('[data-rdh-cta-secondary]');
    const prevBtn = modal.querySelector('[data-rdh-prev]');
    const nextBtn = modal.querySelector('[data-rdh-next]');
    const mediaEl = modal.querySelector('[data-rdh-media]');
    const bodyEl = modal.querySelector('[data-rdh-body]');

    function syncBodyHeightToMedia() {
      if (!mediaEl || !bodyEl) return;
      // Only on desktop where the modal is side-by-side
      if (window.innerWidth < 768) {
        bodyEl.style.height = '';
        bodyEl.style.maxHeight = '';
        return;
      }
      const h = mediaEl.offsetHeight;
      if (h > 0) {
        // Lock body to exact image height — body is a flex column so the inner
        // wrapper centers vertically via auto margins.
        bodyEl.style.height = h + 'px';
        bodyEl.style.maxHeight = h + 'px';
      }
    }

    window.addEventListener('resize', syncBodyHeightToMedia);

    let lastTrigger = null;
    let currentImages = [];
    let currentIndex = 0;

    function showImage(idx) {
      if (!currentImages.length) return;
      if (idx < 0) idx = 0;
      if (idx > currentImages.length - 1) idx = currentImages.length - 1;
      currentIndex = idx;
      hero.src = currentImages[idx];
      const thumbEls = thumbs.querySelectorAll('img');
      thumbEls.forEach((t, i) => {
        if (i === idx) t.dataset.active = 'true';
        else delete t.dataset.active;
      });
      const activeThumb = thumbEls[idx];
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
      if (prevBtn) prevBtn.disabled = idx <= 0;
      if (nextBtn) nextBtn.disabled = idx >= currentImages.length - 1;
    }

    function openModal(trigger) {
      const blockId = trigger.dataset.blockId;
      const dataEl = section.querySelector('#rdh-block-' + blockId);
      if (!dataEl) return;
      let data;
      try { data = JSON.parse(dataEl.textContent); }
      catch (e) { console.error('rdh: invalid JSON', e); return; }

      lastTrigger = trigger;

      // Show modal with loader
      content.hidden = true;
      loader.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('rdh-modal-open');

      // Populate (but content still hidden)
      roomContext.textContent = data.roomContext;
      title.textContent = data.title;
      blurb.innerHTML = data.blurb || '';

      tags.innerHTML = '';
      (data.tags || []).forEach(t => {
        const span = document.createElement('span');
        span.textContent = t;
        tags.appendChild(span);
      });

      details.innerHTML = '';
      (data.details || []).forEach(d => {
        const li = document.createElement('li');
        li.textContent = d;
        details.appendChild(li);
      });

      price.textContent = data.price || '';

      ctaPrimary.textContent = data.primaryCtaText || '';
      ctaPrimary.href = data.primaryCtaLink || '#';
      ctaSecondary.textContent = data.ctaText || '';
      ctaSecondary.href = data.ctaLink || '#';

      // Pre-load images
      const images = data.images || [];
      hero.src = '';
      hero.alt = data.title;
      thumbs.innerHTML = '';

      preloadImages(images).then(() => {
        currentImages = images;
        images.forEach((src, i) => {
          const img = document.createElement('img');
          img.src = src;
          img.alt = '';
          img.loading = 'lazy';
          img.addEventListener('click', () => showImage(i));
          thumbs.appendChild(img);
        });
        showImage(0);
        loader.hidden = true;
        content.hidden = false;
        // After images load + layout settles, lock body height to media height
        requestAnimationFrame(() => requestAnimationFrame(syncBodyHeightToMedia));
        // Trigger staggered reveal
        requestAnimationFrame(() => {
          modal.setAttribute('data-rdh-revealed', 'true');
        });
        const focusable = modal.querySelector('[data-rdh-close]');
        if (focusable) focusable.focus();
      });
    }

    function finalizeClose() {
      modal.removeAttribute('data-rdh-revealed');
      modal.removeAttribute('data-rdh-closing');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('rdh-modal-open');
      if (bodyEl) {
        bodyEl.style.height = '';
        bodyEl.style.maxHeight = '';
      }
      if (lastTrigger) {
        lastTrigger.focus();
        lastTrigger = null;
      }
    }

    function closeModal() {
      // Already closing? ignore double-trigger
      if (modal.getAttribute('data-rdh-closing') === 'true') return;
      // Mobile: play slide-down animation, then finalize
      const isMobile = window.innerWidth < 768;
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const panel = modal.querySelector('.rdh-modal__panel');
      if (isMobile && !prefersReduced && panel) {
        modal.setAttribute('data-rdh-closing', 'true');
        modal.removeAttribute('data-rdh-revealed');
        const onEnd = () => {
          panel.removeEventListener('animationend', onEnd);
          finalizeClose();
        };
        panel.addEventListener('animationend', onEnd);
        // Safety: if animationend doesn't fire, finalize anyway
        setTimeout(() => {
          if (modal.getAttribute('data-rdh-closing') === 'true') {
            panel.removeEventListener('animationend', onEnd);
            finalizeClose();
          }
        }, 400);
      } else {
        finalizeClose();
      }
    }

    function preloadImages(urls) {
      if (!urls.length) return Promise.resolve();
      return new Promise(resolve => {
        let pending = urls.length;
        let resolved = false;
        const finish = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          resolve();
        };
        const done = () => { if (--pending <= 0) finish(); };
        const timer = setTimeout(finish, PRELOAD_TIMEOUT_MS);
        urls.forEach((url, i) => {
          const img = new Image();
          if (i === 0 && 'fetchPriority' in img) img.fetchPriority = 'high';
          img.onload = img.onerror = done;
          img.src = url;
        });
      });
    }

    // Wire up triggers
    section.querySelectorAll('.rdh-hotspot').forEach(btn => {
      btn.addEventListener('click', () => openModal(btn));
    });

    // Arrow navigation
    if (prevBtn) prevBtn.addEventListener('click', () => showImage(currentIndex - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => showImage(currentIndex + 1));

    // Touch swipe navigation on hero
    const heroWrap = modal.querySelector('.rdh-modal__hero-wrap');
    if (heroWrap) {
      let touchStartX = 0;
      let touchStartY = 0;
      heroWrap.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      }, { passive: true });
      heroWrap.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].screenX - touchStartX;
        const dy = e.changedTouches[0].screenY - touchStartY;
        // Horizontal swipe only — ignore if mostly vertical (i.e., scrolling)
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) showImage(currentIndex + 1);
          else showImage(currentIndex - 1);
        }
      }, { passive: true });
    }

    // Keyboard arrow navigation inside modal
    modal.addEventListener('keydown', e => {
      if (modal.getAttribute('aria-hidden') !== 'false') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); showImage(currentIndex - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); showImage(currentIndex + 1); }
    });

    // Close handlers
    modal.querySelectorAll('[data-rdh-close]').forEach(el => {
      el.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
        closeModal();
      }
    });

    // Focus trap (simple)
    modal.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const focusables = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });

    // Compare links → reuse theme's own [data-open-comparison] handler
    const compareBtns = document.querySelectorAll('[data-rdh-compare]');
    const cmpPopup = document.querySelector('[data-comparison-popup]');
    if (compareBtns.length) {
      if (cmpPopup && cmpPopup.id) {
        const target = '#' + cmpPopup.id;
        compareBtns.forEach(btn => btn.setAttribute('data-open-comparison', target));
      } else {
        // No comparison popup on this page — hide the link silently.
        compareBtns.forEach(btn => { btn.hidden = true; });
      }
    }
  }

  function initAll() {
    document.querySelectorAll('.rdh-section[data-section-id]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Re-init on Shopify theme editor section reload
  document.addEventListener('shopify:section:load', e => {
    const section = e.target.querySelector('.rdh-section[data-section-id]');
    if (section) init(section);
  });
})();
