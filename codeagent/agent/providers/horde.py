"""AI Horde: async text jobs run by volunteer workers. No tool calling,
so the router only sends it plain text steps (and never private code:
providers.yaml pins allow_private_code: false)."""
import asyncio

from ..messages import Message, ProviderError, Response, Usage
from .openai_compat import OpenAICompat


def to_prompt(messages):
    lines = [f"{m.role.upper()}: {m.content}" for m in messages if m.content]
    return "\n\n".join(lines) + "\n\nASSISTANT:"


STOP = ["\nUSER:", "\nSYSTEM:", "\nTOOL:"]


class Horde(OpenAICompat):
    poll_seconds = 3
    max_wait = 300

    def headers(self):
        return {"apikey": self.key, "Content-Type": "application/json", "Client-Agent": "edith-agent:0:none",
                "User-Agent": "edith-agent"}  # the default Python agent is blocked by Horde's CDN

    async def chat(self, model, messages, tools):
        body = {"prompt": to_prompt(messages), "models": [model],
                "params": {"max_length": 512, "max_context_length": 4096, "stop_sequence": STOP}}
        job = await asyncio.to_thread(self._request, "/generate/text/async", body)
        if not job.get("id"):
            raise ProviderError(self.name, 200, f"no job id: {str(job)[:200]}")
        waited = 0
        while waited < self.max_wait:
            st = await asyncio.to_thread(self._request, f"/generate/text/status/{job['id']}")
            if st.get("faulted") or st.get("is_possible") is False:
                raise ProviderError(self.name, 200, "job faulted or no worker can run it")
            if st.get("done"):
                gens = st.get("generations") or []
                text = gens[0].get("text", "") if gens else ""
                for s in STOP:  # not every worker honours stop_sequence
                    text = text.split(s)[0]
                return Response(Message("assistant", text.strip()), "stop", Usage(), self.name, model)
            await asyncio.sleep(self.poll_seconds)
            waited += self.poll_seconds
        raise ProviderError(self.name, 0, f"job not done after {self.max_wait}s")

    async def list_models(self):
        recs = await super().list_models()
        for r in recs:
            r["tools"] = 0
        return recs
