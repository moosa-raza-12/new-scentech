(function () {
  'use strict';

  function observeSection(section) {
    if (section.dataset.gsObserved === '1') return;
    section.dataset.gsObserved = '1';

    if (!('IntersectionObserver' in window)) {
      section.classList.add('is-visible');
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });

    observer.observe(section);
  }

  function boot() {
    document.querySelectorAll('.gs-section[data-section-id]').forEach(observeSection);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', function (e) {
    var section = e.target.querySelector('.gs-section[data-section-id]');
    if (section) {
      delete section.dataset.gsObserved;
      observeSection(section);
    }
  });
})();
