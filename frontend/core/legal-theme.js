/* Управление темой на правовых страницах (/privacy, /terms, /refunds) без inline-скриптов (strict CSP). */
(function () {
  "use strict";
  try {
    var saved = localStorage.getItem("vektor-ege:theme");
    if (saved === "dark" || saved === "light") {
      document.documentElement.dataset.theme = saved;
    }
  } catch (e) {
    /* ignore */
  }

  function bindLegalThemeToggle() {
    var btn = document.getElementById("legal-theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var cur = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      var next = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("vektor-ege:theme", next);
      } catch (e) {
        /* ignore */
      }
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindLegalThemeToggle);
    } else {
      bindLegalThemeToggle();
    }
  }
})();
