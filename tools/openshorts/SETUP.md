# OpenShorts (self-hosted clipper) in this repo

Source: https://github.com/mutonby/openshorts (MIT). Copied here so a new session can build it.
Secrets are NOT in this repo: the Gemini key and YouTube cookies come from the environment at run time.

## Build
    docker build -t openshorts:local tools/openshorts

## Run
    docker run -d --name openshorts --network=host \
      -e GEMINI_API_KEY="$GEMINI_API_KEY" \
      -e YOUTUBE_COOKIES="$YOUTUBE_COOKIES" \
      openshorts:local
    curl http://127.0.0.1:8000/health

Use only the owner's own videos. Do not add bot-check bypass helpers.
