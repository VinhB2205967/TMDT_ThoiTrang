/* =============================================================
   CLIENT FX — Modern storefront interactions
   - Theme switcher (light/dark) with persistence + system sync
   - Animated particle/constellation canvas (theme-aware palette)
   - Scroll-reveal for cards / sections / products
   - Button ripple effect
   - Back-to-top button
   - Scroll progress bar
   No external dependencies. Respects prefers-reduced-motion.
   ============================================================= */
(function () {
  "use strict";

  var reduceMotion =
    !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

  var THEME_KEY = "cm-theme";

  /* ----------------------------------------------------------------
     0. Theme switcher
     ---------------------------------------------------------------- */
  function getStoredTheme() {
    try {
      var v = localStorage.getItem(THEME_KEY);
      return v === "dark" || v === "light" ? v : null;
    } catch (e) {
      return null;
    }
  }

  function getSystemTheme() {
    return "dark";
  }

  function applyTheme(theme) {
    var t = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.setAttribute("data-bs-theme", t);

    var toggle = document.getElementById("cmThemeToggle");
    if (toggle) {
      toggle.setAttribute(
        "aria-label",
        t === "dark" ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"
      );
      toggle.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
    }

    // Notify listeners (canvas needs to repaint with new palette)
    try {
      window.dispatchEvent(
        new CustomEvent("cm:theme", { detail: { theme: t } })
      );
    } catch (e) {
      /* noop */
    }
  }

  function setTheme(theme, persist) {
    applyTheme(theme);
    if (persist !== false) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (e) {
        /* noop */
      }
    }
  }

  function initTheme() {
    var stored = getStoredTheme();
    var initial = stored || "dark";
    applyTheme(initial);

    var toggle = document.getElementById("cmThemeToggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var current =
          document.documentElement.getAttribute("data-theme") === "dark"
            ? "dark"
            : "light";
        setTheme(current === "dark" ? "light" : "dark");
      });
    }

    // Client storefront is dark-first. System changes do not override default.
  }

  /* ----------------------------------------------------------------
     1. Canvas constellation background (theme-aware)
     ---------------------------------------------------------------- */
  function initCanvas() {
    if (reduceMotion) return;
    if (document.getElementById("cm-bg-canvas")) return;

    var canvas = document.createElement("canvas");
    canvas.id = "cm-bg-canvas";
    document.body.insertBefore(canvas, document.body.firstChild);

    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0;
    var h = 0;
    var particles = [];
    var mouse = { x: -9999, y: -9999 };
    var palette = [];

    var LIGHT_COLORS = [
      "79, 110, 245",
      "109, 87, 218",
      "139, 92, 246",
      "20, 184, 166",
      "14, 165, 233"
    ];
    var DARK_COLORS = [
      "168, 154, 250",
      "139, 92, 246",
      "34, 211, 238",
      "236, 72, 153",
      "129, 140, 248"
    ];

    function refreshPalette() {
      var theme = document.documentElement.getAttribute("data-theme");
      palette = theme === "dark" ? DARK_COLORS : LIGHT_COLORS;
      for (var i = 0; i < particles.length; i++) {
        particles[i].c = palette[(Math.random() * palette.length) | 0];
      }
    }

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();
    }

    function buildParticles() {
      var area = w * h;
      var count = Math.max(24, Math.min(80, Math.round(area / 26000)));
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.32,
          vy: (Math.random() - 0.5) * 0.32,
          r: Math.random() * 2 + 0.8,
          c: palette[(Math.random() * palette.length) | 0]
        });
      }
    }

    function step() {
      ctx.clearRect(0, 0, w, h);

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];

        var dxm = mouse.x - p.x;
        var dym = mouse.y - p.y;
        var dm2 = dxm * dxm + dym * dym;
        if (dm2 < 26000) {
          p.vx += dxm * 0.000016;
          p.vy += dym * 0.000016;
        }

        p.x += p.vx;
        p.y += p.vy;

        p.vx *= 0.995;
        p.vy *= 0.995;
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + p.c + ", 0.6)";
        ctx.fill();
      }

      for (var a = 0; a < particles.length; a++) {
        for (var b = a + 1; b < particles.length; b++) {
          var p1 = particles[a];
          var p2 = particles[b];
          var dx = p1.x - p2.x;
          var dy = p1.y - p2.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 16000) {
            var alpha = (1 - d2 / 16000) * 0.32;
            ctx.strokeStyle = "rgba(" + p1.c + ", " + alpha + ")";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(step);
    }

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener(
      "mousemove",
      function (e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      },
      { passive: true }
    );
    window.addEventListener(
      "mouseout",
      function () {
        mouse.x = -9999;
        mouse.y = -9999;
      },
      { passive: true }
    );
    window.addEventListener("cm:theme", refreshPalette);

    refreshPalette();
    resize();
    requestAnimationFrame(step);
  }

  /* ----------------------------------------------------------------
     2. Scroll reveal
     ---------------------------------------------------------------- */
  function initReveal() {
    var targets = document.querySelectorAll(
      ".product-card, .card, .section-title, .blog-card, .brand-card, " +
        ".lookbook-card, .voucher-card, .category-card, .home-section, " +
        ".feature-card, .review-card, .order-card"
    );
    if (!targets.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("cm-reveal", "cm-in");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("cm-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.06 }
    );

    targets.forEach(function (el) {
      el.classList.add("cm-reveal");
      var sibs = el.parentElement
        ? Array.prototype.indexOf.call(el.parentElement.children, el)
        : 0;
      var delay = Math.min(sibs, 8) * 55;
      el.style.transitionDelay = delay + "ms";
      io.observe(el);
    });
  }

  /* ----------------------------------------------------------------
     3. Button ripple
     ---------------------------------------------------------------- */
  function initRipple() {
    document.addEventListener(
      "click",
      function (e) {
        var btn = e.target.closest(
          ".btn, .btn-auth, .btn-search, .btn-image-search, .cm-theme-toggle"
        );
        if (!btn) return;
        if (reduceMotion) return;

        var rect = btn.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height);
        var ripple = document.createElement("span");
        ripple.className = "cm-ripple";
        ripple.style.width = ripple.style.height = size + "px";
        ripple.style.left = e.clientX - rect.left - size / 2 + "px";
        ripple.style.top = e.clientY - rect.top - size / 2 + "px";

        var pos = window.getComputedStyle(btn).position;
        if (pos === "static") btn.style.position = "relative";
        if (window.getComputedStyle(btn).overflow !== "hidden") {
          btn.style.overflow = "hidden";
        }
        btn.appendChild(ripple);
        setTimeout(function () {
          if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
        }, 650);
      },
      { passive: true }
    );
  }

  /* ----------------------------------------------------------------
     4. Back-to-top button
     ---------------------------------------------------------------- */
  function initBackToTop() {
    if (document.querySelector(".cm-to-top")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cm-to-top";
    btn.setAttribute("aria-label", "Lên đầu trang");
    btn.title = "Lên đầu trang";
    btn.innerHTML = '<i class="bi bi-arrow-up"></i>';
    document.body.appendChild(btn);

    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });

    var ticking = false;
    function update() {
      ticking = false;
      if (window.scrollY > 480) btn.classList.add("cm-show");
      else btn.classList.remove("cm-show");
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    update();
  }

  /* ----------------------------------------------------------------
     5. Scroll progress bar
     ---------------------------------------------------------------- */
  function initProgress() {
    if (document.querySelector(".cm-progress")) return;
    var bar = document.createElement("div");
    bar.className = "cm-progress";
    document.body.appendChild(bar);

    var ticking = false;
    function update() {
      ticking = false;
      var doc = document.documentElement;
      var scrollable = doc.scrollHeight - doc.clientHeight;
      var pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      bar.style.width = pct + "%";
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    update();
  }

  /* ----------------------------------------------------------------
     boot
     ---------------------------------------------------------------- */
  function boot() {
    initTheme();
    initCanvas();
    initReveal();
    initRipple();
    initBackToTop();
    initProgress();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Expose minimal API for debugging / manual control
  window.CMTheme = {
    set: setTheme,
    get: function () {
      return document.documentElement.getAttribute("data-theme") || "light";
    }
  };
})();
