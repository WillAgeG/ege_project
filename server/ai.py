"""Прокси к ИИ-провайдерам (Gemini, OpenAI, Anthropic, OpenRouter) со стримингом и JSON-режимом."""

from collections.abc import AsyncIterator
import json
from typing import Any

import httpx

from .config import AIConfig


class AIError(Exception):
    def __init__(self, code: str, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def normalize_messages(raw: str | list[dict[str, Any]]) -> tuple[str | None, list[dict[str, str]]]:
    """Приводит вход к (system_prompt, alternating_messages) без подряд идущих одинаковых ролей."""
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            raise AIError("invalid_request", "Пустой запрос.", 400)
        return None, [{"role": "user", "content": text}]

    if not isinstance(raw, list) or not raw:
        raise AIError("invalid_request", "Некорректный формат сообщений.", 400)

    sys_parts: list[str] = []
    turns: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "user")).strip().lower()
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        if role == "system":
            sys_parts.append(content)
            continue
        norm_role = "assistant" if role == "assistant" else "user"
        if turns and turns[-1]["role"] == norm_role:
            turns[-1]["content"] += "\n\n" + content
        else:
            turns.append({"role": norm_role, "content": content})

    if not turns:
        raise AIError("invalid_request", "Нет текста сообщения.", 400)
    if turns[0]["role"] != "user":
        turns.insert(0, {"role": "user", "content": "Продолжим."})

    system_prompt = "\n\n".join(sys_parts) if sys_parts else None
    return system_prompt, turns


def extract_json(text: str) -> Any:
    """Извлекает JSON-объект или JSON-массив из ответа модели, даже если вокруг есть markdown."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    decoder = json.JSONDecoder()
    for idx, ch in enumerate(cleaned):
        if ch in "{[":
            try:
                obj, _ = decoder.raw_decode(cleaned[idx:])
                return obj
            except json.JSONDecodeError:
                continue
    raise AIError("invalid_json", "ИИ прислал ответ не в формате JSON.", 502)


def _map_http_error(status: int) -> AIError:
    if status == 429:
        return AIError("rate_limited", "Превышен лимит запросов к ИИ. Попробуй через минуту.", 429)
    if status in (401, 403):
        return AIError("capability_disabled", "Ошибка ключа API ИИ на сервере.", 502)
    return AIError("upstream_error", f"Ошибка ответа ИИ (код {status}).", 502)


def _select_model(cfg: AIConfig, tier: str | None) -> str:
    if tier == "complex" and cfg.model_complex:
        return cfg.model_complex
    return cfg.model or ""


def _openai_endpoint(cfg: AIConfig) -> tuple[str, dict[str, str]]:
    if cfg.base_url:
        base = cfg.base_url
    elif cfg.provider == "openrouter":
        base = "https://openrouter.ai/api/v1"
    else:
        base = "https://api.openai.com/v1"
    headers = {
        "Authorization": f"Bearer {cfg.api_key}",
        "Content-Type": "application/json",
    }
    if cfg.provider == "openrouter":
        headers["HTTP-Referer"] = "https://railway.app"
        headers["X-Title"] = "Put v medicinu"
    return f"{base}/chat/completions", headers


def _gemini_payload(system_prompt: str | None, turns: list[dict[str, str]], json_mode: bool) -> dict[str, Any]:
    contents = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
        for m in turns
    ]
    payload: dict[str, Any] = {"contents": contents}
    if system_prompt:
        payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
    if json_mode:
        payload["generationConfig"] = {"responseMimeType": "application/json"}
    return payload


async def _iter_sse_json(resp: httpx.Response) -> AsyncIterator[dict[str, Any]]:
    async for line in resp.aiter_lines():
        if not line or not line.startswith("data:"):
            continue
        raw = line[5:].strip()
        if not raw or raw == "[DONE]":
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            yield data


async def stream_ai_text(
    client: httpx.AsyncClient,
    cfg: AIConfig,
    raw_messages: str | list[dict[str, Any]],
    model_tier: str | None = None,
) -> AsyncIterator[str]:
    if not cfg.enabled:
        raise AIError("not_granted", "ИИ-помощник не настроен на сервере.", 503)

    system_prompt, turns = normalize_messages(raw_messages)
    model = _select_model(cfg, model_tier)

    try:
        if cfg.provider == "gemini":
            base = cfg.base_url or "https://generativelanguage.googleapis.com/v1beta"
            url = f"{base}/models/{model}:streamGenerateContent?alt=sse"
            headers = {"x-goog-api-key": cfg.api_key or "", "Content-Type": "application/json"}
            payload = _gemini_payload(system_prompt, turns, json_mode=False)
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code >= 400:
                    raise _map_http_error(resp.status_code)
                async for event in _iter_sse_json(resp):
                    for cand in event.get("candidates") or []:
                        for part in (cand.get("content") or {}).get("parts") or []:
                            txt = part.get("text")
                            if txt:
                                yield str(txt)
            return

        if cfg.provider == "anthropic":
            base = cfg.base_url or "https://api.anthropic.com/v1"
            url = f"{base}/messages"
            headers = {
                "x-api-key": cfg.api_key or "",
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
            payload: dict[str, Any] = {
                "model": model,
                "max_tokens": 2048,
                "messages": turns,
                "stream": True,
            }
            if system_prompt:
                payload["system"] = system_prompt
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code >= 400:
                    raise _map_http_error(resp.status_code)
                async for event in _iter_sse_json(resp):
                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta") or {}
                        if delta.get("type") == "text_delta" and delta.get("text"):
                            yield str(delta["text"])
            return

        # openai / openrouter
        url, headers = _openai_endpoint(cfg)
        msgs = ([{"role": "system", "content": system_prompt}] if system_prompt else []) + turns
        payload = {"model": model, "messages": msgs, "stream": True}
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                raise _map_http_error(resp.status_code)
            async for event in _iter_sse_json(resp):
                for choice in event.get("choices") or []:
                    delta = choice.get("delta") or {}
                    txt = delta.get("content")
                    if txt:
                        yield str(txt)
    except AIError:
        raise
    except httpx.TimeoutException as exc:
        raise AIError("upstream_timeout", "Превышено время ожидания ответа ИИ.", 504) from exc
    except httpx.HTTPError as exc:
        raise AIError("upstream_error", "Не удалось связаться с сервером ИИ.", 502) from exc


async def complete_ai_json(
    client: httpx.AsyncClient,
    cfg: AIConfig,
    raw_messages: str | list[dict[str, Any]],
    model_tier: str | None = None,
) -> Any:
    if not cfg.enabled:
        raise AIError("not_granted", "ИИ-помощник не настроен на сервере.", 503)

    system_prompt, turns = normalize_messages(raw_messages)
    model = _select_model(cfg, model_tier)

    try:
        if cfg.provider == "gemini":
            base = cfg.base_url or "https://generativelanguage.googleapis.com/v1beta"
            url = f"{base}/models/{model}:generateContent"
            headers = {"x-goog-api-key": cfg.api_key or "", "Content-Type": "application/json"}
            payload = _gemini_payload(system_prompt, turns, json_mode=True)
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code >= 400:
                raise _map_http_error(resp.status_code)
            body = resp.json()
            parts = (((body.get("candidates") or [{}])[0].get("content") or {}).get("parts")) or []
            text = "".join(str(p.get("text", "")) for p in parts)
            return extract_json(text)

        if cfg.provider == "anthropic":
            base = cfg.base_url or "https://api.anthropic.com/v1"
            url = f"{base}/messages"
            headers = {
                "x-api-key": cfg.api_key or "",
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
            payload = {"model": model, "max_tokens": 4096, "messages": turns}
            if system_prompt:
                payload["system"] = system_prompt
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code >= 400:
                raise _map_http_error(resp.status_code)
            body = resp.json()
            text = "".join(
                str(b.get("text", ""))
                for b in (body.get("content") or [])
                if b.get("type") == "text"
            )
            return extract_json(text)

        url, headers = _openai_endpoint(cfg)
        msgs = ([{"role": "system", "content": system_prompt}] if system_prompt else []) + turns
        resp = await client.post(url, headers=headers, json={"model": model, "messages": msgs})
        if resp.status_code >= 400:
            raise _map_http_error(resp.status_code)
        body = resp.json()
        msg = ((body.get("choices") or [{}])[0]).get("message") or {}
        return extract_json(str(msg.get("content", "")))
    except AIError:
        raise
    except httpx.TimeoutException as exc:
        raise AIError("upstream_timeout", "Превышено время ожидания ответа ИИ.", 504) from exc
    except httpx.HTTPError as exc:
        raise AIError("upstream_error", "Не удалось связаться с сервером ИИ.", 502) from exc
