/* =============================================================
   ADMIN FX — Futuristic interactions for the admin UI
   - Light / Dark theme toggle (persisted)
   - Animated particle/constellation canvas background
   - Scroll-reveal for cards/sections
   - Active sidebar nav highlight
   - Button ripple effect
   - Animated stat counters
   No external dependencies. Respects prefers-reduced-motion.
   ============================================================= */
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------------
     0. Theme (dark / light)
     ---------------------------------------------------------------- */
  var THEME_KEY = "am-admin-theme";

  function getStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }

  function systemPrefersDark() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      /* ignore */
    }
    var icon = document.querySelector(".am-theme-toggle i");
    if (icon) {
      icon.className =
        theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
    }
  }

  // apply stored/system theme as early as possible
  (function bootstrapTheme() {
    var stored = getStoredTheme();
    var theme = stored || (systemPrefersDark() ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  })();

  function initThemeToggle() {
    if (document.querySelector(".am-theme-toggle")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "am-theme-toggle";
    btn.setAttribute("aria-label", "Đổi giao diện sáng/tối");
    btn.title = "Đổi giao diện sáng/tối";
    btn.innerHTML =
      '<i class="bi ' +
      (currentTheme() === "dark" ? "bi-sun-fill" : "bi-moon-stars-fill") +
      '"></i>';
    btn.addEventListener("click", function () {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
    document.body.appendChild(btn);
  }


  /* ----------------------------------------------------------------
     1. Canvas constellation background (theme-aware)
     ---------------------------------------------------------------- */
  function initCanvas() {
    if (reduceMotion) return;
    if (document.getElementById("am-bg-canvas")) return;

    var canvas = document.createElement("canvas");
    canvas.id = "am-bg-canvas";
    document.body.insertBefore(canvas, document.body.firstChild);

    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0;
    var h = 0;
    var particles = [];
    var mouse = { x: -9999, y: -9999 };

    // harmonious cool palette (indigo / violet / teal / sky)
    var COLORS = [
      "91, 110, 245",
      "124, 92, 240",
      "20, 184, 166",
      "14, 165, 233",
      "139, 150, 245",
    ];

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
      var count = Math.max(28, Math.min(90, Math.round(area / 22000)));
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          r: Math.random() * 2.2 + 0.8,
          c: COLORS[(Math.random() * COLORS.length) | 0],
        });
      }
    }

    function step() {
      ctx.clearRect(0, 0, w, h);
      var dark = currentTheme() === "dark";
      var dotAlpha = dark ? 0.8 : 0.55;
      var lineBase = dark ? 0.45 : 0.3;

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];

        var dxm = mouse.x - p.x;
        var dym = mouse.y - p.y;
        var dm2 = dxm * dxm + dym * dym;
        if (dm2 < 26000) {
          p.vx += dxm * 0.000018;
          p.vy += dym * 0.000018;
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
        ctx.fillStyle = "rgba(" + p.c + ", " + dotAlpha + ")";
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
            var alpha = (1 - d2 / 16000) * lineBase;
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

    resize();
    requestAnimationFrame(step);
  }

  /* ----------------------------------------------------------------
     2. Scroll reveal
     ---------------------------------------------------------------- */
  function initReveal() {
    var targets = document.querySelectorAll(
      ".stat-card, .dashboard-card, .card, .table-responsive, .page-header-section"
    );
    if (!targets.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("am-reveal", "am-in");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("am-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );

    targets.forEach(function (el) {
      el.classList.add("am-reveal");
      var sibs = el.parentElement
        ? Array.prototype.indexOf.call(el.parentElement.children, el)
        : 0;
      var delay = Math.min(sibs, 8) * 60;
      el.style.transitionDelay = delay + "ms";
      io.observe(el);
    });
  }

  /* ----------------------------------------------------------------
     3. Active sidebar nav highlight
     ---------------------------------------------------------------- */
  function initActiveNav() {
    var links = document.querySelectorAll(".sider .inner-menu a[href]");
    if (!links.length) return;
    var path = window.location.pathname.replace(/\/+$/, "");

    var best = null;
    var bestLen = -1;
    links.forEach(function (a) {
      var href = a.getAttribute("href") || "";
      try {
        var url = new URL(href, window.location.origin);
        var p = url.pathname.replace(/\/+$/, "");
        if (!p) return;
        if (path === p || path.indexOf(p + "/") === 0) {
          if (p.length > bestLen) {
            bestLen = p.length;
            best = a;
          }
        }
      } catch (e) {
        /* ignore */
      }
    });

    if (best) best.classList.add("is-active");
  }

  /* ----------------------------------------------------------------
     4. Button ripple
     ---------------------------------------------------------------- */
  function initRipple() {
    document.addEventListener(
      "click",
      function (e) {
        var btn = e.target.closest(".btn, .sider-menu-btn, .sider-logout-btn");
        if (!btn) return;
        if (reduceMotion) return;

        var rect = btn.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height);
        var ripple = document.createElement("span");
        ripple.className = "am-ripple";
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
     5. Animated stat counters
     ---------------------------------------------------------------- */
  function initCounters() {
    var values = document.querySelectorAll(".stat-content .stat-value");
    if (!values.length) return;

    function parse(text) {
      var m = text.match(/[\d.,]+/);
      if (!m) return null;
      var numStr = m[0].replace(/\./g, "").replace(/,/g, ".");
      var num = parseFloat(numStr);
      if (isNaN(num)) return null;
      return {
        num: num,
        prefix: text.slice(0, m.index),
        suffix: text.slice(m.index + m[0].length),
        decimals:
          (m[0].split(/[.,]/)[1] || "").length > 0 && /\d,\d/.test(text)
            ? 2
            : 0,
      };
    }

    function format(n, decimals) {
      return n.toLocaleString("vi-VN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }

    function animate(el) {
      var info = parse(el.textContent.trim());
      if (!info || info.num === 0) return;
      var start = null;
      var dur = 1100;
      var from = 0;

      function tick(ts) {
        if (start === null) start = ts;
        var prog = Math.min((ts - start) / dur, 1);
        var eased = 1 - Math.pow(1 - prog, 3);
        var cur = from + (info.num - from) * eased;
        el.textContent = info.prefix + format(cur, info.decimals) + info.suffix;
        if (prog < 1) requestAnimationFrame(tick);
        else
          el.textContent =
            info.prefix + format(info.num, info.decimals) + info.suffix;
      }
      requestAnimationFrame(tick);
    }

    if (reduceMotion || !("IntersectionObserver" in window)) return;

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animate(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    values.forEach(function (el) {
      io.observe(el);
    });
  }

  /* ----------------------------------------------------------------
     boot
     ---------------------------------------------------------------- */
  function boot() {
    initThemeToggle();
    initCanvas();
    initReveal();
    initActiveNav();
    initRipple();
    initCounters();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
