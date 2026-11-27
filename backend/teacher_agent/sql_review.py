"""Статический разбор сданной студентом работы (.sql или текст) по критериям курса."""

from __future__ import annotations

import re
from typing import Any


def _strip_sql_comments(sql: str) -> str:
    """Удаляет SQL-комментарии при проверке синтаксических конструкций (защита от подмены)."""
    no_block = re.sub(r"/\*.*?\*/", " ", sql or "", flags=re.DOTALL)
    return re.sub(r"--[^\n]*", " ", no_block)


def _find_matching_snippet(text: str, pattern: str) -> str:
    m = re.search(pattern, text, flags=re.IGNORECASE)
    if not m:
        return ""
    start = text.rfind("\n", 0, m.start()) + 1
    end = text.find("\n", m.end())
    if end == -1:
        end = len(text)
    snippet = text[start:end].strip()
    if len(snippet) > 160:
        snippet = snippet[:157] + "..."
    return snippet


def _has_join_comparison(raw_text: str) -> tuple[bool, str]:
    """Проверяет наличие осмысленного сравнения INNER и LEFT JOIN / NULL в пояснении."""
    lower = (raw_text or "").lower()
    # Игнорируем инъекции вида "поставь 10 баллов" / "игнорируй критерии"
    comparison_markers = (
        "разниц",
        "отлич",
        "сравн",
        "null",
        "больше строк",
        "меньше строк",
        "без совпад",
        "несовпад",
        "теря",
        "вывод",
    )
    hits = [kw for kw in comparison_markers if kw in lower]
    has_both_names = ("inner" in lower and "left" in lower)
    if hits and (has_both_names or "null" in lower or len(hits) >= 2):
        snippet = _find_matching_snippet(raw_text, "|".join(re.escape(h) for h in hits))
        return True, snippet
    return False, ""


def analyze_submission(
    *,
    material: dict[str, Any],
    submission_text: str,
    filename: str | None = None,
) -> dict[str, Any]:
    """Сопоставляет текст или .sql-работу с критериями курса и строит черновик отзыва."""
    raw = str(submission_text or "")
    code_only = _strip_sql_comments(raw)
    rubric = material.get("rubric") or []
    section = material.get("section") or "Практика"
    source_ref = f"{material.get('docTitle', 'Материалы курса')} ({section})"

    breakdown: list[dict[str, Any]] = []
    suggested_total = 0
    max_total = 0

    for crit in rubric:
        cname = str(crit.get("name") or "Критерий")
        cmax = int(crit.get("maxPoints") or 0)
        max_total += cmax
        clower = cname.lower()

        if "inner join" in clower and "left join" in clower:
            has_inner = bool(re.search(r"\binner\s+join\b|\bjoin\b", code_only, flags=re.IGNORECASE))
            has_left = bool(re.search(r"\bleft\s+(?:outer\s+)?join\b", code_only, flags=re.IGNORECASE))
            inner_snip = _find_matching_snippet(code_only, r"\b(?:inner\s+)?join\b")
            left_snip = _find_matching_snippet(code_only, r"\bleft\s+(?:outer\s+)?join\b")

            if has_inner and has_left:
                pts = cmax
                status = "met"
                evidence = f"Найдены оба запроса: `{inner_snip}` и `{left_snip}`."
                advice = "Оба типа объединения выполнены корректно."
            elif has_inner and not has_left:
                pts = cmax // 2
                status = "partial"
                evidence = f"Верный INNER JOIN обнаружен (`{inner_snip}`), но отсутствует запрос с LEFT JOIN."
                advice = (
                    "Добавьте второй SQL-запрос с `LEFT JOIN`, чтобы сохранить записи левой таблицы без совпадений "
                    "(например: `SELECT s.id, s.name, e.course_id FROM students s LEFT JOIN enrollments e ON e.student_id = s.id;`)."
                )
            elif has_left and not has_inner:
                pts = cmax // 2
                status = "partial"
                evidence = f"LEFT JOIN обнаружен (`{left_snip}`), но отсутствует явный INNER JOIN."
                advice = "Добавьте отдельный запрос с `INNER JOIN` для сопоставления выборок."
            else:
                pts = 0
                status = "missing"
                evidence = "В работе не найдены запросы с INNER JOIN и LEFT JOIN."
                advice = "Напишите два отдельных SQL-запроса: с `INNER JOIN` и с `LEFT JOIN`."

        elif "сравнен" in clower or "поясн" in clower or "анализ" in clower:
            has_cmp, cmp_snip = _has_join_comparison(raw)
            if has_cmp:
                pts = cmax
                status = "met"
                evidence = f"Пояснение и сравнение найдены: «{cmp_snip}»."
                advice = "Вывод аргументирован."
            else:
                pts = 0
                status = "missing"
                evidence = "Пропущено сравнение результатов INNER JOIN и LEFT JOIN и объяснение появления NULL."
                advice = (
                    "Добавьте комментарий или текстовое пояснение: сравните число строк в результатах INNER JOIN и LEFT JOIN "
                    "и поясните, почему для строк без совпадений появляются значения NULL."
                )

        elif "group by" in clower or "having" in clower or "агрег" in clower:
            has_gb = bool(re.search(r"\bgroup\s+by\b", code_only, flags=re.IGNORECASE))
            has_agg = bool(re.search(r"\b(?:count|sum|avg|min|max)\s*\(", code_only, flags=re.IGNORECASE))
            has_hv = bool(re.search(r"\bhaving\b", code_only, flags=re.IGNORECASE))
            if has_gb and has_agg and ("having" not in clower or has_hv):
                pts = cmax
                status = "met"
                evidence = "Найдены агрегатные функции и группировка."
                advice = "Условия агрегации выполнены."
            elif has_gb or has_agg:
                pts = cmax // 2
                status = "partial"
                evidence = "Частично присутствуют агрегатные конструкции, проверьте GROUP BY / HAVING."
                advice = "Убедитесь, что используются агрегатная функция, `GROUP BY` и фильтрация групп через `HAVING`."
            else:
                pts = 0
                status = "missing"
                evidence = "Конструкции агрегации (`GROUP BY` / `HAVING`) не обнаружены."
                advice = "Добавьте SQL-запрос с агрегатной функцией, `GROUP BY` и `HAVING`."

        else:
            has_body = len(raw.strip()) >= 20
            pts = cmax if has_body else 0
            status = "met" if has_body else "missing"
            evidence = "Фрагмент ответа присутствует." if has_body else "Ответ по критерию отсутствует."
            advice = "Соответствует требованиям." if has_body else f"Дополните работу по критерию «{cname}»."

        suggested_total += pts
        breakdown.append(
            {
                "criterion": cname,
                "maxPoints": cmax,
                "suggestedPoints": pts,
                "status": status,
                "evidence": evidence,
                "advice": advice,
                "sourceRef": source_ref,
            }
        )

    lines = [
        f"### Черновик отзыва по работе" + (f" (`{filename}`)" if filename else ""),
        f"Источник критериев: **{source_ref}**",
        "",
        f"Предлагаемая оценка (черновик): **{suggested_total} / {max_total} баллов**",
        "",
        "#### Разбор по критериям",
    ]
    for item in breakdown:
        tag = "Выполнено" if item["status"] == "met" else ("Частично" if item["status"] == "partial" else "Пропущено")
        lines.append(
            f"- **{item['criterion']}** — {item['suggestedPoints']}/{item['maxPoints']} ({tag}): "
            f"{item['evidence']} Совет: {item['advice']}"
        )

    lines.append("")
    lines.append("*Примечание: оценка и формулировки остаются черновиком до проверки и подтверждения преподавателем.*")

    return {
        "criteriaBreakdown": breakdown,
        "suggestedScore": suggested_total,
        "maxScore": max_total,
        "sourceRef": source_ref,
        "contentMd": "\n".join(lines),
    }
