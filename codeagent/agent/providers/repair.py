"""Best-effort repair of malformed tool-call arguments from weak models."""
import ast
import json
import re


def _close(s):
    """Append missing closing quotes/brackets for JSON cut off mid-way."""
    stack, in_str, esc = [], False, False
    for ch in s:
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]" and stack:
            stack.pop()
    return s + ('"' if in_str else "") + "".join(reversed(stack))


def parse_args(raw):
    """Returns a dict, or {"_error": raw} when nothing works."""
    if isinstance(raw, dict):
        return raw
    if raw is None or not str(raw).strip():
        return {}
    s = str(raw).strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s)  # code fences
    m = re.search(r"\{.*\}?", s, re.S)  # text around the object
    inner = m.group(0) if m else s
    candidates = [s, inner, re.sub(r",\s*([}\]])", r"\1", inner)]
    candidates.append(_close(candidates[-1]))
    for c in candidates:
        try:
            v = json.loads(c)
            if isinstance(v, str):  # double-encoded
                v = json.loads(v)
            if isinstance(v, dict):
                return v
        except (json.JSONDecodeError, TypeError):
            pass
    try:  # Python-style dict: single quotes, True/False/None
        v = ast.literal_eval(candidates[-1])
        if isinstance(v, dict):
            return v
    except (ValueError, SyntaxError):
        pass
    return {"_error": str(raw)}
