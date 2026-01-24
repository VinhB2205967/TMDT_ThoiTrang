/**
 * FilterAutoSubmit - shared helper for admin filters
 * - Auto submit on select change
 * - Optional debounce submit on text/number/date inputs
 * - Optional submit on Enter for keyword
 */

(function () {
  function chongDoi(fn, wait) {
    let boHenGio;
    return function () {
      clearTimeout(boHenGio);
      const thamSo = arguments;
      const nguCanh = this;
      boHenGio = setTimeout(function () {
        fn.apply(nguCanh, thamSo);
      }, wait);
    };
  }

  function layForm(formOrSelector) {
    if (!formOrSelector) return null;
    if (typeof formOrSelector === 'string') return document.querySelector(formOrSelector);
    return formOrSelector;
  }

  function gan(formOrSelector, options) {
    const form = layForm(formOrSelector);
    if (!form) return;

    const tuyChon = Object.assign(
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

    const guiForm = function () {
      // ensure page resets to 1 when filters change
      if (tuyChon.resetPageParam) {
        const pageInput = form.querySelector('input[name="page"]');
        if (pageInput) pageInput.value = '';
      }
      form.submit();
    };

    // Selects submit immediately
    const danhSachSelect = Array.from(form.querySelectorAll(tuyChon.selectSelector || 'select'));
    for (const sel of danhSachSelect) {
      sel.addEventListener('change', guiForm);
    }

    // Keyword
    const oTuKhoa = tuyChon.keywordSelector ? form.querySelector(tuyChon.keywordSelector) : null;
    if (oTuKhoa) {
      if (tuyChon.keywordSubmitOnEnter) {
        oTuKhoa.addEventListener('keypress', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            guiForm();
          }
        });
      }
      if (tuyChon.keywordDebounceMs && Number(tuyChon.keywordDebounceMs) > 0) {
        oTuKhoa.addEventListener('input', chongDoi(guiForm, Number(tuyChon.keywordDebounceMs)));
      }
    }

    // Extra inputs (price/date/etc)
    const boChonThem = Array.isArray(tuyChon.inputSelectors) ? tuyChon.inputSelectors : [];
    if (boChonThem.length) {
      const danhSachInput = Array.from(form.querySelectorAll(boChonThem.join(',')));
      const choTre = chongDoi(guiForm, Number(tuyChon.inputDebounceMs) || 800);
      for (const el of danhSachInput) {
        el.addEventListener('input', choTre);
        el.addEventListener('change', guiForm);
      }
    }
  }

  function ganKhiSanSang(formOrSelector, options) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        gan(formOrSelector, options);
      });
      return;
    }
    gan(formOrSelector, options);
  }

  window.FilterAutoSubmit = {
    attach: gan,
    attachOnReady: ganKhiSanSang
  };
})();
