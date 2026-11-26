/* Инициализация window.EGE_HOST из JSON-тега #ege-host-config без inline-скриптов (strict CSP). */
(function () {
  "use strict";
  if (typeof document === "undefined") return;
  var el = document.getElementById("ege-host-config");
  if (!el) return;
  try {
    var parsed = JSON.parse(el.textContent || "{}");
    if (parsed && typeof parsed === "object") {
      window.EGE_HOST = Object.assign({}, window.EGE_HOST || {}, parsed);
    }
  } catch (e) {
    /* игнорируем повреждённый JSON конфигурации хоста */
  }
})();
