"""Adapter factory: provider dict from providers.yaml -> adapter instance."""
from ..config import base_url, fill, keys
from .cohere import Cohere
from .gemini import Gemini
from .horde import Horde
from .openai_compat import OpenAICompat

ADAPTERS = {"openai": OpenAICompat, "gemini": Gemini, "cohere": Cohere, "horde": Horde}


def make_adapter(name, p, key_idx=0):
    cls = ADAPTERS.get(p.get("api", "openai"))
    if cls is None:
        raise ValueError(f"{name}: unknown api `{p.get('api')}`; known: {', '.join(ADAPTERS)}")
    models = p.get("models") or "/models"
    ks = keys(p)
    return cls(name, base_url(p), ks[key_idx % len(ks)] if ks else "",
               models_path=fill(models) if models != "extra" else "")
