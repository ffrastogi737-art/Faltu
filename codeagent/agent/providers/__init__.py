"""Adapter factory: provider dict from providers.yaml -> adapter instance."""
import os

from ..config import base_url, fill
from .cohere import Cohere
from .gemini import Gemini
from .horde import Horde
from .openai_compat import OpenAICompat

ADAPTERS = {"openai": OpenAICompat, "gemini": Gemini, "cohere": Cohere, "horde": Horde}


def make_adapter(name, p):
    cls = ADAPTERS.get(p.get("api", "openai"))
    if cls is None:
        raise ValueError(f"{name}: unknown api `{p.get('api')}`; known: {', '.join(ADAPTERS)}")
    models = p.get("models") or "/models"
    return cls(name, base_url(p), os.environ.get(p["key_env"], ""),
               models_path=fill(models) if models != "extra" else "")
