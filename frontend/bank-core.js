/* Банк заданий: сборка из файлов предметов и правки из таблицы.
   Задания лежат в subjects/*.js; поправки, сделанные через таблицу bank/bank.csv,
   лежат в subjects/table.js (EGE.table) и накладываются здесь. Сайт и страница
   tools/bank.html собирают банк одним и тем же кодом, поэтому id заданий везде одинаковые. */
(function () {
  "use strict";
  var EGE = (window.EGE = window.EGE || {});

  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  // Отпечаток вопроса: формулировка, текст к заданию и варианты вместе с верными ответами.
  // Порядок вариантов не важен — перестановка тех же вариантов тоже считается повтором.
  function qSig(q, passage) {
    var w = function (s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); };
    var body;
    if (q.t === "single" || q.t === "multi") { var ok = [].concat(q.a); body = q.o.map(function (o, i) { return w(o) + (ok.indexOf(i) >= 0 ? " *" : ""); }).sort(); }
    else if (q.t === "match") body = q.l.map(function (l, i) { return w(l) + " → " + w(q.r[q.a[i]]); }).sort();
    else if (q.t === "order") body = q.o.map(w);
    else body = [].concat(q.a).map(w).sort();
    return JSON.stringify([q.t, w(q.q), w(passage), body, q.tbl ? JSON.stringify(q.tbl) : "", q.svg ? hash(q.svg) : ""]);
  }

  function load() {
    var SUBJ = EGE.subjects || {}, TOPICS = {}, QS = {}, SKIPPED = [], NOTES = [];
    var tab = EGE.table || {};

    // задания, добавленные через таблицу, встают в конец своей темы
    var topicById = {};
    Object.keys(SUBJ).forEach(function (sid) {
      SUBJ[sid].sections.forEach(function (sec) { sec.topics.forEach(function (t) { topicById[t.id] = t; }); });
    });
    (tab.add || []).forEach(function (a) {
      var t = topicById[a.topic];
      if (!t) { NOTES.push("таблица: нет темы " + a.topic + " — задание «" + String(a.q).slice(0, 40) + "» не добавлено"); return; }
      var q = clone(a); delete q.topic; t.q.push(q);
    });

    Object.keys(SUBJ).forEach(function (sid) {
      var s = SUBJ[sid], seen = {};
      s.topicList = [];
      s.sections.forEach(function (sec) {
        sec.topics.forEach(function (t) {
          t.sid = sid; t.sec = sec; t.qids = [];
          TOPICS[t.id] = t; s.topicList.push(t);
          t.q = t.q.filter(function (q) {
            // Повтор уже загруженного вопроса предмета не добавляем: остаётся первый экземпляр.
            var sig = qSig(q, q.ctx && t.texts ? t.texts[q.ctx] : "");
            if (seen[sig]) { SKIPPED.push(t.id + ": " + q.q.slice(0, 60)); return false; }
            return (seen[sig] = true);
          });
          t.q.forEach(function (q) {
            var id = q.id || t.id + "." + hash(q.t + "|" + q.q);
            // Одинаковые формулировки («Отметь слова…») различаем по вариантам ответа;
            // первый вопрос сохраняет прежний id, чтобы не потерять сохранённый прогресс.
            if (QS[id] && QS[id] !== q) {
              var base = id + "." + hash(JSON.stringify([q.o, q.l, q.r, q.a, q.ctx]));
              id = base;
              for (var k = 2; QS[id]; k++) id = base + "." + k;
            }
            q.id = id;
            q.topic = t.id; q.sid = sid;
            QS[q.id] = q; t.qids.push(q.id);
          });
        });
      });
    });

    // правки и удаления из таблицы действуют по id, поэтому накладываются после присвоения id
    var edit = tab.edit || {};
    Object.keys(edit).forEach(function (id) {
      var q = QS[id];
      if (!q) { NOTES.push("таблица: нет задания " + id + " — правка пропущена"); return; }
      Object.keys(edit[id]).forEach(function (k) {
        if (k === "id" || k === "topic" || k === "sid") return;
        if (edit[id][k] === null) delete q[k]; else q[k] = clone(edit[id][k]);
      });
    });
    (tab.drop || []).forEach(function (id) {
      var q = QS[id];
      if (!q) return;
      var t = TOPICS[q.topic];
      t.q = t.q.filter(function (x) { return x !== q; });
      t.qids = t.qids.filter(function (x) { return x !== id; });
      delete QS[id];
    });

    return { SUBJ: SUBJ, TOPICS: TOPICS, QS: QS, SKIPPED: SKIPPED, NOTES: NOTES };
  }

  EGE.hash = hash;
  EGE.qSig = qSig;
  EGE.loadBank = load;
})();
