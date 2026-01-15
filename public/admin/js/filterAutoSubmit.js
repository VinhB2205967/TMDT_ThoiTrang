/**
 * FilterAutoSubmit - shared helper for admin filters
 * - Auto submit on select change
 * - Optional debounce submit on text/number/date inputs
 * - Optional submit on Enter for keyword
 */

(function () {
  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments;
      const ctx = this;
      t = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait);
    };
  }

  function resolveForm(formOrSelector) {
    if (!formOrSelector) return null;
    if (typeof formOrSelector === 'string') return document.querySelector(formOrSelector);
    return formOrSelector;
  }

  function attach(formOrSelector, options) {
    const form = resolveForm(formOrSelector);
    if (!form) return;

    const opts = Object.assign(
      {
        selectSelector: 'select',
        keywordSelector: 'input[name="keyword"]',
        keywordSubmitOnEnter: true,
        keywordDebounceMs: 0,
        inputSelectors: [],
        inputDebounceMs: 800,
        resetPageParam: true
      },
      options || {}
    );

    const submit = function () {
      // ensure page resets to 1 when filters change
      if (opts.resetPageParam) {
        const pageInput = form.querySelector('input[name="page"]');
        if (pageInput) pageInput.value = '';
      }
      form.submit();
    };

    // Selects submit immediately
    const selects = Array.from(form.querySelectorAll(opts.selectSelector || 'select'));
    for (const sel of selects) {
      sel.addEventListener('change', submit);
    }

    // Keyword
    const keywordInput = opts.keywordSelector ? form.querySelector(opts.keywordSelector) : null;
    if (keywordInput) {
      if (opts.keywordSubmitOnEnter) {
        keywordInput.addEventListener('keypress', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        });
      }
      if (opts.keywordDebounceMs && Number(opts.keywordDebounceMs) > 0) {
        keywordInput.addEventListener('input', debounce(submit, Number(opts.keywordDebounceMs)));
      }
    }

    // Extra inputs (price/date/etc)
    const extraSelectors = Array.isArray(opts.inputSelectors) ? opts.inputSelectors : [];
    if (extraSelectors.length) {
      const extraInputs = Array.from(form.querySelectorAll(extraSelectors.join(',')));
      const debounced = debounce(submit, Number(opts.inputDebounceMs) || 800);
      for (const el of extraInputs) {
        el.addEventListener('input', debounced);
        el.addEventListener('change', submit);
      }
    }
  }

  function attachOnReady(formOrSelector, options) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        attach(formOrSelector, options);
      });
      return;
    }
    attach(formOrSelector, options);
  }

  window.FilterAutoSubmit = {
    attach,
    attachOnReady
  };
})();
