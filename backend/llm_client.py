"""
Direct OpenAI client for the Film Companion backend.

Replaces the Emergent `emergentintegrations` wrapper. Every LLM call in the
backend goes through `llm_chat()` / `llm_chat_json()` so there is exactly
one place that knows about API keys, timeouts, retries and error mapping.

    from llm_client import llm_chat, llm_chat_json, llm_available, LLMError, LLMUnavailable

    if not llm_available():
        ...deterministic fallback...
    try:
        text = await llm_chat(system="You are Tina...", user="hi", history=[...])
    except LLMUnavailable:
        ...no API key configured...
    except LLMError:
        ...network / API / timeout / bad JSON...

Nothing in here logs prompt or completion content — only model name and
latency at DEBUG level.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

from settings import settings

try:  # the SDK is a hard dependency, but keep import-time failures soft
    from openai import AsyncOpenAI
except Exception:  # noqa: BLE001 - pragma: no cover
    AsyncOpenAI = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

__all__ = [
    "LLMError",
    "LLMUnavailable",
    "llm_available",
    "llm_chat",
    "llm_chat_json",
]

_DEFAULT_TIMEOUT = 30.0
_VALID_ROLES = ("system", "user", "assistant")


class LLMError(Exception):
    """Any failure talking to the model: network, timeout, API error, bad JSON."""


class LLMUnavailable(LLMError):
    """No API key configured — callers should take their deterministic path."""


_client: Optional["AsyncOpenAI"] = None


def _is_classic_model(model_name: str) -> bool:
    """Non-reasoning chat models (gpt-4o, gpt-4o-mini, gpt-4.1, gpt-3.5)."""
    name = (model_name or "").lower()
    return name.startswith(("gpt-4", "gpt-3.5", "chatgpt-4"))


def llm_available() -> bool:
    """True when an OpenAI API key is configured."""
    return bool(settings.openai_api_key)


def _get_client() -> "AsyncOpenAI":
    """One lazily-created module-level AsyncOpenAI client."""
    global _client
    if _client is None:
        if not settings.openai_api_key:
            raise LLMUnavailable("OPENAI_API_KEY is not configured")
        if AsyncOpenAI is None:
            raise LLMError("openai package is not installed")
        _client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            timeout=_DEFAULT_TIMEOUT,
            max_retries=1,
        )
    return _client


def _clean_history(history: Optional[List[Dict[str, Any]]]) -> List[Dict[str, str]]:
    """Keep only well-formed {role, content} turns with non-empty text."""
    cleaned: List[Dict[str, str]] = []
    for turn in history or []:
        if not isinstance(turn, dict):
            continue
        role = turn.get("role")
        content = turn.get("content")
        if role not in _VALID_ROLES or not isinstance(content, str):
            continue
        content = content.strip()
        if not content:
            continue
        cleaned.append({"role": role, "content": content})
    return cleaned


def _build_messages(system: str, user: str, history: Optional[List[Dict[str, Any]]]) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = [{"role": "system", "content": system or ""}]
    messages.extend(_clean_history(history))
    messages.append({"role": "user", "content": user if isinstance(user, str) else str(user)})
    return messages


async def _complete(
    messages: List[Dict[str, str]],
    *,
    model: Optional[str],
    timeout: float,
    max_tokens: int,
    temperature: float,
    response_format: Optional[Dict[str, str]] = None,
) -> str:
    if not settings.openai_api_key:
        raise LLMUnavailable("OPENAI_API_KEY is not configured")

    client = _get_client()
    model_name = model or settings.llm_model_default
    # `max_completion_tokens` is accepted by every current chat model; the
    # legacy `max_tokens` is rejected by reasoning models (gpt-5.x / o-series),
    # which also only support the default temperature and spend part of the
    # token budget on hidden reasoning — so give them more room.
    classic = _is_classic_model(model_name)
    kwargs: Dict[str, Any] = {
        "model": model_name,
        "messages": messages,
        "max_completion_tokens": max_tokens if classic else max(max_tokens * 4, 2000),
        "timeout": timeout,
    }
    if classic:
        kwargs["temperature"] = temperature
    if response_format is not None:
        kwargs["response_format"] = response_format

    started = time.monotonic()
    try:
        response = await client.chat.completions.create(**kwargs)
    except LLMError:
        raise
    except Exception as exc:  # noqa: BLE001 - every SDK/network error becomes LLMError
        logger.debug(
            "llm call failed model=%s after %.0fms (%s)",
            model_name,
            (time.monotonic() - started) * 1000,
            type(exc).__name__,
        )
        raise LLMError(f"{type(exc).__name__}: {exc}") from exc

    latency_ms = (time.monotonic() - started) * 1000
    logger.debug("llm call ok model=%s latency=%.0fms", model_name, latency_ms)

    try:
        text = response.choices[0].message.content
    except (AttributeError, IndexError) as exc:
        raise LLMError("LLM response had no choices") from exc
    return (text or "").strip()


async def llm_chat(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    history: Optional[List[Dict[str, Any]]] = None,
    timeout: float = _DEFAULT_TIMEOUT,
    max_tokens: int = 800,
    temperature: float = 0.7,
) -> str:
    """Single chat completion. Returns the stripped assistant text.

    Messages are sent as [system, *history, user]. Raises `LLMUnavailable`
    when no API key is configured and `LLMError` (wrapping the original
    exception) on any API / network / timeout error.
    """
    messages = _build_messages(system, user, history)
    return await _complete(
        messages,
        model=model,
        timeout=timeout,
        max_tokens=max_tokens,
        temperature=temperature,
    )


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def _parse_json_object(text: str) -> Dict[str, Any]:
    cleaned = _FENCE_RE.sub("", (text or "").strip()).strip()
    if not cleaned:
        raise LLMError("LLM returned an empty JSON response")
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        # Last resort: grab the outermost {...} in case the model added prose.
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise LLMError(f"LLM returned invalid JSON: {exc.msg}") from exc
        try:
            data = json.loads(cleaned[start:end + 1])
        except json.JSONDecodeError as exc2:
            raise LLMError(f"LLM returned invalid JSON: {exc2.msg}") from exc2
    if not isinstance(data, dict):
        raise LLMError("LLM JSON response was not an object")
    return data


async def llm_chat_json(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    history: Optional[List[Dict[str, Any]]] = None,
    timeout: float = _DEFAULT_TIMEOUT,
    max_tokens: int = 800,
    temperature: float = 0.7,
) -> Dict[str, Any]:
    """Like `llm_chat` but forces `response_format={"type": "json_object"}`
    and returns the parsed object. Raises `LLMError` on malformed JSON.

    NOTE: OpenAI requires the word "JSON" to appear somewhere in the prompt
    when using json_object mode — make sure your system/user text has it.
    """
    messages = _build_messages(system, user, history)
    text = await _complete(
        messages,
        model=model,
        timeout=timeout,
        max_tokens=max_tokens,
        temperature=temperature,
        response_format={"type": "json_object"},
    )
    return _parse_json_object(text)
