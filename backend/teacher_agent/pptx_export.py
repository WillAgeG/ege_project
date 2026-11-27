"""Генератор редактируемых презентаций PowerPoint (.pptx) по материалам курса и плану занятия."""

from __future__ import annotations

from pathlib import Path
from typing import Any
import uuid

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt

from .store import TeacherAgentStore

_NAVY = RGBColor(0x0B, 0x25, 0x45)
_BLUE = RGBColor(0x00, 0x70, 0xFF)
_INK = RGBColor(0x14, 0x15, 0x17)
_MUTED = RGBColor(0x52, 0x5B, 0x6C)
_SOFT_BG = RGBColor(0xF4, 0xF7, 0xFB)
_WHITE = RGBColor(0xFF, 0xFF, 0xFF)


def _add_header_band(slide: Any, kicker: str, title: str) -> None:
    top_bar = slide.shapes.add_shape(1, Inches(0), Inches(0), Inches(13.333), Inches(0.14))
    top_bar.fill.solid()
    top_bar.fill.fore_color.rgb = _BLUE
    top_bar.line.fill.background()

    kicker_box = slide.shapes.add_textbox(Inches(0.75), Inches(0.32), Inches(11.8), Inches(0.35))
    ktf = kicker_box.text_frame
    ktf.word_wrap = True
    kp = ktf.paragraphs[0]
    kp.text = kicker
    kp.font.size = Pt(12)
    kp.font.bold = True
    kp.font.color.rgb = _BLUE

    title_box = slide.shapes.add_textbox(Inches(0.75), Inches(0.68), Inches(11.8), Inches(0.72))
    ttf = title_box.text_frame
    ttf.word_wrap = True
    tp = ttf.paragraphs[0]
    tp.text = title
    tp.font.size = Pt(28)
    tp.font.bold = True
    tp.font.color.rgb = _NAVY


def _add_footer(slide: Any, text: str) -> None:
    box = slide.shapes.add_textbox(Inches(0.75), Inches(6.92), Inches(11.8), Inches(0.4))
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(11)
    p.font.color.rgb = _MUTED


def _add_bullets(slide: Any, lines: list[str], *, top_in: float = 1.65, font_size: int = 18, mono: bool = False) -> None:
    box = slide.shapes.add_textbox(Inches(0.75), Inches(top_in), Inches(11.8), Inches(5.0))
    tf = box.text_frame
    tf.word_wrap = True
    clean = [str(x).strip() for x in lines if str(x).strip()] or ["Материал не указан"]
    for idx, line in enumerate(clean):
        p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
        p.text = line
        p.space_after = Pt(10)
        p.font.size = Pt(font_size)
        if mono:
            p.font.name = "Consolas"
        p.font.color.rgb = _INK


def _default_slides_from_context(
    *,
    course: dict[str, Any],
    group_name: str,
    topic: str,
    lesson: dict[str, Any] | None,
    materials: list[dict[str, Any]],
    draft: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    primary_mat = materials[0] if materials else None
    source_label = (
        f"{primary_mat['docTitle']} — {primary_mat['section']}"
        if primary_mat
        else f"Курс «{course['title']}»"
    )

    date_room = ""
    if lesson:
        date_room = f"{lesson['dateIso']} · {lesson['startTime']}–{lesson['endTime']} ({lesson['durationMin']} мин) · {lesson['room']}"

    # Слайд 1: Титульный
    slide1 = {
        "kicker": f"{course['title']} · Группа {group_name}",
        "title": f"{topic}: практическое занятие",
        "bullets": [
            f"Дисциплина: {course['title']} ({course['code']})",
            f"Учебная группа: {group_name}",
            *( [f"Расписание: {date_room}"] if date_room else [] ),
            f"Базовый источник: {source_label}",
        ],
        "footer": f"Источники: {source_label}",
    }

    # Слайд 2: Цели и план занятия (90 минут)
    plan_items = (draft or {}).get("plan") or []
    if plan_items:
        plan_lines = [
            f"• {step.get('stage', 'Этап')} — {step.get('minutes', 0)} мин: {step.get('activity', '')}"
            for step in plan_items
        ]
    else:
        plan_lines = [
            "• Введение и актуализация схемы таблиц — 15 мин",
            "• Разбор теории и живые примеры SQL-запросов — 25 мин",
            "• Практическая работа студентов на стенде — 40 мин",
            "• Разбор типовых ошибок и постановка ДЗ — 10 мин",
        ]
    slide2 = {
        "kicker": "Цели и структура пары (90 минут)",
        "title": f"Цели занятия и план по теме «{topic}»",
        "bullets": [
            f"Цель: научиться применять {topic} для объединения таблиц и анализа несовпадений.",
            "План занятия:",
            *plan_lines,
        ],
        "footer": f"Источник плана: {source_label}",
    }

    # Слайд 3: Объяснение темы с примером
    is_join = "join" in topic.lower()
    example_lines = (
        [
            "Ключевая разница INNER JOIN и LEFT JOIN:",
            "• INNER JOIN оставляет только строки с совпадением ключа в обеих таблицах.",
            "• LEFT JOIN сохраняет все строки левой таблицы (при отсутствии пары справа — NULL).",
            "Пример SQL:",
            "SELECT s.name, e.course_id FROM students s",
            "LEFT JOIN enrollments e ON e.student_id = s.id;",
        ]
        if is_join
        else [
            f"Ключевые понятия темы «{topic}»:",
            "• Проверьте условия группировки и выборки до агрегации (WHERE vs HAVING).",
            "Пример SQL:",
            "SELECT group_name, COUNT(*) FROM students GROUP BY group_name HAVING COUNT(*) >= 5;",
        ]
    )
    slide3 = {
        "kicker": "Теория и пример",
        "title": f"Разбор темы «{topic}» на практике",
        "bullets": example_lines,
        "footer": f"Источник теории: {source_label}",
        "mono": False,
    }

    # Слайд 4: Практическое задание и шкала оценивания
    rubric = (draft or {}).get("criteria") or (primary_mat or {}).get("rubric") or []
    scale_parts = [f"{int(c.get('maxPoints', 0))} ({c.get('name', 'Критерий')})" for c in rubric]
    scale_text = " + ".join(str(int(c.get("maxPoints", 0))) for c in rubric) if rubric else "по критериям курса"
    deliverable = (primary_mat or {}).get("deliverableFormat") or "согласно методическим указаниям"
    deadline_text = (draft or {}).get("deadline") or (primary_mat or {}).get("deadline") or "не задан в методичке (уточняется преподавателем)"
    slide4 = {
        "kicker": f"Практическое задание · {primary_mat['section'] if primary_mat else topic}",
        "title": "Задание для группы и критерии проверки",
        "bullets": [
            f"Формат сдачи: {deliverable}.",
            f"Шкала оценивания ({scale_text}): " + ("; ".join(scale_parts) if scale_parts else "уточняется в курсе."),
            f"Срок сдачи: {deadline_text}.",
            *( [f"Черновик задания: {(draft or {}).get('title', '')}"] if draft else [] ),
        ],
        "footer": f"Критерии и требования: {source_label}",
    }

    # Слайд 5: Источники и методические заметки
    source_lines = [
        f"• {m['docTitle']} ({m['section']}) — {m['title']}"
        for m in materials
    ] or [f"• {source_label}"]
    proposals = (draft or {}).get("proposals") or [
        "Предложение преподавателю: задать конкретный срок сдачи перед публикацией задания."
    ]
    slide5 = {
        "kicker": "Трассировка источников",
        "title": "Использованные материалы курса и предложения",
        "bullets": [
            "Подтверждённые источники курса:",
            *source_lines,
            "Предложения для преподавателя:",
            *[f"• {p}" for p in proposals],
        ],
        "footer": f"Сгенерировано с редактируемым текстом · Источники: {', '.join(m['section'] for m in materials) or source_label}",
    }

    return [slide1, slide2, slide3, slide4, slide5]


def build_presentation_pptx(
    *,
    store: TeacherAgentStore,
    presentations_dir: Path,
    course: dict[str, Any],
    group_name: str,
    topic: str,
    lesson: dict[str, Any] | None = None,
    materials: list[dict[str, Any]] = (),
    draft: dict[str, Any] | None = None,
    slides_spec: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Собирает редактируемый PPTX-файл, сохраняет на диск и регистрирует в БД."""
    pres_dir = Path(presentations_dir)
    pres_dir.mkdir(parents=True, exist_ok=True)
    pres_id = f"pptx-{uuid.uuid4().hex[:8]}"
    filename = f"{course['id']}_{pres_id}.pptx"
    file_path = pres_dir / filename

    mat_list = [m for m in materials if not m.get("isInjectionDoc")]
    sources = [
        {
            "docId": m["docId"],
            "docTitle": m["docTitle"],
            "section": m["section"],
            "title": m["title"],
        }
        for m in mat_list
    ]

    if slides_spec and isinstance(slides_spec, list):
        slides_data = [
            {
                "kicker": str(s.get("kicker") or f"{course['title']} · {group_name}"),
                "title": str(s.get("title") or topic),
                "bullets": [str(b) for b in (s.get("bullets") or [])],
                "footer": str(s.get("footer") or (f"Источник: {mat_list[0]['section']}" if mat_list else course["title"])),
            }
            for s in slides_spec
        ]
    else:
        slides_data = _default_slides_from_context(
            course=course,
            group_name=group_name,
            topic=topic,
            lesson=lesson,
            materials=mat_list,
            draft=draft,
        )

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    for idx, sdata in enumerate(slides_data):
        slide = prs.slides.add_slide(blank_layout)
        bg = slide.background
        fill = bg.fill
        fill.solid()
        fill.fore_color.rgb = _SOFT_BG if idx == 0 else _WHITE
        _add_header_band(slide, sdata["kicker"], sdata["title"])
        _add_bullets(slide, sdata.get("bullets") or [], mono=bool(sdata.get("mono")))
        _add_footer(slide, sdata.get("footer") or "")

    prs.save(str(file_path))

    saved = store.save_presentation(
        pres_id=pres_id,
        draft_id=(draft or {}).get("id"),
        course_id=course["id"],
        group_name=group_name,
        topic=topic,
        filename=filename,
        file_path=file_path,
        slides=slides_data,
        sources=sources,
    )
    return {
        "presentationId": saved["id"],
        "filename": saved["filename"],
        "filePath": saved["filePath"],
        "downloadUrl": f"/api/teacher-agent/presentations/{saved['id']}/download",
        "slideCount": len(slides_data),
        "slides": slides_data,
        "sources": sources,
    }
