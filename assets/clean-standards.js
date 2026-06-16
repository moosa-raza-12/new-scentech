(function () {
  'use strict';

  let openCount = 0; // tracks how many modals are open across all instances
  let savedScrollY = 0;

  function lockBodyScroll() {
    if (openCount === 0) {
      savedScrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = '-' + savedScrollY + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.classList.add('cs-modal-open');
    }
    openCount += 1;
  }

  function unlockBodyScroll() {
    openCount -= 1;
    if (openCount <= 0) {
      openCount = 0;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.classList.remove('cs-modal-open');
      window.scrollTo(0, savedScrollY);
    }
  }

  function trapFocus(modal, event) {
    if (event.key !== 'Tab') return;
    const focusables = modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function init(section) {
    const sectionId = section.dataset.sectionId;
    if (!sectionId) return;
    const modal = document.getElementById('cs-modal-' + sectionId);
    if (!modal) return;

    const trigger = section.querySelector('[data-cs-open="' + sectionId + '"]');
    const closeEls = modal.querySelectorAll('[data-cs-close]');
    const closeBtn = modal.querySelector('.cs-modal__close');

    let lastTrigger = null;
    let keyHandler = null;

    function open() {
      if (modal.classList.contains('is-open')) return;
      lastTrigger = document.activeElement;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      lockBodyScroll();
      // move focus into modal
      window.requestAnimationFrame(function () {
        if (closeBtn) closeBtn.focus();
      });
      keyHandler = function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        } else {
          trapFocus(modal, e);
        }
      };
      document.addEventListener('keydown', keyHandler);
    }

    function finalizeClose() {
      modal.classList.remove('is-open');
      modal.removeAttribute('data-cs-closing');
      modal.setAttribute('aria-hidden', 'true');
      unlockBodyScroll();
      if (keyHandler) {
        document.removeEventListener('keydown', keyHandler);
        keyHandler = null;
      }
      if (lastTrigger && typeof lastTrigger.focus === 'function') {
        lastTrigger.focus();
      }
    }

    function close() {
      if (!modal.classList.contains('is-open')) return;
      if (modal.getAttribute('data-cs-closing') === 'true') return;
      var isMobile = window.innerWidth < 768;
      var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var panel = modal.querySelector('.cs-modal__panel');
      if (isMobile && !prefersReduced && panel) {
        modal.setAttribute('data-cs-closing', 'true');
        var onEnd = function () {
          panel.removeEventListener('animationend', onEnd);
          finalizeClose();
        };
        panel.addEventListener('animationend', onEnd);
        // Safety: if animationend doesn't fire, finalize anyway
        setTimeout(function () {
          if (modal.getAttribute('data-cs-closing') === 'true') {
            panel.removeEventListener('animationend', onEnd);
            finalizeClose();
          }
        }, 400);
      } else {
        finalizeClose();
      }
    }

    if (trigger) trigger.addEventListener('click', open);
    closeEls.forEach(function (el) { el.addEventListener('click', close); });
  }

  function boot() {
    document.querySelectorAll('.cs-section[data-section-id]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Re-init when Shopify theme editor re-renders the section
  document.addEventListener('shopify:section:load', function (e) {
    const section = e.target.querySelector('.cs-section[data-section-id]');
    if (section) init(section);
  });
})();
