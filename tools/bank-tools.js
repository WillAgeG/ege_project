/* Таблица заданий: выгрузка банка в CSV (Excel), разбор правок из таблицы и проверка заданий.
   Работает на странице tools/bank.html; на сайт не попадает. */
(function () {
  "use strict";
  var EGE = window.EGE;
  var hash = EGE.hash;

  // ---------- колонки ----------
  var COLS = ["id", "Предмет", "Тема", "Название темы", "КИМ", "Тип", "Вопрос", "Варианты", "Правая колонка", "Ответ", "Пояснение", "Эталон", "Таблица", "Рисунок", "Параметры"];
  var READONLY = { "Предмет": 1, "Название темы": 1, "id": 1 };
  var TYPE_RU = { single: "один ответ", multi: "несколько ответов", match: "соответствие", order: "порядок", input: "ввод ответа", self: "развёрнутый ответ" };
  var TYPE_BY_RU = {};
  Object.keys(TYPE_RU).forEach(function (k) { TYPE_BY_RU[w(TYPE_RU[k])] = k; TYPE_BY_RU[k] = k; });
  var FLAGS = ["fixed", "open", "d", "x", "ege", "num"];
  // поля задания, которые умеет таблица; остальные (id, topic, sid) служебные
  var CONTENT = ["t", "q", "o", "a", "e", "kim", "l", "r", "tbl", "num", "tol", "fixed", "open", "d", "x", "ege", "ctx", "els", "ref", "svg"];
  var SERVICE = { id: 1, topic: 1, sid: 1 };

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function nl(s) { return String(s == null ? "" : s).replace(/\r\n?/g, "\n"); }
  function lines(s) { return nl(s).split("\n").map(function (x) { return x.trim(); }).filter(function (x) { return x.length; }); }
  function ints(s) { return nl(s).split(/[\s,;]+/).filter(Boolean); }
  function w(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase().replace(/ё/g, "е"); }
  function isNum(s) { return /^[+\-−]?\d+(?:[.,]\d+)?$/.test(String(s).trim()); }
  function toNum(s) { return parseFloat(String(s).trim().replace(",", ".").replace("−", "-")); }
  function fmtAns(x) { return String(x).replace(".", ","); }

  // ---------- CSV ----------
  function csvStringify(rows, cols) {
    var out = [cols.join(";")];
    rows.forEach(function (r) {
      out.push(cols.map(function (c) {
        var v = String(r[c] == null ? "" : r[c]);
        return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(";"));
    });
    return "﻿" + out.join("\r\n") + "\r\n";
  }
  function csvParse(text) {
    text = String(text).replace(/^﻿/, "");
    // разделитель берём из первой строки: Excel в русской локали ставит «;», в английской «,»
    var head = text.split(/\r?\n/)[0], best = ";", cnt = -1;
    [";", ",", "\t"].forEach(function (d) { var n = head.split(d).length; if (n > cnt) { cnt = n; best = d; } });
    var rows = [], row = [], cell = "", q = false, i = 0, n = text.length;
    for (; i < n; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === "") q = true;
      else if (ch === best) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; rows.push(row); row = []; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return { cols: [], rows: [] };
    var cols = rows[0].map(function (c) { return c.trim(); });
    var recs = rows.slice(1).filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); }).map(function (r) {
      var o = {}; cols.forEach(function (c, k) { o[c] = r[k] == null ? "" : r[k]; }); return o;
    });
    return { cols: cols, rows: recs };
  }

  // ---------- задание ↔ строка таблицы ----------
  function toRow(q, t) {
    var r = {};
    COLS.forEach(function (c) { r[c] = ""; });
    r.id = q.id; r["Предмет"] = q.sid; r["Тема"] = q.topic; r["Название темы"] = t ? t.title : "";
    r["КИМ"] = q.kim == null ? "" : [].concat(q.kim).join(" ");
    r["Тип"] = TYPE_RU[q.t] || q.t;
    r["Вопрос"] = q.q;
    if (q.t === "single") { r["Варианты"] = q.o.join("\n"); r["Ответ"] = String(q.a + 1); }
    else if (q.t === "multi") { r["Варианты"] = q.o.join("\n"); r["Ответ"] = q.a.map(function (i) { return i + 1; }).join(" "); }
    else if (q.t === "match") { r["Варианты"] = q.l.join("\n"); r["Правая колонка"] = q.r.join("\n"); r["Ответ"] = q.a.map(function (i) { return i + 1; }).join(" "); }
    else if (q.t === "order") r["Варианты"] = q.o.join("\n");
    else if (q.t === "input") r["Ответ"] = q.a.map(function (x) { return q.num ? fmtAns(x) : String(x); }).join("\n");
    else if (q.t === "self") { r["Варианты"] = q.els.join("\n"); r["Эталон"] = q.ref; }
    r["Пояснение"] = q.e || "";
    if (q.tbl) r["Таблица"] = q.tbl.map(function (row) { return row.join(" | "); }).join("\n");
    if (q.svg) r["Рисунок"] = "svg:" + hash(q.svg);
    var p = [];
    FLAGS.forEach(function (f) { if (q[f]) p.push(f); });
    if (q.tol !== undefined) p.push("tol=" + fmtAns(q.tol));
    if (q.ctx) p.push("ctx=" + q.ctx);
    r["Параметры"] = p.join(" ");
    return r;
  }

  // Разбор строки в задание. orig — текущее задание с тем же id (нужно для рисунка).
  function fromRow(row, orig) {
    var err = [], q = {}, c = function (n) { return nl(row[n]); };
    var type = TYPE_BY_RU[w(c("Тип"))];
    if (!type) { err.push("неизвестный тип «" + c("Тип") + "»"); return { q: null, err: err, del: false }; }
    q.t = type;
    var kim = c("КИМ").trim();
    if (kim) { var kk = ints(kim); if (kk.length !== 1 || !/^\d+$/.test(kk[0])) err.push("КИМ — одно целое число"); else q.kim = parseInt(kk[0], 10); }
    q.q = c("Вопрос").trim();
    var opts = lines(c("Варианты")), ans = ints(c("Ответ"));
    var par = { flags: {}, tol: undefined, ctx: undefined, del: false };
    nl(c("Параметры")).split(/\s+/).filter(Boolean).forEach(function (tok) {
      var m, low = tok.toLowerCase();
      if (FLAGS.indexOf(low) >= 0) par.flags[low] = true;
      else if (low === "удалить") par.del = true;
      else if ((m = /^tol=(.+)$/i.exec(tok))) { if (isNum(m[1])) par.tol = toNum(m[1]); else err.push("tol — число"); }
      else if ((m = /^ctx=(.+)$/i.exec(tok))) par.ctx = m[1];
      else err.push("неизвестный параметр «" + tok + "»");
    });
    var idx = function (s, max) {
      if (!/^\d+$/.test(s)) { err.push("в ответе должны быть номера, а там «" + s + "»"); return null; }
      var v = parseInt(s, 10);
      if (v < 1 || v > max) { err.push("номер ответа " + v + " вне диапазона 1–" + max); return null; }
      return v - 1;
    };
    if (type === "single") {
      q.o = opts;
      if (ans.length !== 1) err.push("для «один ответ» нужен один номер"); else { var v1 = idx(ans[0], opts.length); if (v1 !== null) q.a = v1; }
    } else if (type === "multi") {
      q.o = opts; q.a = ans.map(function (s) { return idx(s, opts.length); }).filter(function (x) { return x !== null; });
    } else if (type === "match") {
      q.l = opts; q.r = lines(c("Правая колонка"));
      q.a = ans.map(function (s) { return idx(s, q.r.length); }).filter(function (x) { return x !== null; });
    } else if (type === "order") {
      q.o = opts;
    } else if (type === "input") {
      var isn = !!par.flags.num;
      q.a = lines(c("Ответ")).map(function (s) { return isn && isNum(s) ? toNum(s) : s; });
    } else if (type === "self") {
      q.els = opts; q.ref = c("Эталон").trim();
    }
    var e = c("Пояснение").trim(); if (e) q.e = e;
    var tb = c("Таблица");
    if (tb.trim()) q.tbl = lines(tb).map(function (l) { return l.split("|").map(function (x) { return x.trim(); }); });
    var fig = c("Рисунок").trim();
    if (fig) {
      if (orig && orig.svg && fig === "svg:" + hash(orig.svg)) q.svg = orig.svg;
      else err.push("рисунок через таблицу добавить нельзя (его можно только оставить или стереть ячейку)");
    }
    Object.keys(par.flags).forEach(function (f) { q[f] = true; });
    if (par.tol !== undefined) q.tol = par.tol;
    if (par.ctx) q.ctx = par.ctx;
    return { q: q, err: err, del: par.del };
  }

  // Приводим задание к виду для сравнения: только поля таблицы, ответы-«ввод» как строки.
  function canon(q) {
    var o = {};
    CONTENT.forEach(function (k) {
      if (q[k] === undefined) return;
      o[k] = (q.t === "input" && k === "a") ? q.a.map(function (x) { return String(x); }) : q[k];
    });
    return o;
  }
  function sameQ(a, b) { return JSON.stringify(canon(a)) === JSON.stringify(canon(b)); }
  function diffFields(cur, nq) {
    var set = {}, a = canon(cur), b = canon(nq), n = 0;
    CONTENT.forEach(function (k) {
      if (JSON.stringify(a[k]) === JSON.stringify(b[k])) return;
      if (a[k] === undefined && b[k] === undefined) return;
      set[k] = b[k] === undefined ? null : (k === "a" && nq.t === "input" ? nq.a : b[k]); n++;
    });
    return n ? set : null;
  }

  // Excel любит «улучшать» ячейки: +2 → 2, 0,50 → 0,5. Такие правки правкой не считаем.
  function cellNorm(col, s) {
    s = nl(s).split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
    if (col === "Ответ" || col === "КИМ") s = s.map(function (x) { return x.split(/\s+/).map(function (t) { return isNum(t) ? String(toNum(t)) : t; }).join(" "); });
    return s.join("\n");
  }
  var EDITABLE = COLS.filter(function (c) { return !READONLY[c]; });
  function sameRow(a, b) { return EDITABLE.every(function (c) { return cellNorm(c, a[c]) === cellNorm(c, b[c]); }); }

  // ---------- проверка одного задания ----------
  var NUMW = { "одно": 1, "один": 1, "одну": 1, "два": 2, "две": 2, "три": 3, "четыре": 4, "пять": 5, "шесть": 6 };
  function checkQuestion(q, t) {
    var out = [], er = function (m) { out.push({ lv: "error", msg: m }); }, wn = function (m) { out.push({ lv: "warn", msg: m }); };
    var str = function (s) { return typeof s === "string" && s.trim() !== ""; };
    if (!TYPE_RU[q.t]) { er("неизвестный тип «" + q.t + "»"); return out; }
    if (!str(q.q)) er("пустая формулировка");
    Object.keys(q).forEach(function (k) { if (CONTENT.indexOf(k) < 0 && !SERVICE[k]) wn("поле «" + k + "» таблица не поддерживает"); });
    var texts = [["вопрос", q.q], ["пояснение", q.e], ["эталон", q.ref]].concat((q.o || []).map(function (x, i) { return ["вариант " + (i + 1), x]; }), (q.l || []).map(function (x, i) { return ["строка " + (i + 1), x]; }), (q.r || []).map(function (x, i) { return ["правая " + (i + 1), x]; }));
    texts.forEach(function (p) {
      var s = p[1]; if (typeof s !== "string") return;
      if (s !== s.trim()) wn(p[0] + ": пробел или перенос по краям");
      if (/ {2,}/.test(s)) wn(p[0] + ": двойной пробел");
      if (/\t/.test(s)) wn(p[0] + ": табуляция");
      if ((s.match(/«/g) || []).length !== (s.match(/»/g) || []).length) wn(p[0] + ": непарные кавычки «»");
      // «1)», «2)», «а)» — номера пунктов, а не скобки
      var br = s.replace(/(^|\n)([ \t]*)(\d{1,2}|[а-яa-z])\)/gi, "$1").replace(/([.;:!?]\s+)\d{1,2}\)(?=\s+[А-Яа-яA-Za-z])/g, "$1");
      if ((br.match(/\(/g) || []).length !== (br.match(/\)/g) || []).length) wn(p[0] + ": непарные скобки");
      if (/,,|[а-яё\d] [,;]/i.test(s)) wn(p[0] + ": лишний знак препинания или пробел перед ним");
      // слово из русских и латинских букв сразу — обычно опечатка (латинская «a», «e», «o», «p», «c» вместо русской)
      (s.match(/[A-Za-zА-Яа-яЁё]+/g) || []).forEach(function (tok) { if (/[A-Za-z]/.test(tok) && /[А-Яа-яЁё]/.test(tok)) wn(p[0] + ": слово «" + tok + "» из русских и латинских букв"); });
    });
    if (q.t !== "self" && !str(q.e)) wn("нет пояснения");
    if (q.kim !== undefined) {
      if (!(Number.isInteger(q.kim) && q.kim >= 1 && q.kim <= (q.sid === "bio" ? 28 : 40))) er("КИМ " + q.kim + " вне диапазона");
    }
    if (q.tbl !== undefined) {
      if (!Array.isArray(q.tbl) || !q.tbl.length || !q.tbl.every(Array.isArray)) er("таблица должна быть списком строк");
      else {
        var wd = q.tbl[0].length;
        if (!q.tbl.every(function (r) { return r.length === wd; })) er("в таблице строки разной длины");
        if (q.tbl.some(function (r) { return r.some(function (x) { return !str(x); }); })) wn("в таблице есть пустая ячейка");
      }
    }
    if (q.svg !== undefined) {
      var op = (q.svg.match(/<svg\b/g) || []).length, cl = (q.svg.match(/<\/svg>/g) || []).length;
      if (!/^\s*<svg\b/.test(q.svg) || op !== cl) er("рисунок: <svg> не закрыт или не с начала");
    }
    if (q.ctx && !(t && t.texts && t.texts[q.ctx])) er("ctx «" + q.ctx + "»: в теме нет такого текста");
    // регистр важен: в русском языке ударение отмечено заглавной буквой («звОнит» и «звонИт» — разные варианты)
    var uniq = function (arr, what, lv) {
      var seen = {}; arr.forEach(function (x) { var k = String(x).replace(/\s+/g, " ").trim(); if (seen[k]) (lv === "error" ? er : wn)(what + " повторяется: «" + String(x).slice(0, 40) + "»"); seen[k] = 1; });
    };
    var strs = function (arr, what) {
      if (!Array.isArray(arr) || arr.some(function (x) { return !str(x); })) { er(what + ": пустой или не список"); return false; }
      return true;
    };
    var inRange = function (x, n) { return Number.isInteger(x) && x >= 0 && x < n; };
    if (q.t === "single") {
      if (strs(q.o, "варианты")) {
        if (q.o.length < 2) er("вариантов меньше двух");
        uniq(q.o, "вариант", "error");
        if (!inRange(q.a, q.o.length)) er("номер верного ответа вне диапазона");
      }
    } else if (q.t === "multi") {
      if (strs(q.o, "варианты")) {
        uniq(q.o, "вариант", "error");
        if (!Array.isArray(q.a) || !q.a.length || !q.a.every(function (x) { return inRange(x, q.o.length); })) er("верные ответы вне диапазона или пусты");
        else {
          if (new Set(q.a).size !== q.a.length) er("номера верных ответов повторяются");
          if (q.a.length >= q.o.length) wn("верны все варианты");
          var m = /(?:выбер|отмет|укаж|запиш)\S*\s+([^.?!]{0,60})/i.exec(q.q || ""), nw;
          if (m && (nw = /\b(одно|один|одну|два|две|три|четыре|пять|шесть)\b/i.exec(m[1])) && NUMW[nw[1].toLowerCase()] !== new Set(q.a).size) wn("в условии «" + nw[1] + "», а верных ответов " + q.a.length);
        }
      }
    } else if (q.t === "match") {
      if (strs(q.l, "левая колонка") & strs(q.r, "правая колонка")) {
        uniq(q.r, "строка правой колонки", "error");
        if (!q.fixed) uniq(q.l, "строка левой колонки"); // в «fixed» левая колонка — буквы А, Б, В с одинаковой подписью
        if (!Array.isArray(q.a) || q.a.length !== q.l.length) er("ответов " + (q.a ? q.a.length : 0) + ", а строк слева " + q.l.length);
        else if (!q.a.every(function (x) { return inRange(x, q.r.length); })) er("номер в ответе вне правой колонки");
        if (q.r.length < 2) er("в правой колонке меньше двух строк");
      }
    } else if (q.t === "order") {
      if (strs(q.o, "элементы")) { if (q.o.length < 3) wn("в порядке меньше трёх элементов"); uniq(q.o, "элемент", "error"); }
      if (q.a !== undefined) wn("у «порядок» не нужен ответ — важен порядок вариантов");
    } else if (q.t === "input") {
      if (!Array.isArray(q.a) || !q.a.length || q.a.some(function (x) { return !str(String(x)); })) er("нет допустимых ответов");
      else {
        if (q.num) {
          if (q.a.some(function (x) { return !isNum(x); })) er("для числового ответа нужны числа");
          if (q.tol !== undefined && !(typeof q.tol === "number" && q.tol >= 0)) er("tol должно быть числом ≥ 0");
        }
        if (q.d && q.a.some(function (x) { return /[^\d\s,]/.test(String(x)); })) er("при d ответ — только цифры");
        // «вперёд» и «вперед» — разные записи; повтором считаем только одинаковые слова (регистр не важен)
        if (new Set(q.a.map(function (x) { return String(x).trim().toLowerCase(); })).size !== q.a.length) wn("допустимые ответы повторяются");
      }
    } else if (q.t === "self") {
      if (strs(q.els, "элементы ответа")) { if (q.els.length > 5) wn("элементов эталона больше пяти"); uniq(q.els, "элемент", "warn"); }
      if (!str(q.ref)) er("нет эталона");
    }
    return out;
  }

  // ---------- проверка банка ----------
  function exportRows(bank) {
    var rows = [];
    Object.keys(bank.SUBJ).forEach(function (sid) {
      bank.SUBJ[sid].topicList.forEach(function (t) { t.q.forEach(function (q) { rows.push(toRow(q, t)); }); });
    });
    return rows;
  }

  function checkBank(bank) {
    var issues = [], stats = { subjects: {}, kim: {}, pos: {}, longest: {}, repeats: [] }, byForm = {};
    Object.keys(bank.SUBJ).forEach(function (sid) {
      var s = bank.SUBJ[sid], st = stats.subjects[sid] = { n: 0, topics: {}, types: {} };
      stats.pos[sid] = { single: [0, 0, 0, 0, 0, 0], multi: [0, 0, 0, 0, 0, 0] };
      stats.longest[sid] = { n: 0, k: 0 };
      s.topicList.forEach(function (t) {
        st.topics[t.id] = { title: t.title, n: t.q.length };
        t.q.forEach(function (q) {
          st.n++; st.types[q.t] = (st.types[q.t] || 0) + 1;
          checkQuestion(q, t).forEach(function (x) { issues.push({ id: q.id, sid: sid, topic: t.id, lv: x.lv, msg: x.msg, q: String(q.q).slice(0, 70) }); });
          if (q.kim !== undefined) { var K = stats.kim[sid] = stats.kim[sid] || {}; K[q.kim] = (K[q.kim] || 0) + 1; }
          if (q.t === "single" && Array.isArray(q.o) && q.o.length === 4 && q.a >= 0 && q.a < 4) {
            stats.pos[sid].single[q.a]++;
            // «заметно длиннее»: больше второго по длине варианта на 15% и не меньше чем на 5 знаков (на 1–3 знака в словах не угадаешь)
            var L = q.o.map(function (x) { return String(x).length; }), second = Math.max.apply(null, L.filter(function (x, i) { return i !== q.a; }));
            stats.longest[sid].n++;
            if (L[q.a] >= second * 1.15 && L[q.a] - second >= 5) stats.longest[sid].k++;
          }
          if (q.t === "multi" && Array.isArray(q.a) && q.o && q.o.length === 6) q.a.forEach(function (i) { if (i >= 0 && i < 6) stats.pos[sid].multi[i]++; });
          // одинаковое условие и одинаковый верный ответ в одной теме — вероятный повтор по смыслу
          var right = q.t === "single" && Array.isArray(q.o) ? q.o[q.a] : q.t === "input" && Array.isArray(q.a) ? q.a[0] : null;
          if (right != null) (byForm[sid + "|" + t.id + "|" + w(q.q) + "|" + w(right)] = byForm[sid + "|" + t.id + "|" + w(q.q) + "|" + w(right)] || []).push(q.id);
        });
      });
    });
    Object.keys(byForm).forEach(function (k) { if (byForm[k].length > 1) stats.repeats.push(byForm[k]); });
    stats.repeats.forEach(function (ids) { ids.slice(1).forEach(function (id) { var q = bank.QS[id]; issues.push({ id: id, sid: q.sid, topic: q.topic, lv: "warn", msg: "то же условие с тем же верным ответом уже есть (" + ids[0] + ")", q: String(q.q).slice(0, 70) }); }); });
    // Место верного ответа в файле не проверяем: сайт перемешивает варианты при каждом показе.
    // А вот длина видна и после перемешивания: если верный ответ чаще всего самый длинный, его угадывают без знаний.
    Object.keys(stats.longest).forEach(function (sid) {
      var Lg = stats.longest[sid];
      if (Lg.n >= 40 && Lg.k / Lg.n > 0.2) issues.push({ id: "", sid: sid, topic: "", lv: "warn", msg: "верный ответ заметно длиннее остальных в " + Math.round(100 * Lg.k / Lg.n) + "% заданий «один ответ»: его можно угадать по длине", q: "" });
    });
    // Номер КИМ должен совпадать с формой задания: у заданий на 2 балла — выбор нескольких, соответствие или порядок,
    // у заданий на 1 балл — ввод ответа или один вариант, у части 2 (22–28) — развёрнутый ответ.
    Object.keys(bank.SUBJ).forEach(function (sid) {
      var s = bank.SUBJ[sid], two = s.variant && s.variant.two;
      if (!two || sid !== "bio") return;
      s.topicList.forEach(function (t) {
        t.q.forEach(function (q) {
          if (q.kim === undefined) return;
          // №21 — анализ таблицы или графика на 1 балл; ответ — цифры, поэтому подходит и «несколько ответов»
          var ok = q.kim >= 22 ? q.t === "self" : two.indexOf(q.kim) >= 0 ? (q.t === "multi" || q.t === "match" || q.t === "order") : (q.t === "input" || q.t === "single" || (q.kim === 21 && q.t === "multi"));
          if (!ok) issues.push({ id: q.id, sid: sid, topic: t.id, lv: "error", msg: "задание №" + q.kim + " КИМ не может быть типа «" + TYPE_RU[q.t] + "»", q: String(q.q).slice(0, 70) });
          else if ([2, 7, 11, 15, 17, 18].indexOf(q.kim) >= 0 && q.t === "multi" && !(q.o && q.o.length === 6 && q.a && q.a.length === 3)) issues.push({ id: q.id, sid: sid, topic: t.id, lv: "warn", msg: "в задании №" + q.kim + " КИМ нужно выбрать три ответа из шести", q: String(q.q).slice(0, 70) });
        });
      });
    });
    bank.SKIPPED.forEach(function (s) { issues.push({ id: "", sid: "", topic: s.split(":")[0], lv: "info", msg: "точный повтор отброшен при загрузке: " + s, q: "" }); });
    bank.NOTES.forEach(function (s) { issues.push({ id: "", sid: "", topic: "", lv: "error", msg: s, q: "" }); });
    return { issues: issues, stats: stats };
  }

  // Проверка самой выгрузки: каждое задание должно пройти путь задание → строка → CSV → строка → задание без потерь.
  function selfTest(bank) {
    var rows = exportRows(bank), parsed = csvParse(csvStringify(rows, COLS)).rows, bad = [];
    if (parsed.length !== rows.length) bad.push("после CSV строк " + parsed.length + " вместо " + rows.length);
    rows.forEach(function (r, i) {
      var q = bank.QS[r.id], p = parsed[i], res = fromRow(p, q);
      if (!res.q || res.err.length) bad.push(r.id + ": " + (res.err.join("; ") || "не разобрано"));
      else if (!sameQ(q, res.q)) bad.push(r.id + ": после выгрузки задание отличается (" + Object.keys(diffFields(q, res.q) || {}).join(", ") + ")");
      else if (!sameRow(r, p)) bad.push(r.id + ": строка изменилась в CSV");
    });
    return bad;
  }

  // ---------- разбор правленой таблицы ----------
  var DATE_RE = /^\d{1,2}[./]\d{1,2}[./]\d{2,4}$|^\d{1,2}\s+(?:янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)/i;
  function diffTable(text, bank) {
    var P = csvParse(text), res = { edit: {}, add: [], drop: [], errors: [], notes: [], same: 0, rows: P.rows.length };
    COLS.forEach(function (c) { if (c !== "Название темы" && c !== "Предмет" && P.cols.indexOf(c) < 0) res.errors.push("в таблице нет столбца «" + c + "»"); });
    if (res.errors.length) return res;
    var sigs = {};
    Object.keys(bank.QS).forEach(function (id) { var q = bank.QS[id], t = bank.TOPICS[q.topic]; sigs[EGE.qSig(q, q.ctx && t.texts ? t.texts[q.ctx] : "")] = id; });
    var seenIds = {};
    P.rows.forEach(function (row, i) {
      var line = i + 2, id = String(row.id || "").trim(), label = "строка " + line + (id ? " (" + id + ")" : "");
      var cur = id ? bank.QS[id] : null;
      if (id && seenIds[id]) { res.errors.push(label + ": id встречается второй раз"); return; }
      if (id) seenIds[id] = 1;
      if (id && !cur) { res.errors.push(label + ": такого задания нет на сайте (таблица устарела?)"); return; }
      if (cur && sameRow(toRow(cur, bank.TOPICS[cur.topic]), row)) { res.same++; return; }
      var r = fromRow(row, cur);
      if (!r.q) { res.errors.push(label + ": " + r.err.join("; ")); return; }
      if (r.del) { if (cur) res.drop.push(id); else res.notes.push(label + ": новая строка с «удалить» пропущена"); return; }
      var topic = String(row["Тема"] || "").trim();
      if (cur && topic && topic !== cur.topic) { res.errors.push(label + ": перенос между темами через таблицу не поддерживается (" + cur.topic + " → " + topic + ")"); return; }
      var tp = cur ? bank.TOPICS[cur.topic] : bank.TOPICS[topic];
      if (!tp) { res.errors.push(label + ": нет темы «" + topic + "»"); return; }
      // Excel мог превратить ответ в дату
      EDITABLE.forEach(function (c) { if (c === "Ответ" && nl(row[c]).split("\n").some(function (x) { return DATE_RE.test(x.trim()); }) && !(cur && nl(toRow(cur, tp)[c]).split("\n").some(function (x) { return DATE_RE.test(x.trim()); }))) r.err.push("в ответе дата — Excel мог испортить ячейку, откройте файл через «Данные → Из текста» с типом «Текст»"); });
      var full = Object.assign({}, r.q, { id: cur ? cur.id : "", topic: tp.id, sid: tp.sid });
      var probs = r.err.map(function (m) { return { lv: "error", msg: m }; }).concat(checkQuestion(full, tp));
      var bad = probs.filter(function (p) { return p.lv === "error"; });
      if (bad.length) { res.errors.push(label + ": " + bad.map(function (p) { return p.msg; }).join("; ")); return; }
      probs.forEach(function (p) { res.notes.push(label + ": " + p.msg); });
      if (cur) {
        var set = diffFields(cur, r.q);
        if (!set) { res.same++; return; }
        res.edit[id] = set;
      } else {
        var add = Object.assign({ topic: tp.id }, clone(r.q));
        var sig = EGE.qSig(r.q, r.q.ctx && tp.texts ? tp.texts[r.q.ctx] : "");
        if (sigs[sig]) { res.notes.push(label + ": такое задание уже есть (" + sigs[sig] + ") — не добавлено"); return; }
        sigs[sig] = "новое";
        res.add.push(add);
      }
    });
    return res;
  }

  // Новое содержимое subjects/table.js = прежние правки + правки из этой таблицы.
  function buildTable(prev, d) {
    var edit = clone(prev.edit || {}), add = clone(prev.add || []), drop = (prev.drop || []).slice();
    Object.keys(d.edit).forEach(function (id) { edit[id] = Object.assign(edit[id] || {}, d.edit[id]); });
    d.add.forEach(function (a) { add.push(a); });
    d.drop.forEach(function (id) { if (drop.indexOf(id) < 0) drop.push(id); delete edit[id]; });
    var ids = Object.keys(edit).sort();
    return [
      "/* Правки из таблицы bank/bank.csv (создаётся страницей tools/bank.html — вручную не править).",
      "   edit — изменённые поля заданий по id (null удаляет поле), add — новые задания, drop — удалённые id. */",
      "window.EGE = window.EGE || {};",
      "EGE.table = {",
      '"edit": {' + (ids.length ? "\n" + ids.map(function (id) { return JSON.stringify(id) + ": " + JSON.stringify(edit[id]); }).join(",\n") + "\n" : "") + "},",
      '"add": [' + (add.length ? "\n" + add.map(function (a) { return JSON.stringify(a); }).join(",\n") + "\n" : "") + "],",
      '"drop": ' + JSON.stringify(drop),
      "};",
      ""
    ].join("\n");
  }

  EGE.bankTools = { COLS: COLS, csvStringify: csvStringify, csvParse: csvParse, toRow: toRow, fromRow: fromRow, exportRows: exportRows, checkQuestion: checkQuestion, checkBank: checkBank, selfTest: selfTest, diffTable: diffTable, buildTable: buildTable };
})();
