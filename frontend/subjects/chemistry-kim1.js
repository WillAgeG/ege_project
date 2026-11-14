/* Химия: задания части 1 в формате КИМ ЕГЭ-2027, номера 1–5 (метка kim — номер задания экзамена).
   Здесь же — общая библиотека EGE.chemLib для остальных файлов chemistry-kim*.js.
   Подключается после chemistry-topics.js. Задания 1–5 собираются программой по данным о строении атомов и веществ,
   поэтому верные ответы всегда согласованы с данными (генерация детерминирована: одинаковые зерна — одинаковые задания). */
(function () {
  var EGE = window.EGE;
  var s = EGE && EGE.subjects && EGE.subjects.chem;
  if (!s) return;
  var byId = {};
  s.sections.forEach(function (sec) { sec.topics.forEach(function (t) { byId[t.id] = t; }); });
  function add(id, qs) { var t = byId[id]; if (t) t.q = t.q.concat(qs.filter(Boolean)); }

  // ---------- общая библиотека ----------
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sample(r, arr, k) { var a = arr.slice(), out = []; for (var i = 0; i < k && a.length; i++) out.push(a.splice(Math.floor(r() * a.length), 1)[0]); return out; }
  function shuf(r, arr) { return sample(r, arr, arr.length); }
  var SUPD = "⁰¹²³⁴⁵⁶⁷⁸⁹", SUBD = "₀₁₂₃₄₅₆₇₈₉";
  function sup(n) { return String(n).replace(/\d/g, function (d) { return SUPD[+d]; }); }
  function sub(n) { return String(n).replace(/\d/g, function (d) { return SUBD[+d]; }); }
  function chg(q) { return q === 0 ? "" : (Math.abs(q) > 1 ? sup(Math.abs(q)) : "") + (q > 0 ? "⁺" : "⁻"); }
  function eword(n) { return n === 1 ? "электрон" : n >= 2 && n <= 4 ? "электрона" : "электронов"; }
  // конструкторы заданий
  function MS(kim, q, o, a, e, extra) { return Object.assign({ t: "multi", kim: kim, q: q, o: o, a: a.slice().sort(function (x, y) { return x - y; }), e: e }, extra || {}); }
  function M(kim, q, l, r, a, e, extra) { return Object.assign({ t: "match", kim: kim, fixed: true, q: q, l: l, r: r, a: a, e: e }, extra || {}); }
  function O(kim, q, o, e) { return { t: "order", kim: kim, q: q, o: o, e: e }; }
  function IN(kim, q, a, e, extra) { return Object.assign({ t: "input", kim: kim, q: q, a: [].concat(a), e: e }, extra || {}); }
  function NUM(kim, q, a, e, tol) { return { t: "input", kim: kim, num: true, tol: tol === undefined ? 0.001 : tol, q: q, a: [].concat(a), e: e }; }
  EGE.chemLib = { add: add, rng: rng, sample: sample, shuf: shuf, sup: sup, sub: sub, chg: chg, MS: MS, M: M, O: O, IN: IN, NUM: NUM };

  function dedupe(arr) { var seen = {}; return arr.filter(function (q) { if (!q) return false; var k = q.q + "|" + (q.o || q.l || q.a).join("|"); if (seen[k]) return false; return (seen[k] = true); }); }

  // ================= Задание 1: строение атома =================
  var SYM = ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr"];
  var FILL = [["1s", 2], ["2s", 2], ["2p", 6], ["3s", 2], ["3p", 6], ["4s", 2], ["3d", 10], ["4p", 6]];
  var WRITE = ["1s", "2s", "2p", "3s", "3p", "3d", "4s", "4p"];
  var TAKE = ["4p", "4s", "3d", "3p", "3s", "2p", "2s", "1s"];
  function config(Z) {
    var left = Z, c = {};
    FILL.forEach(function (sh) { var n = Math.min(left, sh[1]); if (n > 0) c[sh[0]] = n; left -= n; });
    if (Z === 24) { c["4s"] = 1; c["3d"] = 5; }
    if (Z === 29) { c["4s"] = 1; c["3d"] = 10; }
    return c;
  }
  function ion(Z, q) {
    if (q < 0) return config(Z - q);
    var c = config(Z), left = q;
    TAKE.forEach(function (sh) { if (left > 0 && c[sh]) { var n = Math.min(left, c[sh]); c[sh] -= n; left -= n; if (!c[sh]) delete c[sh]; } });
    return c;
  }
  function cfgStr(c) { return WRITE.filter(function (k) { return c[k]; }).map(function (k) { return k + sup(c[k]); }).join(""); }
  function unpaired(c) {
    var u = 0;
    Object.keys(c).forEach(function (k) {
      var n = c[k], t = k[1];
      if (t === "s") u += n === 1 ? 1 : 0;
      else if (t === "p") u += n <= 3 ? n : 6 - n;
      else u += n <= 5 ? n : 10 - n;
    });
    return u;
  }
  function cnt(c, t) { return Object.keys(c).reduce(function (a, k) { return a + (k[1] === t ? c[k] : 0); }, 0); }
  function outerN(c) { return Math.max.apply(null, Object.keys(c).map(function (k) { return +k[0]; })); }
  function atom(Z) {
    var c = config(Z);
    return { label: SYM[Z - 1], Z: Z, c: c, str: cfgStr(c), unp: unpaired(c), s: cnt(c, "s"), p: cnt(c, "p"), d: cnt(c, "d"),
      outer: (Z >= 21 && Z <= 30) ? (c["4s"] || 0) : Object.keys(c).reduce(function (a, k) { return a + (+k[0] === outerN(c) ? c[k] : 0); }, 0),
      main: !(Z >= 21 && Z <= 30) };
  }
  function ionItem(Z, q) {
    var c = ion(Z, q), e = Z - q;
    return { label: SYM[Z - 1] + chg(q), Z: Z, q: q, c: c, str: cfgStr(c), e: e, d: cnt(c, "d"), unp: unpaired(c) };
  }
  var ATOMS = [3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map(atom);
  var MAIN = ATOMS.filter(function (a) { return a.main; });

  // выбирает 5 вариантов: k верных (prop истинно) и 5−k неверных
  function pick5(r, pool, prop, k) {
    var yes = pool.filter(prop), no = pool.filter(function (x) { return !prop(x); });
    if (yes.length < k || no.length < 5 - k) return null;
    var ys = sample(r, yes, k), ns = sample(r, no, 5 - k), items = shuf(r, ys.concat(ns));
    return { items: items, a: items.map(function (x, i) { return prop(x) ? i : -1; }).filter(function (i) { return i >= 0; }) };
  }
  function expl(items, a, note) {
    return items.map(function (x, i) { return x.label + ": " + x.str + (note ? " — " + note(x) : ""); }).join("; ") + ". Верно: " + a.map(function (i) { return items[i].label; }).join(" и ") + ".";
  }
  var K1 = [];
  // неспаренные электроны
  [[1, "один неспаренный электрон"], [2, "два неспаренных электрона"], [3, "три неспаренных электрона"]].forEach(function (t, ti) {
    [11, 12].forEach(function (seed) {
      var r = rng(seed * 10 + t[0] + ti), p = pick5(r, ATOMS, function (x) { return x.unp === t[0]; }, 2);
      if (p) K1.push(MS(1, "Определите, атомы каких двух из указанных элементов в основном состоянии содержат " + t[1] + ".", p.items.map(function (x) { return x.label; }), p.a, expl(p.items, p.a, function (x) { return "неспаренных " + x.unp; })));
    });
  });
  // число s-электронов, как у частицы
  [["катион натрия", 11, 1], ["атом неона", 10, 0], ["катион калия", 19, 1], ["атом аргона", 18, 0], ["хлорид-ион", 17, -1], ["катион магния", 12, 2], ["атом кальция", 20, 0], ["катион кальция", 20, 2], ["атом углерода", 6, 0]].forEach(function (t, ti) {
    var ref = ionItem(t[1], t[2]), target = ref.c ? cnt(ref.c, "s") : 0, r = rng(200 + ti);
    var p = pick5(r, ATOMS, function (x) { return x.s === target; }, 2);
    if (p) K1.push(MS(1, "Определите, атомы каких двух из указанных элементов в основном состоянии содержат такое же число s-электронов, как и " + t[0] + ".", p.items.map(function (x) { return x.label; }), p.a, t[0] + " — " + ref.str + ": s-электронов " + target + ". " + expl(p.items, p.a, function (x) { return "s-электронов " + x.s; })));
  });
  // число p-электронов
  (function () {
    var counts = {}; ATOMS.forEach(function (a) { counts[a.p] = (counts[a.p] || []).concat(a); });
    Object.keys(counts).forEach(function (n, ni) {
      var k = counts[n].length; if (+n < 1 || k < 2 || k > 6) return;
      var r = rng(300 + ni), p = pick5(r, ATOMS, function (x) { return x.p === +n; }, 2);
      if (p) K1.push(MS(1, "Определите, атомы каких двух из указанных элементов в основном состоянии содержат по " + n + " p-" + eword(+n) + ".", p.items.map(function (x) { return x.label; }), p.a, expl(p.items, p.a, function (x) { return "p-электронов " + x.p; })));
    });
  })();
  // электроны на внешнем уровне и внешняя конфигурация
  [3, 4, 5, 6, 7].forEach(function (n, ni) {
    var r = rng(400 + ni), p = pick5(r, MAIN, function (x) { return x.outer === n; }, 2);
    if (p) K1.push(MS(1, "Определите, атомы каких двух из указанных элементов содержат на внешнем электронном слое " + n + " " + eword(n) + ".", p.items.map(function (x) { return x.label; }), p.a, expl(p.items, p.a, function (x) { return "на внешнем слое " + x.outer; })));
  });
  // ионы
  (function () {
    var IONS = [[17, -1], [19, 1], [20, 2], [16, -2], [15, -3], [21, 3], [11, 1], [12, 2], [13, 3], [9, -1], [8, -2], [7, -3], [3, 1], [4, 2], [35, -1], [26, 2], [26, 3], [25, 2], [29, 1], [29, 2], [30, 2], [24, 3]].map(function (t) { return ionItem(t[0], t[1]); });
    [[18, "аргона"], [10, "неона"], [36, "криптона"]].forEach(function (t, ti) {
      var r = rng(500 + ti), p = pick5(r, IONS, function (x) { return x.e === t[0]; }, 2);
      if (p) K1.push(MS(1, "Определите, какие две из указанных частиц имеют такую же электронную конфигурацию, как атом " + t[1] + ".", p.items.map(function (x) { return x.label; }), p.a, expl(p.items, p.a, function (x) { return x.e + " электронов"; })));
    });
    [[5, "пять электронов"], [10, "десять электронов"], [6, "шесть электронов"], [3, "три электрона"]].forEach(function (t, ti) {
      var r = rng(600 + ti), D = IONS.filter(function (x) { return x.Z >= 21; });
      var p = pick5(r, D, function (x) { return x.d === t[0]; }, 2);
      if (p) K1.push(MS(1, "Определите, какие две из указанных частиц содержат на d-подуровне " + t[1] + ".", p.items.map(function (x) { return x.label; }), p.a, expl(p.items, p.a, function (x) { return "d-электронов " + x.d; })));
    });
  })();
  add("c1-1", dedupe(K1).slice(0, 26));

  // ================= Задание 2: закономерности в ряду элементов =================
  var EL = {}; // период и группа главных подгрупп
  [["Li", 2, 1], ["Be", 2, 2], ["B", 2, 13], ["C", 2, 14], ["N", 2, 15], ["O", 2, 16], ["F", 2, 17],
   ["Na", 3, 1], ["Mg", 3, 2], ["Al", 3, 13], ["Si", 3, 14], ["P", 3, 15], ["S", 3, 16], ["Cl", 3, 17],
   ["K", 4, 1], ["Ca", 4, 2], ["Ga", 4, 13], ["Ge", 4, 14], ["As", 4, 15], ["Se", 4, 16], ["Br", 4, 17],
   ["Rb", 5, 1], ["Sr", 5, 2], ["In", 5, 13], ["Sn", 5, 14], ["Sb", 5, 15], ["Te", 5, 16], ["I", 5, 17]].forEach(function (t) { EL[t[0]] = { s: t[0], p: t[1], g: t[2] }; });
  var ELS = Object.keys(EL).map(function (k) { return EL[k]; });
  // свойство: в периоде слева направо / в группе сверху вниз возрастает (+1) или убывает (−1)
  var PROPS = [
    { n: "атомного радиуса", nom: "атомный радиус", pl: false, per: -1, grp: 1 },
    { n: "электроотрицательности", nom: "электроотрицательность", pl: false, per: 1, grp: -1 },
    { n: "металлических свойств", nom: "металлические свойства", pl: true, per: -1, grp: 1 },
    { n: "неметаллических свойств", nom: "неметаллические свойства", pl: true, per: 1, grp: -1 },
    { n: "восстановительных свойств простых веществ", nom: "восстановительные свойства простых веществ", pl: true, per: -1, grp: 1 },
    { n: "окислительных свойств простых веществ", nom: "окислительные свойства простых веществ", pl: true, per: 1, grp: -1, nonmet: true },
    { n: "кислотных свойств высших оксидов", nom: "кислотные свойства высших оксидов", pl: true, per: 1, grp: -1, nonmet: true, oxide: true },
    { n: "основных свойств высших гидроксидов", nom: "основные свойства высших гидроксидов", pl: true, per: -1, grp: 1, metal: true, oxide: true }
  ];
  var K2 = [];
  var seed2 = 700;
  PROPS.forEach(function (pr, pi) {
    ["период", "группа"].forEach(function (kind, ki) {
      [0, 1].forEach(function (dir) {
        var r = rng(seed2++), ok = false, tries = 0, q = null;
        while (!ok && tries++ < 60) {
          var chosen, rest;
          if (kind === "период") {
            var P = 2 + Math.floor(r() * 3), inP = ELS.filter(function (x) { return x.p === P; });
            if (pr.nonmet) inP = inP.filter(function (x) { return x.g >= 14; });
            if (pr.metal) inP = inP.filter(function (x) { return x.g <= 13; });
            if (pr.oxide) inP = inP.filter(function (x) { return x.s !== "F" && x.s !== "O"; });
            if (inP.length < 3) continue;
            chosen = sample(r, inP, 3);
            rest = ELS.filter(function (x) { return x.p !== P; });
          } else {
            var G = [1, 2, 14, 15, 16, 17][Math.floor(r() * 6)], inG = ELS.filter(function (x) { return x.g === G; });
            if (pr.nonmet && G < 14) continue;
            if (pr.metal && G > 13) continue;
            if (pr.oxide) inG = inG.filter(function (x) { return x.s !== "F" && x.s !== "O"; });
            if (inG.length < 3) continue;
            chosen = sample(r, inG, 3);
            rest = ELS.filter(function (x) { return x.g !== G; });
          }
          // два лишних элемента не должны образовывать с выбранными вторую тройку
          var extra = sample(r, rest, 2), all = shuf(r, chosen.concat(extra));
          var key = kind === "период" ? "g" : "p", cntSame = {};
          all.forEach(function (x) { var kk = kind === "период" ? x.p : x.g; cntSame[kk] = (cntSame[kk] || 0) + 1; });
          if (Object.keys(cntSame).filter(function (kk) { return cntSame[kk] >= 3; }).length !== 1) continue;
          var sign = kind === "период" ? pr.per : pr.grp, up = dir === 0;
          // порядок по возрастанию свойства
          var order = chosen.slice().sort(function (x, y) { return (kind === "период" ? x.g - y.g : x.p - y.p) * sign; });
          if (!up) order.reverse();
          var ans = order.map(function (x) { return all.indexOf(x) + 1; }).join("");
          q = IN(2, "Из предложенного ряда элементов выберите три элемента, которые находятся в " + (kind === "период" ? "одном периоде" : "одной группе") + " Периодической системы. Расположите выбранные элементы в порядке " + (up ? "возрастания" : "убывания") + " " + pr.n + ". Запишите номера выбранных элементов в нужной последовательности (цифры подряд, без пробелов).\nРяд элементов: " + all.map(function (x, i) { return (i + 1) + ") " + x.s; }).join("; ") + ".",
            ans, "В " + (kind === "период" ? "одном периоде" : "одной группе") + " находятся " + chosen.map(function (x) { return x.s; }).join(", ") + (kind === "период" ? " (период " + chosen[0].p + ")" : " (группа " + (chosen[0].g > 2 ? chosen[0].g - 10 : chosen[0].g) + "А)") + ". " + (kind === "период" ? "Слева направо по периоду " : "Сверху вниз по группе ") + pr.nom + " " + ((kind === "период" ? pr.per : pr.grp) > 0 ? (pr.pl ? "усиливаются" : "увеличивается") : (pr.pl ? "ослабевают" : "уменьшается")) + ". Порядок " + (up ? "возрастания" : "убывания") + ": " + order.map(function (x) { return x.s; }).join(" → ") + ".");
          ok = true;
        }
        if (q) K2.push(q);
      });
    });
  });
  add("c1-2", dedupe(K2).slice(0, 24));

  // ================= Задание 3: электроотрицательность, валентность, степень окисления =================
  // pos/neg — бывают ли положительные/отрицательные степени окисления, max/min — высшая и низшая
  var OXD = [
    ["H", 1, -1], ["Li", 1, 0], ["Na", 1, 0], ["K", 1, 0], ["Mg", 2, 0], ["Ca", 2, 0], ["Ba", 2, 0], ["Al", 3, 0], ["Zn", 2, 0], ["Fe", 3, 0], ["Cu", 2, 0],
    ["C", 4, -4], ["Si", 4, -4], ["N", 5, -3], ["P", 5, -3], ["As", 5, -3], ["S", 6, -2], ["Se", 6, -2], ["Cl", 7, -1], ["Br", 7, -1], ["I", 7, -1],
    ["F", 0, -1], ["O", 0, -2], ["Cr", 6, 0], ["Mn", 7, 0], ["Ge", 4, -4], ["Sn", 4, 0], ["Ti", 4, 0]
  ].map(function (t) { return { label: t[0], max: t[1], min: t[2], pos: t[1] > 0, neg: t[2] < 0 }; });
  var NO_O = OXD.filter(function (x) { return x.label !== "O"; });
  var K3 = [];
  var F3 = [
    ["могут проявлять в соединениях как положительную, так и отрицательную степень окисления", function (x) { return x.pos && x.neg; }, NO_O, "бывают и «+», и «−»"],
    ["в соединениях проявляют только положительные степени окисления", function (x) { return x.pos && !x.neg; }, NO_O, "только «+»"],
    ["имеют высшую степень окисления +5", function (x) { return x.max === 5; }, NO_O, "высшая +5"],
    ["имеют высшую степень окисления +6", function (x) { return x.max === 6; }, NO_O, "высшая +6"],
    ["имеют высшую степень окисления +7", function (x) { return x.max === 7; }, NO_O, "высшая +7"],
    ["имеют высшую степень окисления +4", function (x) { return x.max === 4; }, NO_O, "высшая +4"],
    ["имеют низшую степень окисления −3", function (x) { return x.min === -3; }, NO_O, "низшая −3"],
    ["имеют низшую степень окисления −2", function (x) { return x.min === -2; }, OXD, "низшая −2"],
    ["имеют низшую степень окисления −1", function (x) { return x.min === -1 && x.label !== "H"; }, NO_O.filter(function (x) { return x.label !== "H"; }), "низшая −1"],
    ["имеют низшую степень окисления −4", function (x) { return x.min === -4; }, NO_O, "низшая −4"]
  ];
  F3.forEach(function (f, fi) {
    [1, 2].forEach(function (rep) {
      var r = rng(800 + fi * 7 + rep), p = pick5(r, f[2], f[1], 2);
      if (p) K3.push(MS(3, "Из указанных в ряду элементов выберите два, которые " + f[0] + ".", p.items.map(function (x) { return x.label; }), p.a,
        p.items.map(function (x) { return x.label + " (" + (x.max ? "высшая +" + x.max : "положительных нет") + ", " + (x.min ? "низшая " + x.min : "отрицательных нет") + ")"; }).join("; ") + ". Подходят: " + p.a.map(function (i) { return p.items[i].label; }).join(" и ") + "."));
    });
  });
  add("c1-3", dedupe(K3).slice(0, 24));

  // ================= Задание 4: химическая связь и кристаллическая решётка =================
  // b: I — ионная, CP — ковалентная полярная, CN — ковалентная неполярная, M — металлическая, H — водородные связи между молекулами
  // lat: ion / atom / mol / met
  var SUBST = [
    ["NaCl", "I", "ion"], ["Na₂O", "I", "ion"], ["CaCl₂", "I", "ion"], ["MgO", "I", "ion"], ["Li₃N", "I", "ion"], ["K₂S", "I", "ion"], ["BaCl₂", "I", "ion"],
    ["KOH", "I CP", "ion"], ["K₂SO₄", "I CP", "ion"], ["NH₄Cl", "I CP", "ion"], ["NaNO₃", "I CP", "ion"], ["(NH₄)₂SO₄", "I CP", "ion"], ["Ca(OH)₂", "I CP", "ion"], ["CaCO₃", "I CP", "ion"], ["NaHCO₃", "I CP", "ion"], ["Na₃PO₄", "I CP", "ion"], ["Ba(OH)₂", "I CP", "ion"], ["KClO₃", "I CP", "ion"],
    ["Na₂O₂", "I CN", "ion"], ["CaC₂", "I CN", "ion"], ["Na₂S₂", "I CN", "ion"], ["BaO₂", "I CN", "ion"],
    ["CH₃COONa", "I CP CN", "ion"], ["C₂H₅ONa", "I CP CN", "ion"],
    ["алмаз", "CN", "atom"], ["кремний", "CN", "atom"], ["графит", "CN", "atom"], ["бор", "CN", "atom"],
    ["SiO₂", "CP", "atom"], ["SiC", "CP", "atom"], ["BN", "CP", "atom"],
    ["H₂", "CN", "mol"], ["O₂", "CN", "mol"], ["N₂", "CN", "mol"], ["Cl₂", "CN", "mol"], ["I₂", "CN", "mol"], ["S₈", "CN", "mol"], ["P₄", "CN", "mol"], ["O₃", "CN", "mol"],
    ["CO₂", "CP", "mol"], ["SO₂", "CP", "mol"], ["SO₃", "CP", "mol"], ["P₂O₅", "CP", "mol"], ["CH₄", "CP", "mol"], ["HCl", "CP", "mol"], ["CO", "CP", "mol"], ["NO₂", "CP", "mol"], ["SiH₄", "CP", "mol"], ["PCl₃", "CP", "mol"],
    ["H₂O", "CP H", "mol"], ["NH₃", "CP H", "mol"], ["HF", "CP H", "mol"], ["CH₃OH", "CP H", "mol"], ["C₂H₅OH", "CP CN H", "mol"], ["CH₃COOH", "CP CN H", "mol"], ["C₆H₅OH", "CP CN H", "mol"], ["N₂H₄", "CP CN H", "mol"], ["H₂O₂", "CP CN H", "mol"],
    ["C₂H₆", "CP CN", "mol"], ["C₂H₄", "CP CN", "mol"], ["C₆H₆", "CP CN", "mol"], ["C₂H₂", "CP CN", "mol"], ["C₃H₈", "CP CN", "mol"], ["CH₃–O–CH₃", "CP", "mol"],
    ["Na", "M", "met"], ["Fe", "M", "met"], ["Cu", "M", "met"], ["Al", "M", "met"], ["Zn", "M", "met"]
  ].map(function (t) { return { label: t[0], b: t[1].split(" "), lat: t[2] }; });
  function has(x, b) { return x.b.indexOf(b) >= 0; }
  var ORG = ["CH₃COONa", "C₂H₅ONa", "CH₄", "CH₃OH", "C₂H₅OH", "CH₃COOH", "C₆H₅OH", "C₂H₆", "C₂H₄", "C₆H₆", "C₂H₂", "C₃H₈", "CH₃–O–CH₃", "N₂H₄"];
  var INORG = SUBST.filter(function (x) { return ORG.indexOf(x.label) < 0; });
  var K4 = [];
  var F4 = [
    ["вещества с ковалентной полярной связью, имеющие ионную кристаллическую решётку", function (x) { return x.lat === "ion" && has(x, "CP"); }, SUBST],
    ["вещества, в которых есть и ионная, и ковалентная неполярная связь", function (x) { return has(x, "I") && has(x, "CN"); }, INORG],
    ["вещества, содержащие только ковалентную неполярную связь", function (x) { return x.b.length === 1 && x.b[0] === "CN"; }, SUBST],
    ["вещества, содержащие и ковалентную полярную, и ковалентную неполярную связи", function (x) { return has(x, "CP") && has(x, "CN") && !has(x, "I"); }, SUBST],
    ["вещества молекулярного строения", function (x) { return x.lat === "mol"; }, SUBST],
    ["вещества с атомной кристаллической решёткой", function (x) { return x.lat === "atom"; }, SUBST],
    ["вещества с ионной кристаллической решёткой", function (x) { return x.lat === "ion"; }, SUBST],
    ["вещества, между молекулами которых образуются водородные связи", function (x) { return has(x, "H"); }, SUBST],
    ["вещества, в которых нет ни одной ковалентной связи", function (x) { return has(x, "I") && !has(x, "CP") && !has(x, "CN"); }, SUBST],
    ["вещества с металлической связью", function (x) { return x.lat === "met"; }, SUBST]
  ];
  F4.forEach(function (f, fi) {
    [1, 2].forEach(function (rep) {
      var r = rng(900 + fi * 9 + rep), p = pick5(r, f[2], f[1], 2);
      if (p) K4.push(MS(4, "Из предложенного перечня выберите два " + f[0] + ".", p.items.map(function (x) { return x.label; }), p.a,
        p.items.map(function (x) { return x.label + " — " + x.b.map(function (b) { return { I: "ионная", CP: "ковалентная полярная", CN: "ковалентная неполярная", M: "металлическая", H: "водородные между молекулами" }[b]; }).join(", ") + "; решётка " + { ion: "ионная", atom: "атомная", mol: "молекулярная", met: "металлическая" }[x.lat]; }).join(". ") + ". Подходят: " + p.a.map(function (i) { return p.items[i].label; }).join(" и ") + "."));
    });
  });
  add("c1-4", dedupe(K4).slice(0, 22));

  // ================= Задание 5: классификация и номенклатура неорганических веществ =================
  var T = {
    nes: "несолеобразующий оксид", kis: "кислотный оксид", osn: "основный оксид", amf: "амфотерный оксид",
    wk: "слабая кислота", st: "сильная кислота", sch: "щёлочь", nr: "нерастворимое основание", agh: "амфотерный гидроксид",
    ks: "кислая соль", ss: "средняя соль", bs: "основная соль", ps: "простое вещество", kom: "комплексная соль"
  };
  var CL = [
    ["CO", "nes"], ["NO", "nes"], ["оксид азота(I)", "nes"], ["угарный газ", "nes"], ["N₂O", "nes"],
    ["CO₂", "kis"], ["SO₂", "kis"], ["SO₃", "kis"], ["P₂O₅", "kis"], ["N₂O₅", "kis"], ["кварц", "kis"], ["Cl₂O₇", "kis"], ["оксид хрома(VI)", "kis"],
    ["Na₂O", "osn"], ["K₂O", "osn"], ["негашёная известь", "osn"], ["BaO", "osn"], ["MgO", "osn"], ["CuO", "osn"], ["оксид железа(II)", "osn"],
    ["Al₂O₃", "amf"], ["корунд", "amf"], ["ZnO", "amf"], ["BeO", "amf"], ["оксид хрома(III)", "amf"],
    ["H₂S", "wk"], ["H₂CO₃", "wk"], ["H₂SiO₃", "wk"], ["HF", "wk"], ["HNO₂", "wk"], ["H₂SO₃", "wk"], ["CH₃COOH", "wk"],
    ["HCl", "st"], ["HBr", "st"], ["HI", "st"], ["HNO₃", "st"], ["H₂SO₄", "st"], ["HClO₄", "st"],
    ["NaOH", "sch"], ["KOH", "sch"], ["едкий натр", "sch"], ["гашёная известь", "sch"], ["Ba(OH)₂", "sch"], ["LiOH", "sch"],
    ["Cu(OH)₂", "nr"], ["Fe(OH)₃", "nr"], ["Mg(OH)₂", "nr"], ["Fe(OH)₂", "nr"],
    ["Al(OH)₃", "agh"], ["Zn(OH)₂", "agh"], ["Cr(OH)₃", "agh"], ["Be(OH)₂", "agh"],
    ["NaHCO₃", "ks"], ["питьевая сода", "ks"], ["KHSO₄", "ks"], ["Ca(H₂PO₄)₂", "ks"], ["NaH₂PO₄", "ks"], ["NH₄HCO₃", "ks"], ["Ca(HCO₃)₂", "ks"], ["NaHS", "ks"],
    ["Na₂SO₄", "ss"], ["мел", "ss"], ["поваренная соль", "ss"], ["KNO₃", "ss"], ["CuSO₄", "ss"], ["FeCl₃", "ss"], ["Na₂CO₃", "ss"], ["BaSO₄", "ss"], ["AgCl", "ss"], ["K₃PO₄", "ss"], ["(NH₄)₂SO₄", "ss"], ["нашатырь", "ss"],
    ["(CuOH)₂CO₃", "bs"], ["малахит", "bs"], ["Mg(OH)Cl", "bs"], ["Fe(OH)SO₄", "bs"],
    ["Na[Al(OH)₄]", "kom"], ["K₃[Fe(CN)₆]", "kom"], ["[Ag(NH₃)₂]Cl", "kom"], ["Na₂[Zn(OH)₄]", "kom"],
    ["O₂", "ps"], ["озон", "ps"], ["N₂", "ps"], ["Cl₂", "ps"], ["S₈", "ps"], ["алмаз", "ps"], ["графит", "ps"], ["Fe", "ps"], ["Cu", "ps"], ["P₄", "ps"], ["Br₂", "ps"]
  ];
  // вещества других категорий (не простые, не оксиды и т. д.), которые подойдут как лишние
  var OTHER = ["NH₃", "CH₄", "NaH", "CaC₂", "Li₃N", "H₂O₂", "Ca₃P₂", "SiC", "C₂H₅OH", "C₆H₆"].map(function (x) { return [x, "other"]; });
  var CLS = CL.concat(OTHER).map(function (t) { return { label: t[0], tag: t[1] }; });
  var ASK = ["nes", "kis", "osn", "amf", "wk", "st", "sch", "nr", "agh", "ks", "ss", "bs", "kom", "ps"];
  var K5 = [];
  var combos = [["nes", "wk", "ps"], ["kis", "ks", "sch"], ["amf", "st", "ss"], ["osn", "nr", "wk"], ["agh", "ps", "kis"], ["bs", "st", "nes"], ["sch", "ks", "amf"], ["kom", "wk", "osn"], ["ss", "nes", "agh"], ["ps", "ks", "kis"], ["nr", "ss", "st"], ["osn", "wk", "ks"], ["amf", "ps", "wk"], ["nes", "sch", "ss"]];
  combos.forEach(function (cb, ci) {
    var r = rng(1000 + ci), chosen = cb.map(function (tg) { return sample(r, CLS.filter(function (x) { return x.tag === tg; }), 1)[0]; });
    var distract = CLS.filter(function (x) { return cb.indexOf(x.tag) < 0 && chosen.indexOf(x) < 0; });
    // кислотные оксиды и «other» могут иметь неоднозначный класс — берём только явно размеченные
    var rest = sample(r, distract, 6), cells = shuf(r, chosen.concat(rest)), seen = {};
    if (cells.some(function (x) { var dup = seen[x.label]; seen[x.label] = 1; return dup; })) return;
    K5.push(M(5, "Среди предложенных формул и названий веществ подберите к каждой позиции, обозначенной буквой, вещество, которое ей соответствует.",
      cb.map(function (tg) { return T[tg]; }), cells.map(function (x) { return x.label; }), chosen.map(function (x) { return cells.indexOf(x); }),
      chosen.map(function (x, i) { return x.label + " — " + T[cb[i]]; }).join("; ") + "."));
  });
  add("c2-1", dedupe(K5).slice(0, 14));
})();
