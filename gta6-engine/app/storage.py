"""Object storage for rendered media (Cloudflare R2 / any S3-compatible bucket).
Needed in the cloud because GitHub Actions runners are thrown away after each run.
If S3_BUCKET is not set, files simply stay on local disk."""
import os
from pathlib import Path

from .config import settings

BUCKET = os.environ.get("S3_BUCKET")


def _client():
    import boto3
    return boto3.client("s3", endpoint_url=os.environ.get("S3_ENDPOINT"),
                        aws_access_key_id=os.environ.get("S3_ACCESS_KEY"),
                        aws_secret_access_key=os.environ.get("S3_SECRET_KEY"), region_name="auto")


def key_for(path):
    """Stable key even if the path was recorded on another machine."""
    parts = Path(path).parts
    for i, part in enumerate(parts):
        if part in ("shorts", "longform", "clipping", "sources", "library"):
            return "/".join(parts[i:])
    return Path(path).name


def push(path):
    if BUCKET and path and Path(path).exists():
        _client().upload_file(str(path), BUCKET, key_for(path))


def ensure_local(path):
    """Return a local path for the file, downloading from the bucket if needed."""
    if not path or Path(path).exists() or not BUCKET:
        return path
    local = settings.media_dir / key_for(path)
    if not local.exists():
        local.parent.mkdir(parents=True, exist_ok=True)
        _client().download_file(BUCKET, key_for(path), str(local))
    return str(local)


def public_url(path, expires=3600):
    if not BUCKET:
        return None
    return _client().generate_presigned_url("get_object", Params={"Bucket": BUCKET, "Key": key_for(path)}, ExpiresIn=expires)


def sync_library():
    """Pull your own footage (bucket prefixes library/ and sources/) to the worker before rendering."""
    if not BUCKET:
        return 0
    c, n = _client(), 0
    pages = [pg for prefix in ("library/", "sources/") for pg in c.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix)]
    for page in pages:
        for obj in page.get("Contents", []):
            local = settings.media_dir / obj["Key"]
            if not local.exists() and not obj["Key"].endswith("/"):
                local.parent.mkdir(parents=True, exist_ok=True)
                c.download_file(BUCKET, obj["Key"], str(local))
                n += 1
    return n
