"""Изолированный пакет ИИ-помощника преподавателя вуза (Кейс №3 GigaChat)."""

from .config import TeacherAgentConfig, load_teacher_agent_config
from .orchestrator import TeacherAgentOrchestrator
from .pptx_export import build_presentation_pptx
from .seed import (
    seed_demo_stand,
    set_pdf_conflict,
    set_prompt_injection,
    set_schedule_outage,
)
from .sql_review import analyze_submission
from .store import TeacherAgentStore
from .tools import OPENAI_TOOL_SCHEMAS, TeacherAgentTools

__all__ = [
    "OPENAI_TOOL_SCHEMAS",
    "TeacherAgentConfig",
    "TeacherAgentOrchestrator",
    "TeacherAgentStore",
    "TeacherAgentTools",
    "analyze_submission",
    "build_presentation_pptx",
    "load_teacher_agent_config",
    "seed_demo_stand",
    "set_pdf_conflict",
    "set_prompt_injection",
    "set_schedule_outage",
]
