/* Биология: формат экзамена.
   1) Старым заданиям, подходящим по форме, присваивается метка kim (номер задания КИМ ЕГЭ-2027).
   2) Пробный вариант части 1: по одному заданию на каждый номер 1–21 (35 баллов).
   Баллы по спецификации ФИПИ: задания 1, 3, 4, 5, 9, 13, 21 — по 1 баллу, остальные — по 2 (1 балл за одну ошибку).
   Часть 2 (задания 22–28, 22 балла) тренируется в разделе «Часть 2». */
(function () {
  var s = window.EGE && window.EGE.subjects && window.EGE.subjects.bio;
  if (!s) return;

  // ---------- Метка kim для заданий, написанных раньше ----------
  function kimOf(tid, q) {
    var block = tid.charAt(1), six = q.t === "multi" && q.o.length === 6 && q.a.length === 3;
    if (block === "1") return six ? 2 : 0;
    if (block === "2" || block === "3") return q.t === "match" && q.l.length >= 4 ? 6 : six ? 7 : q.t === "order" ? 8 : 0;
    if (block === "4") return q.t === "match" && q.l.length >= 4 ? 10 : six ? 11 : q.t === "order" && /таксон|систематическ|подчинен/i.test(q.q) ? 12 : 0;
    if (block === "5") return q.t === "match" && q.l.length >= 4 ? 14 : six ? 15 : q.t === "order" ? 16 : 0;
    if (block === "6") return six ? 17 : q.t === "match" && q.l.length >= 4 ? 19 : 0;
    if (block === "7") return six ? 18 : q.t === "match" && q.l.length >= 4 ? 19 : 0;
    return 0;
  }
  s.sections.forEach(function (sec) {
    sec.topics.forEach(function (t) {
      if (!/^b[1-7]-/.test(t.id)) return;
      t.q.forEach(function (q) { if (!q.kim) { var k = kimOf(t.id, q); if (k) q.kim = k; } });
    });
  });

  // ---------- Шкала ЕГЭ-2026: первичный балл → тестовый (индекс — первичный балл) ----------
  var SCALE = [0, 3, 5, 7, 10, 12, 14, 17, 19, 21, 24, 26, 28, 31, 33, 36, 38, 40, 41, 43, 45, 46, 48, 50, 51, 53, 55, 56, 58, 60, 61, 63, 65, 66, 68, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 83, 85, 86, 88, 90, 91, 93, 95, 96, 98, 100];

  // в заданиях 2, 5, 9 и 13 первыми берутся задания КИМ-эксперимент / с рисунком
  function withFigure(q) { return !!q.svg; }
  function withEge(q) { return !!q.ege; }
  var slots = [];
  for (var n = 1; n <= 21; n++) slots.push(n === 2 ? { n: n, kim: n, prefer: withEge } : n === 5 || n === 9 || n === 13 ? { n: n, kim: n, prefer: withFigure } : { n: n, kim: n });

  s.variant = {
    title: "Пробный вариант · часть 1",
    label: "Пробный вариант ЕГЭ · часть 1",
    sub: "Задания 1–21 подряд, 35 баллов, как в части 1 экзамена; ответы — в конце. Рисунки заменены описанием схемы",
    two: [2, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20],
    goal: {
      need: 51, total: 57, test: 90, rest: 22, time: "3 ч 55 мин", partName: "Часть 1", split: "часть 1 — 35, часть 2 — 22", scale: SCALE,
      ok: function (need) { return "С таким результатом часть 2 должна принести " + need + " из 22."; },
      fail: function (sum) { return "Даже с максимумом во второй части (22) сумма будет " + sum + " — разбери ошибки ниже и повтори эти номера."; },
      extra: function (pts) { var need = Math.max(0, 45 - pts); return "Для 80+ нужно 45 первичных баллов: " + (need > 22 ? "с такой первой частью до 80 не хватит даже полной второй части." : need ? "при такой первой части вторая должна дать " + need + " из 22." : "первая часть уже даёт этот порог."); }
    },
    slots: slots
  };
})();
