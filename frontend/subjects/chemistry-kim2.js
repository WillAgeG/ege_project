/* Химия: задания части 1 в формате КИМ ЕГЭ-2027, номера 6–9 (неорганика: свойства веществ, генетическая связь).
   Подключается после chemistry-kim1.js (использует EGE.chemLib).
   Задания 7 и 8 собираются программой из таблиц «вещество — реагенты, которые реагируют и не реагируют» и «исходные вещества — продукты»:
   так верный ответ всегда однозначен (ни один другой набор не подходит). Таблицы проверены на противоречия при загрузке (см. консоль). */
(function () {
  var L = window.EGE && window.EGE.chemLib;
  var s = window.EGE && window.EGE.subjects && window.EGE.subjects.chem;
  if (!L || !s) return;
  var add = L.add, rng = L.rng, sample = L.sample, shuf = L.shuf, M = L.M;
  function dedupe(arr) { var seen = {}; return arr.filter(function (q) { if (!q) return false; var k = q.q + "|" + (q.o || q.l || q.a).join("|") + "|" + (q.r || []).join("|"); if (seen[k]) return false; return (seen[k] = true); }); }

  // ================= Задание 6: два вещества X и Y (осадок, газ, окраска) =================
  function X6(A, cond, opts, ix, iy, e) {
    return M(6, "Даны две пробирки с раствором " + A + ". В одну из них добавили раствор сильного электролита X, а в другую — раствор сильного электролита Y. В результате " + cond + ". Из предложенного перечня выберите вещества X и Y, которые могут вступать в описанные реакции.", ["X", "Y"], opts, [ix, iy], e);
  }
  var K6 = [
    X6("карбоната натрия", "в пробирке с веществом X выпал осадок, а в пробирке с веществом Y выделился газ", ["серная кислота", "хлорид бария", "нитрат калия", "гидроксид натрия", "сульфат натрия"], 1, 0, "Na₂CO₃ + BaCl₂ = BaCO₃↓ + 2NaCl; Na₂CO₃ + H₂SO₄ = Na₂SO₄ + CO₂↑ + H₂O. KNO₃, NaOH и Na₂SO₄ с карбонатом натрия не реагируют."),
    X6("сульфата меди(II)", "в пробирке с веществом X выпал осадок голубого цвета, а в пробирке с веществом Y — осадок чёрного цвета", ["гидроксид калия", "сульфид натрия", "хлорид бария", "хлороводород", "нитрат калия"], 0, 1, "CuSO₄ + 2KOH = Cu(OH)₂↓ (голубой) + K₂SO₄; CuSO₄ + Na₂S = CuS↓ (чёрный) + Na₂SO₄. BaCl₂ даёт белый осадок BaSO₄; HCl и KNO₃ не реагируют."),
    X6("хлорида аммония", "в пробирке с веществом X выпал белый осадок, а в пробирке с веществом Y при нагревании выделился газ с резким запахом", ["нитрат серебра", "гидроксид натрия", "нитрат калия", "сульфат натрия", "серная кислота"], 0, 1, "NH₄Cl + AgNO₃ = AgCl↓ + NH₄NO₃; NH₄Cl + NaOH =(t) NaCl + NH₃↑ + H₂O. Остальные вещества с NH₄Cl не реагируют."),
    X6("сульфита натрия", "в пробирке с веществом X выпал белый осадок, а в пробирке с веществом Y выделился газ с резким запахом", ["соляная кислота", "хлорид бария", "гидроксид калия", "нитрат натрия", "хлорид калия"], 1, 0, "Na₂SO₃ + BaCl₂ = BaSO₃↓ + 2NaCl; Na₂SO₃ + 2HCl = 2NaCl + SO₂↑ + H₂O. Остальные вещества с Na₂SO₃ не реагируют."),
    X6("карбоната калия", "в пробирке с веществом X выпал осадок, а в пробирке с веществом Y выделился газ", ["нитрат кальция", "азотная кислота", "хлорид натрия", "гидроксид калия", "сульфат калия"], 0, 1, "K₂CO₃ + Ca(NO₃)₂ = CaCO₃↓ + 2KNO₃; K₂CO₃ + 2HNO₃ = 2KNO₃ + CO₂↑ + H₂O."),
    X6("сульфида натрия", "в пробирке с веществом X выпал осадок чёрного цвета, а в пробирке с веществом Y выделился газ с запахом тухлых яиц", ["хлорид калия", "сульфат меди(II)", "соляная кислота", "гидроксид натрия", "нитрат бария"], 1, 2, "Na₂S + CuSO₄ = CuS↓ (чёрный) + Na₂SO₄; Na₂S + 2HCl = 2NaCl + H₂S↑ (запах тухлых яиц). BaS растворим, поэтому Ba(NO₃)₂ не даёт осадка."),
    X6("хлорида железа(III)", "в пробирке с веществом X выпал бурый осадок, а в пробирке с веществом Y раствор окрасился в кроваво-красный цвет", ["гидроксид калия", "роданид калия", "нитрат калия", "хлорид бария", "соляная кислота"], 0, 1, "FeCl₃ + 3KOH = Fe(OH)₃↓ (бурый) + 3KCl; FeCl₃ + 3KSCN = Fe(SCN)₃ (кроваво-красный) + 3KCl — качественная реакция на Fe³⁺."),
    X6("сульфата алюминия", "в пробирке с веществом X выпал осадок без выделения газа, а в пробирке с веществом Y выпал осадок и выделился газ", ["хлорид бария", "карбонат натрия", "азотная кислота", "нитрат калия", "хлорид натрия"], 0, 1, "Al₂(SO₄)₃ + 3BaCl₂ = 3BaSO₄↓ + 2AlCl₃; Al₂(SO₄)₃ + 3Na₂CO₃ + 3H₂O = 2Al(OH)₃↓ + 3CO₂↑ + 3Na₂SO₄ (совместный гидролиз)."),
    X6("нитрата серебра", "в пробирке с веществом X выпал белый творожистый осадок, а в пробирке с веществом Y — жёлтый осадок", ["хлорид калия", "иодид калия", "нитрат натрия", "нитрат магния", "азотная кислота"], 0, 1, "AgNO₃ + KCl = AgCl↓ (белый) + KNO₃; AgNO₃ + KI = AgI↓ (жёлтый) + KNO₃."),
    X6("гидроксида натрия", "в пробирке с веществом X выпал голубой осадок, а в пробирке с веществом Y при нагревании выделился газ", ["хлорид меди(II)", "сульфат аммония", "нитрат калия", "хлорид бария", "сульфат калия"], 0, 1, "2NaOH + CuCl₂ = Cu(OH)₂↓ + 2NaCl; 2NaOH + (NH₄)₂SO₄ =(t) Na₂SO₄ + 2NH₃↑ + 2H₂O. Остальные вещества со щёлочью не реагируют."),
    X6("соляной кислоты", "в пробирке с веществом X выделился газ, а в пробирке с веществом Y выпал осадок", ["карбонат натрия", "нитрат серебра", "нитрат калия", "сульфат натрия", "гидроксид калия"], 0, 1, "Na₂CO₃ + 2HCl = 2NaCl + CO₂↑ + H₂O; AgNO₃ + HCl = AgCl↓ + HNO₃. KOH реагирует без видимых признаков."),
    X6("разбавленной серной кислоты", "в пробирке с веществом X выпал белый осадок, а в пробирке с веществом Y выделился газ", ["хлорид бария", "карбонат калия", "нитрат калия", "хлорид натрия", "гидроксид калия"], 0, 1, "H₂SO₄ + BaCl₂ = BaSO₄↓ + 2HCl; H₂SO₄ + K₂CO₃ = K₂SO₄ + CO₂↑ + H₂O. KOH — нейтрализация без видимых признаков."),
    X6("хлорида бария", "в пробирке с веществом X выпал белый осадок, не растворяющийся в кислотах, а в пробирке с веществом Y — белый осадок, растворяющийся в кислотах с выделением газа", ["сульфат натрия", "карбонат натрия", "нитрат калия", "хлорид калия", "гидроксид натрия"], 0, 1, "BaCl₂ + Na₂SO₄ = BaSO₄↓ + 2NaCl (BaSO₄ не растворяется в кислотах); BaCl₂ + Na₂CO₃ = BaCO₃↓ + 2NaCl (BaCO₃ растворяется в кислотах с выделением CO₂).")
  ];
  add("c4-5", K6);

  // ================= Задание 7: вещество — набор реагентов =================
  var DB = {};
  function D(name, yes, no) {
    var y = {}, n = {};
    yes.split("; ").forEach(function (x) { if (x) y[x] = 1; });
    no.split("; ").forEach(function (x) { if (x) n[x] = 1; });
    DB[name] = { y: y, n: n };
  }
  D("Zn", "HCl (р-р); H₂SO₄ (разб.); NaOH (р-р); CuSO₄ (р-р); AgNO₃ (р-р); Cl₂; O₂; S; FeCl₂ (р-р); HNO₃ (конц.)", "MgSO₄ (р-р); Na₂SO₄ (р-р); KCl (р-р); NaCl (р-р); KNO₃ (р-р); Al₂O₃; MgO; CaO; N₂; H₂; CO₂; SiO₂");
  D("Al", "HCl (р-р); H₂SO₄ (разб.); NaOH (р-р); CuSO₄ (р-р); AgNO₃ (р-р); Fe₂O₃; Cl₂; O₂; S", "NaCl (р-р); KNO₃ (р-р); Na₂SO₄ (р-р); MgO; CaO; H₂; Al₂O₃");
  D("Cu", "Cl₂; O₂; S; HNO₃ (конц.); H₂SO₄ (конц.); AgNO₃ (р-р); FeCl₃ (р-р)", "HCl (р-р); H₂SO₄ (разб.); NaOH (р-р); ZnSO₄ (р-р); H₂; N₂; CO₂; NaCl (р-р); KNO₃ (р-р); Al₂O₃; MgSO₄ (р-р)");
  D("Fe", "HCl (р-р); H₂SO₄ (разб.); CuSO₄ (р-р); AgNO₃ (р-р); FeCl₃ (р-р); Cl₂; O₂; S", "NaOH (р-р); MgSO₄ (р-р); Na₂SO₄ (р-р); KCl (р-р); NaCl (р-р); Al₂O₃; H₂; N₂; CO₂; KNO₃ (р-р); ZnSO₄ (р-р)");
  D("Mg", "HCl (р-р); H₂SO₄ (разб.); CuSO₄ (р-р); AgNO₃ (р-р); O₂; Cl₂; S; N₂; CO₂", "NaOH (р-р); KCl (р-р); Na₂SO₄ (р-р); NaCl (р-р); KNO₃ (р-р); H₂; Al₂O₃");
  D("Cl₂", "H₂; Fe; Cu; Zn; Al; Mg; KBr (р-р); KI (р-р); NaOH (р-р); H₂O; P (красн.); S; FeCl₂ (р-р); Na₂SO₃ (р-р); NH₃", "O₂; N₂; HCl (р-р); KCl (р-р); NaCl (р-р); KF (р-р); CO₂; SiO₂; KNO₃ (р-р); Na₂SO₄ (р-р); Al₂O₃");
  D("O₂", "Cu; Fe; Mg; Zn; Al; S; P (красн.); C; H₂; NH₃; CO; SO₂", "Cl₂; CO₂; H₂O; HCl (р-р); NaCl (р-р); Na₂SO₄ (р-р); KCl (р-р); SiO₂; Al₂O₃; KNO₃ (р-р); CaO");
  D("S", "O₂; H₂; Fe; Zn; Cu; Al; Mg; Cl₂; HNO₃ (конц.); H₂SO₄ (конц.); C", "HCl (р-р); H₂O; N₂; CO₂; NaCl (р-р); SiO₂; KNO₃ (р-р); Na₂SO₄ (р-р); H₂SO₄ (разб.); Al₂O₃");
  D("P (красн.)", "O₂; Cl₂; Mg; Ca; S; HNO₃ (конц.); H₂SO₄ (конц.)", "HCl (р-р); H₂O; N₂; NaCl (р-р); Na₂SO₄ (р-р); KNO₃ (р-р); CO₂; H₂SO₄ (разб.); SiO₂");
  D("H₂", "O₂; Cl₂; N₂; S; CuO; Fe₂O₃", "H₂O; NaOH (р-р); HCl (р-р); CO₂; KCl (р-р); MgO; Al₂O₃; CaO; Na₂SO₄ (р-р); SiO₂");
  D("C", "O₂; CuO; Fe₂O₃; ZnO; CO₂; H₂SO₄ (конц.); HNO₃ (конц.); SiO₂; S", "HCl (р-р); NaOH (р-р); N₂; KCl (р-р); Na₂SO₄ (р-р); H₂SO₄ (разб.)");
  D("Al₂O₃", "HCl (р-р); H₂SO₄ (разб.); NaOH (р-р); KOH (р-р)", "H₂O; NaCl (р-р); KNO₃ (р-р); CO₂; SO₂; H₂; O₂; Cu; N₂; Cl₂; Na₂SO₄ (р-р)");
  D("ZnO", "HCl (р-р); H₂SO₄ (разб.); NaOH (р-р); KOH (р-р); C", "H₂O; NaCl (р-р); KNO₃ (р-р); Na₂SO₄ (р-р); O₂; N₂; Cu; CO₂; KCl (р-р)");
  D("CuO", "HCl (р-р); H₂SO₄ (разб.); HNO₃ (конц.); H₂; CO; C; NH₃; Al; Mg", "H₂O; NaOH (р-р); KCl (р-р); NaCl (р-р); Na₂SO₄ (р-р); O₂; N₂; CO₂; Cu; KNO₃ (р-р)");
  D("Fe₂O₃", "HCl (р-р); H₂SO₄ (разб.); HNO₃ (конц.); CO; H₂; C; Al; Mg", "H₂O; NaOH (р-р); KCl (р-р); NaCl (р-р); Na₂SO₄ (р-р); O₂; N₂; CO₂; Cu; KNO₃ (р-р)");
  D("CaO", "H₂O; HCl (р-р); H₂SO₄ (разб.); CO₂; SO₂; SiO₂; P₂O₅; HNO₃ (конц.)", "NaOH (р-р); KCl (р-р); NaCl (р-р); Na₂SO₄ (р-р); O₂; N₂; H₂; Cu; KNO₃ (р-р); MgO; CuO");
  D("SO₂", "H₂O; NaOH (р-р); KOH (р-р); CaO; O₂; Cl₂; H₂S; Ca(OH)₂ (р-р)", "HCl (р-р); CO; NaCl (р-р); KNO₃ (р-р); N₂; H₂SO₄ (разб.); SiO₂; CO₂");
  D("CO₂", "H₂O; NaOH (р-р); KOH (р-р); Ca(OH)₂ (р-р); CaO; Mg; C; Na₂CO₃ (р-р); NH₃", "HCl (р-р); O₂; N₂; KCl (р-р); H₂SO₄ (разб.); SiO₂; Cu; CO; SO₂; KNO₃ (р-р)");
  D("P₂O₅", "H₂O; NaOH (р-р); KOH (р-р); CaO; Ca(OH)₂ (р-р); NH₃", "HCl (р-р); O₂; N₂; SiO₂; CO₂; SO₂; KCl (р-р); H₂SO₄ (разб.); Cu; H₂; Na₂SO₄ (р-р)");
  D("SiO₂", "HF; CaO; C; Mg", "HCl (р-р); H₂SO₄ (разб.); H₂O; HNO₃ (конц.); O₂; N₂; CO₂; Cl₂; NaCl (р-р); Cu; KNO₃ (р-р); H₂; Na₂SO₄ (р-р)");
  D("NaOH (р-р)", "HCl (р-р); H₂SO₄ (разб.); CO₂; SO₂; Al; Zn; CuSO₄ (р-р); FeCl₃ (р-р); Cl₂; Al₂O₃; P₂O₅; Al(OH)₃; ZnO", "KOH (р-р); KCl (р-р); Na₂SO₄ (р-р); BaCl₂ (р-р); CuO; MgO; CaO; N₂; H₂; O₂; Cu; Fe; NaCl (р-р); CO; KNO₃ (р-р); Mg");
  D("HCl (р-р)", "Zn; Fe; Mg; Al; CaO; CuO; Fe₂O₃; Al₂O₃; ZnO; NaOH (р-р); Na₂CO₃ (р-р); AgNO₃ (р-р); NH₃; Ca(OH)₂ (р-р); Al(OH)₃", "Cu; SO₂; CO₂; SiO₂; KNO₃ (р-р); Na₂SO₄ (р-р); H₂SO₄ (разб.); NaCl (р-р); CO; N₂; H₂; O₂; S; Cl₂; P (красн.); BaCl₂ (р-р); CuSO₄ (р-р)");
  D("H₂SO₄ (разб.)", "Zn; Fe; Mg; Al; CuO; Fe₂O₃; Al₂O₃; ZnO; CaO; NaOH (р-р); Na₂CO₃ (р-р); BaCl₂ (р-р); NH₃; Ca(OH)₂ (р-р); Al(OH)₃", "Cu; SiO₂; CO₂; SO₂; KCl (р-р); NaCl (р-р); HCl (р-р); KNO₃ (р-р); N₂; H₂; O₂; S; C; Cl₂; P (красн.)");
  D("HNO₃ (конц.)", "Cu; Zn; Mg; S; P (красн.); C; CuO; Fe₂O₃; CaO; Al₂O₃; NaOH (р-р); NH₃; Na₂CO₃ (р-р); Ca(OH)₂ (р-р); Al(OH)₃", "SiO₂; CO₂; NaCl (р-р); KCl (р-р); Na₂SO₄ (р-р); N₂; H₂; O₂; Cl₂; CuSO₄ (р-р); BaCl₂ (р-р); KNO₃ (р-р)");
  D("Na₂CO₃ (р-р)", "HCl (р-р); H₂SO₄ (разб.); HNO₃ (конц.); CaCl₂ (р-р); BaCl₂ (р-р); AgNO₃ (р-р); CuSO₄ (р-р); FeCl₃ (р-р); CO₂; Ca(OH)₂ (р-р)", "NaOH (р-р); KOH (р-р); KCl (р-р); NaCl (р-р); NaNO₃ (р-р); Na₂SO₄ (р-р); KNO₃ (р-р); O₂; N₂; Cu; H₂");
  D("CuSO₄ (р-р)", "NaOH (р-р); Zn; Fe; Mg; Al; Na₂S (р-р); BaCl₂ (р-р); KI (р-р); Na₂CO₃ (р-р); NH₃ (р-р)", "HCl (р-р); KNO₃ (р-р); NaCl (р-р); Cu; SiO₂; CO₂; O₂; N₂; H₂; Na₂SO₄ (р-р); CuO");
  D("BaCl₂ (р-р)", "Na₂SO₄ (р-р); H₂SO₄ (разб.); AgNO₃ (р-р); Na₂CO₃ (р-р); CuSO₄ (р-р)", "HCl (р-р); NaOH (р-р); KNO₃ (р-р); NaCl (р-р); Cu; CuO; Zn; O₂; N₂; CO₂; SO₂");
  D("AgNO₃ (р-р)", "HCl (р-р); NaCl (р-р); KBr (р-р); KI (р-р); Na₂CO₃ (р-р); BaCl₂ (р-р); Cu; Zn; Fe; Mg; Al; NaOH (р-р); NH₃ (р-р)", "KNO₃ (р-р); NaNO₃ (р-р); HNO₃ (конц.); O₂; N₂; H₂; CO₂; SiO₂");
  D("FeCl₃ (р-р)", "NaOH (р-р); Fe; Cu; Zn; Mg; Al; KI (р-р); AgNO₃ (р-р); Na₂CO₃ (р-р); NH₃ (р-р); Na₂S (р-р)", "HCl (р-р); KNO₃ (р-р); NaCl (р-р); BaCl₂ (р-р); SiO₂; CO₂; O₂; N₂; H₂; Na₂SO₄ (р-р)");
  D("NH₃", "HCl (р-р); H₂SO₄ (разб.); HNO₃ (конц.); O₂; CuO; Cl₂; CO₂; CuSO₄ (р-р)", "NaOH (р-р); N₂; KCl (р-р); Na₂SO₄ (р-р); CO; H₂; NaCl (р-р); KNO₃ (р-р); SiO₂");
  D("Ca(OH)₂ (р-р)", "HCl (р-р); H₂SO₄ (разб.); HNO₃ (конц.); CO₂; SO₂; P₂O₅; Na₂CO₃ (р-р); CuSO₄ (р-р); Cl₂", "NaOH (р-р); KOH (р-р); KCl (р-р); NaCl (р-р); CaO; N₂; O₂; H₂; CuO; KNO₃ (р-р); Cu");
  D("Al(OH)₃", "HCl (р-р); H₂SO₄ (разб.); HNO₃ (конц.); NaOH (р-р); KOH (р-р)", "H₂O; NaCl (р-р); KNO₃ (р-р); Na₂SO₄ (р-р); CO₂; O₂; N₂; Cu; SiO₂; KCl (р-р); H₂; CO");
  // проверка таблиц: одна и та же пара не может быть и «реагирует», и «не реагирует»
  var conflicts = [];
  function st(a, b) {
    var A = DB[a], s1 = A.y[b] ? 1 : A.n[b] ? -1 : 0, B = DB[b], s2 = 0;
    if (B) s2 = B.y[a] ? 1 : B.n[a] ? -1 : 0;
    if (s1 && s2 && s1 !== s2) { conflicts.push(a + " / " + b); return 0; }
    return s1 || s2;
  }
  Object.keys(DB).forEach(function (a) { Object.keys(DB[a].y).concat(Object.keys(DB[a].n)).forEach(function (b) { if (DB[b]) st(a, b); }); });
  if (conflicts.length) console.warn("Химия, задание 7: противоречия в таблице реагентов:\n" + conflicts.join("\n"));

  var SUBS = Object.keys(DB);
  var LET = ["А", "Б", "В", "Г"];
  function genReact(seed) {
    var r = rng(seed), subs = sample(r, SUBS, 4), i, j, t;
    // реагенты не должны совпадать с веществами задания
    var sets = [];
    for (i = 0; i < 4; i++) {
      var cand = Object.keys(DB[subs[i]].y).filter(function (x) { return subs.indexOf(x) < 0; }), found = null;
      for (t = 0; t < 400 && !found; t++) {
        var tri = sample(r, cand, 3);
        if (tri.length < 3) break;
        var ok = true;
        for (j = 0; j < 4 && ok; j++) if (j !== i && !tri.some(function (x) { return st(subs[j], x) === -1; })) ok = false;
        if (ok) found = tri;
      }
      if (!found) return null;
      sets.push(found);
    }
    // лишний набор: ни одно из веществ не реагирует со всеми тремя
    var pool = {};
    subs.forEach(function (x) { Object.keys(DB[x].y).concat(Object.keys(DB[x].n)).forEach(function (y) { if (subs.indexOf(y) < 0) pool[y] = 1; }); });
    var poolArr = Object.keys(pool), decoy = null;
    for (t = 0; t < 600 && !decoy; t++) {
      var d3 = sample(r, poolArr, 3), ok2 = true;
      for (j = 0; j < 4 && ok2; j++) if (!d3.some(function (x) { return st(subs[j], x) === -1; })) ok2 = false;
      if (ok2) decoy = d3;
    }
    if (!decoy) return null;
    var all = sets.concat([decoy]), order = shuf(r, [0, 1, 2, 3, 4]);
    var right = order.map(function (k) { return all[k].join(", "); });
    var a = [0, 1, 2, 3].map(function (k) { return order.indexOf(k); });
    var names = subs.map(function (x) { return x; });
    if (new Set(right).size !== 5) return null;
    return M(7, "Установите соответствие между веществом и реагентами, с каждым из которых это вещество может взаимодействовать: к каждой позиции, обозначенной буквой, подберите соответствующую позицию, обозначенную цифрой.", names, right, a,
      subs.map(function (x, k) { return x + " реагирует с каждым из веществ: " + sets[k].join(", "); }).join(". ") + ". Пятый набор не подходит ни одному веществу: " + decoy.map(function (x) {
        var bad = subs.filter(function (sb) { return st(sb, x) === -1; }); return bad.length ? x + " не реагирует с " + bad.join(", ") : "";
      }).filter(Boolean).join("; ") + ".");
  }
  var K7 = [], sd = 7000;
  while (K7.length < 16 && sd < 7400) { var qq = genReact(sd++); if (qq) K7.push(qq); }
  K7 = dedupe(K7);
  // задания распределяются по темам, где обсуждаются вещества
  var k7metals = [], k7other = [];
  K7.forEach(function (q) { (/^(Zn|Al|Cu|Fe|Mg|CuO|Fe₂O₃|ZnO|Al₂O₃)/.test(q.l.join(" ")) ? k7metals : k7other).push(q); });
  add("c2-2", k7metals);
  add("c2-3", k7other);

  // ================= Задание 8: исходные вещества — продукты =================
  var RX = [
    ["Cl₂ и KOH (р-р, на холоду)", "KCl, KClO и H₂O"], ["Cl₂ и KOH (р-р, t°)", "KCl, KClO₃ и H₂O"], ["Cl₂ и Ca(OH)₂ (суспензия)", "CaCl₂, Ca(ClO)₂ и H₂O"],
    ["HCl (конц.) и MnO₂ (t°)", "MnCl₂, Cl₂ и H₂O"], ["HCl (конц.) и KMnO₄", "KCl, MnCl₂, Cl₂ и H₂O"], ["HCl (конц.) и K₂Cr₂O₇", "KCl, CrCl₃, Cl₂ и H₂O"],
    ["H₂S и O₂ (недостаток)", "S и H₂O"], ["H₂S и O₂ (избыток)", "SO₂ и H₂O"], ["SO₂ и Br₂ (р-р)", "H₂SO₄ и HBr"], ["SO₂ и NaOH (избыток)", "Na₂SO₃ и H₂O"],
    ["Cu и H₂SO₄ (конц., t°)", "CuSO₄, SO₂ и H₂O"], ["Cu и HNO₃ (конц.)", "Cu(NO₃)₂, NO₂ и H₂O"], ["Cu и HNO₃ (разб.)", "Cu(NO₃)₂, NO и H₂O"], ["Zn и HNO₃ (очень разб.)", "Zn(NO₃)₂, NH₄NO₃ и H₂O"],
    ["Fe и HCl", "FeCl₂ и H₂"], ["Fe и Cl₂", "FeCl₃"], ["Fe и H₂SO₄ (конц., t°)", "Fe₂(SO₄)₃, SO₂ и H₂O"], ["Al, NaOH (р-р) и H₂O", "Na[Al(OH)₄] и H₂"], ["Zn, NaOH (р-р) и H₂O", "Na₂[Zn(OH)₄] и H₂"],
    ["Al₂O₃ и NaOH (сплавление)", "NaAlO₂ и H₂O"], ["Al₂O₃, NaOH (р-р) и H₂O", "Na[Al(OH)₄]"], ["Na₂O₂ и CO₂", "Na₂CO₃ и O₂"], ["Na₂O₂ и H₂O", "NaOH и O₂"],
    ["NO₂ и H₂O", "HNO₃ и NO"], ["NO₂ и NaOH (р-р)", "NaNO₂, NaNO₃ и H₂O"], ["NH₃ и O₂ (Pt, t°)", "NO и H₂O"], ["NH₃ и O₂ (горение)", "N₂ и H₂O"],
    ["NH₄Cl и NaOH (t°)", "NaCl, NH₃ и H₂O"], ["NH₄NO₃ (t°, ≈ 200 °C)", "N₂O и H₂O"], ["Cu(NO₃)₂ (t°)", "CuO, NO₂ и O₂"], ["KNO₃ (t°)", "KNO₂ и O₂"], ["AgNO₃ (t°)", "Ag, NO₂ и O₂"],
    ["KClO₃ (t°, MnO₂)", "KCl и O₂"], ["KMnO₄ (t°)", "K₂MnO₄, MnO₂ и O₂"], ["CaC₂ и H₂O", "Ca(OH)₂ и C₂H₂"], ["Al₄C₃ и H₂O", "Al(OH)₃ и CH₄"], ["Mg₃N₂ и H₂O", "Mg(OH)₂ и NH₃"],
    ["Ca₃P₂ и HCl", "CaCl₂ и PH₃"], ["Mg и CO₂ (t°)", "MgO и C"], ["Mg и SiO₂ (t°)", "MgO и Si"], ["SiO₂ и NaOH (сплавление)", "Na₂SiO₃ и H₂O"], ["SiO₂ и HF", "SiF₄ и H₂O"],
    ["Si, NaOH (р-р) и H₂O", "Na₂SiO₃ и H₂"], ["Fe₂O₃ и CO (t°)", "Fe и CO₂"], ["Fe₂O₃ и Al (t°)", "Al₂O₃ и Fe"], ["Cr₂O₃ и KOH (сплавление)", "KCrO₂ и H₂O"],
    ["CrCl₃ и NaOH (р-р, избыток)", "Na₃[Cr(OH)₆] и NaCl"], ["FeCl₃ и KI", "FeCl₂, I₂ и KCl"], ["FeCl₃, Na₂CO₃ (р-р) и H₂O", "Fe(OH)₃, CO₂ и NaCl"], ["CuSO₄ и KI", "CuI, I₂ и K₂SO₄"],
    ["Na₂S₂O₃ и HCl", "NaCl, S, SO₂ и H₂O"], ["P (красный) и HNO₃ (конц.)", "H₃PO₄, NO₂ и H₂O"], ["S и HNO₃ (конц.)", "H₂SO₄, NO₂ и H₂O"], ["C и H₂SO₄ (конц., t°)", "CO₂, SO₂ и H₂O"],
    ["Cl₂ и H₂O", "HCl и HClO"], ["F₂ и H₂O", "HF и O₂"], ["NaCl (тв.) и H₂SO₄ (конц.)", "NaHSO₄ и HCl"], ["NaBr (тв.) и H₂SO₄ (конц.)", "Br₂, SO₂, Na₂SO₄ и H₂O"], ["Ca и N₂", "Ca₃N₂"]
  ];
  var K8 = [], sd8 = 8000;
  while (K8.length < 16 && sd8 < 8400) {
    var r8 = rng(sd8++), pick = sample(r8, RX, 4), prods = pick.map(function (x) { return x[1]; });
    if (new Set(prods).size < 4) continue;
    var dec = sample(r8, RX.filter(function (x) { return prods.indexOf(x[1]) < 0; }), 2).map(function (x) { return x[1]; });
    var right8 = shuf(r8, prods.concat(dec));
    K8.push(M(8, "Установите соответствие между исходными веществами, вступающими в реакцию, и продуктами этой реакции: к каждой позиции, обозначенной буквой, подберите соответствующую позицию, обозначенную цифрой.",
      pick.map(function (x) { return x[0]; }), right8, prods.map(function (p) { return right8.indexOf(p); }),
      pick.map(function (x) { return x[0] + " → " + x[1]; }).join("; ") + "."));
  }
  K8 = dedupe(K8);
  add("c2-4", K8.slice(0, 8));
  add("c2-3", K8.slice(8));

  // ================= Задание 9: генетическая связь неорганических веществ =================
  function CH(scheme, kind, opts, ix, iy, e) {
    var text = kind === "rr" ? "Задана схема превращений веществ: " + scheme + ". X и Y — реагенты, которые записаны над стрелками." :
      "Задана схема превращений веществ: " + scheme + ". X — вещество, образующееся на первой стадии, Y — реагент второй стадии.";
    return M(9, text + " Определите, какие из указанных веществ являются веществами X и Y.", ["X", "Y"], opts, [ix, iy], e);
  }
  var K9 = [
    CH("Cu —X→ CuSO₄ —Y→ Cu(OH)₂", "rr", ["H₂SO₄ (конц.)", "NaOH (р-р)", "HCl (р-р)", "KNO₃ (р-р)", "NaCl (р-р)"], 0, 1, "Cu + 2H₂SO₄ (конц.) =(t) CuSO₄ + SO₂ + 2H₂O; CuSO₄ + 2NaOH = Cu(OH)₂↓ + Na₂SO₄. Медь с HCl и разбавленной кислотой не реагирует."),
    CH("Fe —X→ FeCl₃ —Y→ Fe(OH)₃", "rr", ["Cl₂", "HCl (р-р)", "KOH (р-р)", "H₂SO₄ (разб.)", "NaCl (р-р)"], 0, 2, "2Fe + 3Cl₂ = 2FeCl₃; FeCl₃ + 3KOH = Fe(OH)₃↓ + 3KCl. С HCl железо даёт FeCl₂."),
    CH("Al —X→ Na[Al(OH)₄] —Y→ Al(OH)₃", "rr", ["NaOH (р-р)", "CO₂", "HCl (избыток)", "NaCl (р-р)", "H₂"], 0, 1, "2Al + 2NaOH + 6H₂O = 2Na[Al(OH)₄] + 3H₂↑; Na[Al(OH)₄] + CO₂ = Al(OH)₃↓ + NaHCO₃. Избыток HCl растворил бы осадок."),
    CH("S —X→ SO₂ —Y→ Na₂SO₃", "rr", ["O₂", "NaOH (р-р)", "H₂", "HCl (р-р)", "NaCl (р-р)"], 0, 1, "S + O₂ = SO₂; SO₂ + 2NaOH = Na₂SO₃ + H₂O. С водородом сера даёт H₂S."),
    CH("N₂ —X→ NH₃ —Y→ NH₄Cl", "rr", ["H₂ (кат., t°, p)", "O₂", "HCl (р-р)", "NaOH (р-р)", "Cl₂"], 0, 2, "N₂ + 3H₂ ⇌ 2NH₃; NH₃ + HCl = NH₄Cl."),
    CH("Zn —X→ ZnO —Y→ Na₂[Zn(OH)₄]", "rr", ["O₂", "NaOH (р-р)", "HCl (р-р)", "H₂", "CO₂"], 0, 1, "2Zn + O₂ = 2ZnO; ZnO + 2NaOH + H₂O = Na₂[Zn(OH)₄]. С HCl получился бы ZnCl₂."),
    CH("CaCO₃ —t°→ X —Y→ Ca(OH)₂", "xy", ["CaO", "H₂O", "CO₂", "HCl (р-р)", "Ca(HCO₃)₂"], 0, 1, "CaCO₃ =(t) CaO + CO₂; CaO + H₂O = Ca(OH)₂. X — CaO, Y — вода."),
    CH("Na —X→ Na₂O₂ —Y→ Na₂CO₃", "rr", ["O₂", "CO₂", "H₂O", "N₂", "HCl (р-р)"], 0, 1, "2Na + O₂ = Na₂O₂; 2Na₂O₂ + 2CO₂ = 2Na₂CO₃ + O₂. С водой пероксид даёт NaOH."),
    CH("Mg —X→ Mg₃N₂ —Y→ Mg(OH)₂", "rr", ["N₂", "H₂O", "O₂", "NaOH (р-р)", "HCl (р-р)"], 0, 1, "3Mg + N₂ = Mg₃N₂; Mg₃N₂ + 6H₂O = 3Mg(OH)₂ + 2NH₃↑. С HCl нитрид даёт соли магния и аммония."),
    CH("P —X→ P₂O₅ —Y→ H₃PO₄", "rr", ["O₂ (избыток)", "H₂O (t°)", "NaOH (р-р)", "H₂", "HCl (р-р)"], 0, 1, "4P + 5O₂ = 2P₂O₅; P₂O₅ + 3H₂O =(t) 2H₃PO₄. NaOH даёт соль."),
    CH("CuO —X→ CuCl₂ —Y→ Cu(OH)₂", "rr", ["HCl (р-р)", "NaOH (р-р)", "H₂", "NaCl (р-р)", "H₂O"], 0, 1, "CuO + 2HCl = CuCl₂ + H₂O; CuCl₂ + 2NaOH = Cu(OH)₂↓ + 2NaCl."),
    CH("FeS —X→ H₂S —Y→ S", "rr", ["HCl (р-р)", "O₂ (недостаток)", "NaOH (р-р)", "H₂", "N₂"], 0, 1, "FeS + 2HCl = FeCl₂ + H₂S↑; 2H₂S + O₂ = 2S + 2H₂O. NaOH дал бы NaHS или Na₂S."),
    CH("NH₄Cl —X→ NH₃ —Y→ NO", "rr", ["NaOH (t°)", "O₂ (Pt, t°)", "HCl (р-р)", "H₂", "N₂"], 0, 1, "NH₄Cl + NaOH =(t) NaCl + NH₃↑ + H₂O; 4NH₃ + 5O₂ =(Pt) 4NO + 6H₂O.")
  ];
  add("c2-5", K9);
})();
