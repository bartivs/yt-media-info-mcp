"""
yt-dlp MCP Server — Python Service

Persistent FastAPI backend that wraps yt-dlp's YoutubeDL for:
- /info      → extract rich metadata from a media URL
- /transcript → fetch subtitles/text from a media URL
- /search    → search for media using yt-dlp search prefixes
- /health    → health check for Docker compose

Imports yt-dlp once at startup. Creates a fresh YoutubeDL instance per request
(no cross-request state sharing). Returns snake_case, ISO 8601 formatted output.
"""

import json
import logging
import os
import re
import time
import urllib.request
from datetime import datetime, timezone
from typing import Optional

import yt_dlp
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("yt-dlp-service")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="yt-dlp Service",
    description="Persistent HTTP service wrapping yt-dlp metadata extraction",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class InfoRequest(BaseModel):
    url: str = Field(..., description="Media URL to extract information from")
    include_raw: bool = Field(
        True, description="Include the full yt-dlp sanitized info_dict under a 'raw' field"
    )
    username: Optional[str] = Field(
        None, description="Username for site authentication"
    )
    password: Optional[str] = Field(
        None, description="Password for site authentication"
    )


class TranscriptRequest(BaseModel):
    url: str = Field(..., description="Media URL to fetch transcript from")
    language: str = Field("en", description="Preferred subtitle language code")
    timestamps: bool = Field(
        True, description="Include timestamp segments in the response"
    )
    username: Optional[str] = Field(
        None, description="Username for site authentication"
    )
    password: Optional[str] = Field(
        None, description="Password for site authentication"
    )


class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query")
    limit: int = Field(10, description="Maximum number of results (max 50)", ge=1)
    platform: str = Field(
        "youtube",
        description='Platform to search. "youtube" → ytsearch:, "google_videos" → gvsearch:',
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PLATFORM_PREFIXES = {
    "youtube": "ytsearch",
    "google_videos": "gvsearch",
}

DATE_FIELDS = [
    "upload_date",
    "release_date",
    "modified_date",
]

TIMESTAMP_FIELDS = [
    "timestamp",
    "release_timestamp",
]


def _build_ydl_opts(username: Optional[str] = None, password: Optional[str] = None) -> dict:
    """Build a YoutubeDL options dict.

    A new dict is returned for every call so that no state is shared across
    requests.  Only fields relevant to *extraction* (not downloading) are set.

    Reads YT_MEDIA_INFO_COOKIES_FILE from the environment. If set and the file
    exists, passes it as "cookiefile" to yt-dlp.  If set but missing, logs a
    warning and proceeds without cookies.
    """
    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
        "ignoreerrors": True,  # best-effort for playlists
    }
    if username:
        opts["username"] = username
    if password:
        opts["password"] = password

    # Optional cookie file for session-based auth
    cookie_file = os.environ.get("YT_MEDIA_INFO_COOKIES_FILE")
    if cookie_file:
        if os.path.exists(cookie_file):
            opts["cookiefile"] = cookie_file
        else:
            logger.warning("Cookie file %s not found — proceeding without cookies", cookie_file)

    return opts


def _normalize_date(value: str | int | None) -> str | None:
    """Normalize a date/timestamp value to ISO 8601 string."""
    if value is None:
        return None

    # yt-dlp upload_date is "YYYYMMDD"
    if isinstance(value, str) and re.match(r"^\d{8}$", value):
        try:
            dt = datetime.strptime(value, "%Y%m%d")
            return dt.date().isoformat()  # "2024-01-15"
        except ValueError:
            return value

    # Unix timestamp (seconds)
    if isinstance(value, (int, float)) or (isinstance(value, str) and value.replace(".", "", 1).isdigit()):
        try:
            dt = datetime.fromtimestamp(float(value), tz=timezone.utc)
            return dt.isoformat()
        except (ValueError, OSError):
            return str(value)

    # Already a string — return as-is if it looks like a date string
    if isinstance(value, str):
        return value

    return str(value) if value else None


def _normalize_info_dict(info: dict) -> None:
    """In-place normalize date/timestamp fields in an info dict."""
    for field in DATE_FIELDS + TIMESTAMP_FIELDS:
        if field in info and info[field] is not None:
            info[field] = _normalize_date(info[field])

    # If both timestamp and upload_date exist, prefer timestamp-based normalization
    # but keep both aligned
    if "upload_date" in info and "timestamp" in info and info["timestamp"] and info.get("upload_date"):
        iso = _normalize_date(info["timestamp"])
        if iso:
            info["upload_date"] = iso.split("T")[0] if "T" in iso else info["upload_date"]


def _build_formats_summary(info: dict) -> dict:
    """Build a human/AI-readable summary of available formats."""
    formats = info.get("formats") or []
    if not formats:
        return {
            "best_video": None,
            "best_audio": None,
            "available_resolutions": [],
        }

    # Sort by quality (tbr = total bitrate, higher is better among same resolution)
    # Prefer formats with both video+audio, then video-only, then audio-only
    video_only = [f for f in formats if f.get("vcodec") and f.get("vcodec") != "none" and (not f.get("acodec") or f.get("acodec") == "none")]
    audio_only = [f for f in formats if f.get("acodec") and f.get("acodec") != "none" and (not f.get("vcodec") or f.get("vcodec") == "none")]
    combined = [f for f in formats if f.get("vcodec") and f.get("vcodec") != "none" and f.get("acodec") and f.get("acodec") != "none"]

    def _sort_key(f):
        height = f.get("height") or 0
        tbr = f.get("tbr") or f.get("vbr") or 0
        return (height, tbr)

    resolutions = sorted(
        set(
            f"{f.get('height', '?')}p"
            for f in video_only + combined
            if f.get("height")
        ),
        key=lambda r: (int(r.replace("p", "")) if r.replace("p", "").isdigit() else 0),
        reverse=True,
    )

    best_video = None
    if video_only:
        best = max(video_only, key=_sort_key)
        best_video = f"{best.get('height', '?')}p {best.get('vcodec', '?')}"
    elif combined:
        best = max(combined, key=_sort_key)
        best_video = f"{best.get('height', '?')}p {best.get('vcodec', '?')}"

    best_audio = None
    if audio_only:
        best = max(audio_only, key=lambda f: f.get("abr") or f.get("tbr") or 0)
        best_audio = f"{best.get('ext', '?')} {best.get('abr', best.get('tbr', '?'))}kbps"

    return {
        "best_video": best_video,
        "best_audio": best_audio,
        "available_resolutions": resolutions,
    }


def _curate_info(info: dict) -> dict:
    """Extract a curated subset of fields from the full yt-dlp info dict.

    All fields use snake_case, matching yt-dlp's native convention.
    """
    return {
        "url": info.get("webpage_url") or info.get("url"),
        "extractor": info.get("extractor"),
        "extractor_key": info.get("extractor_key"),
        "title": info.get("title"),
        "description": info.get("description"),
        "duration_seconds": info.get("duration"),
        "upload_date": _normalize_date(info.get("upload_date")),
        "release_date": _normalize_date(info.get("release_date")),
        "timestamp": _normalize_date(info.get("timestamp")),
        "uploader": info.get("uploader"),
        "uploader_id": info.get("uploader_id"),
        "uploader_url": info.get("uploader_url"),
        "channel": info.get("channel"),
        "channel_id": info.get("channel_id"),
        "channel_url": info.get("channel_url"),
        "categories": info.get("categories") or [],
        "tags": info.get("tags") or [],
        "statistics": {
            "view_count": info.get("view_count"),
            "like_count": info.get("like_count"),
            "comment_count": info.get("comment_count"),
        },
        "thumbnail": _pick_best_thumbnail(info.get("thumbnails")),
        "thumbnails": info.get("thumbnails") or [],
        "chapters": [
            {
                "title": ch.get("title"),
                "start_time": ch.get("start_time"),
                "end_time": ch.get("end_time"),
            }
            for ch in (info.get("chapters") or [])
        ],
        "subtitles_available": _list_available_subtitles(info),
        "formats_summary": _build_formats_summary(info),
        "playlist": _extract_playlist_info(info),
        "is_live": info.get("is_live"),
        "was_live": info.get("was_live"),
        "age_limit": info.get("age_limit"),
        "availability": info.get("availability"),
    }


def _pick_best_thumbnail(thumbnails: list | None) -> str | None:
    """Return the highest-resolution thumbnail URL."""
    if not thumbnails:
        return None
    # Prefer highest res by preference, then by resolution
    sorted_thumbs = sorted(
        [t for t in thumbnails if t.get("url")],
        key=lambda t: (
            t.get("preference", -1) or -1,
            (t.get("height") or 0) * (t.get("width") or 0),
        ),
        reverse=True,
    )
    return sorted_thumbs[0]["url"] if sorted_thumbs else None


def _list_available_subtitles(info: dict) -> list[str]:
    """List language codes of available subtitles (manual + auto)."""
    subs = info.get("subtitles") or {}
    auto = info.get("automatic_captions") or {}
    languages = set(subs.keys()) | set(auto.keys())
    return sorted(languages)


def _extract_playlist_info(info: dict) -> dict | None:
    """Extract playlist/channel info from the response."""
    if info.get("_type") == "playlist":
        entries = info.get("entries") or []
        playlist_entries = []
        failures = []
        for entry in entries:
            if entry is None:
                continue
            if isinstance(entry, dict) and entry.get("url"):
                playlist_entries.append(_entry_to_minimal(entry))
            elif isinstance(entry, dict) and entry.get("ie_key"):
                # Failed entry from ignoreerrors
                failures.append({
                    "url": entry.get("url") or entry.get("webpage_url"),
                    "title": entry.get("title"),
                    "reason": "extraction_failed",
                })
        return {
            "id": info.get("id"),
            "title": info.get("title"),
            "uploader": info.get("uploader"),
            "channel": info.get("channel"),
            "count": len(playlist_entries),
            "entries": playlist_entries,
            "failures": failures if failures else None,
        }
    return None


def _entry_to_minimal(entry: dict) -> dict:
    """Map a playlist entry to minimal metadata shape."""
    return {
        "url": entry.get("url") or entry.get("webpage_url"),
        "title": entry.get("title"),
        "duration_seconds": entry.get("duration"),
        "uploader": entry.get("uploader"),
        "upload_date": _normalize_date(entry.get("upload_date")),
        "thumbnail": _pick_best_thumbnail(entry.get("thumbnails")),
        "view_count": entry.get("view_count"),
    }


def _fetch_json3(url: str) -> list[dict]:
    """Fetch and parse a YouTube json3 caption file, returning segment list."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        logger.warning("Failed to fetch json3 captions from %s: %s", url, exc)
        return []

    segments = []
    for event in data.get("events") or []:
        t_start = event.get("tStartMs", 0) / 1000.0
        d_dur = event.get("dDurationMs", 0) / 1000.0
        segs = event.get("segs") or []
        texts = []
        for seg in segs:
            utf8 = seg.get("utf8", "")
            texts.append(utf8)

        text = "".join(texts).strip()
        if text:
            segments.append({
                "start": round(t_start, 3),
                "end": round(t_start + d_dur, 3),
                "text": text,
            })

    return segments


def _fetch_vtt(url: str) -> list[dict]:
    """Parse a simple WebVTT file into segments."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except Exception as exc:
        logger.warning("Failed to fetch VTT captions from %s: %s", url, exc)
        return []

    segments = []
    # Simple VTT parser: look for "HH:MM:SS.mmm --> HH:MM:SS.mmm" lines
    vtt_pattern = re.compile(
        r"(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*"
        r"(\d{2}):(\d{2}):(\d{2})\.(\d{3})"
    )

    lines = raw.split("\n")
    current_start = None
    current_end = None
    current_text_parts = []

    def _to_seconds(h, m, s, ms):
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0

    for line in lines:
        line = line.strip()
        if not line:
            # Empty line = end of a cue
            if current_start is not None and current_text_parts:
                segments.append({
                    "start": round(current_start, 3),
                    "end": round(current_end, 3),
                    "text": " ".join(current_text_parts),
                })
                current_start = None
                current_end = None
                current_text_parts = []
            continue

        m = vtt_pattern.match(line)
        if m:
            current_start = _to_seconds(m.group(1), m.group(2), m.group(3), m.group(4))
            current_end = _to_seconds(m.group(5), m.group(6), m.group(7), m.group(8))
            continue

        # Skip VTT headers (WEBVTT, Kind, Language, etc.)
        if current_start is not None and not line.startswith("Kind:") and not line.startswith("Language:"):
            # Remove VTT tags like <c>, </c>, <00:00:05.000>
            cleaned = re.sub(r"<[^>]+>", "", line)
            if cleaned:
                current_text_parts.append(cleaned)

    # Flush last cue
    if current_start is not None and current_text_parts:
        segments.append({
            "start": round(current_start, 3),
            "end": round(current_end, 3),
            "text": " ".join(current_text_parts),
        })

    return segments


def _fetch_subtitle_text(subtitle_urls: list[dict]) -> tuple[list[dict], str]:
    """Fetch subtitles from available URLs, preferring json3 over vtt over srt.

    Returns (segments, full_text).
    """
    if not subtitle_urls:
        return [], ""

    # Prefer json3 (structured, easy), then vtt, then srt, then any
    def _url_priority(u):
        ext = u.get("ext", "")
        if ext == "json3":
            return 0
        if ext == "vtt":
            return 1
        if ext == "srt":
            return 2
        return 3

    sorted_urls = sorted(subtitle_urls, key=_url_priority)
    errors = []

    for sub in sorted_urls:
        url = sub.get("url")
        ext = sub.get("ext", "")
        if not url:
            continue
        try:
            if ext == "json3":
                segments = _fetch_json3(url)
            elif ext == "vtt":
                segments = _fetch_vtt(url)
            else:
                # Try VTT parser as fallback for srt/others
                segments = _fetch_vtt(url)
            if segments:
                full_text = " ".join(s["text"] for s in segments)
                return segments, full_text
        except Exception as exc:
            errors.append(str(exc))
            continue

    if errors:
        logger.warning("All subtitle fetch attempts failed: %s", "; ".join(errors))
    return [], ""


def _pick_subtitle_language(
    subtitles: dict, automatic_captions: dict, preferred: str
) -> tuple[str | None, list[dict] | None]:
    """Pick the best subtitle track for the requested language.

    Checks manual subtitles first, then automatic captions.
    Falls back to first available language if preferred is not found.
    Returns (language_code, subtitle_urls_list).
    """
    # Manual subtitles
    if preferred in subtitles:
        return preferred, subtitles[preferred]

    # Auto captions
    if preferred in automatic_captions:
        return preferred, automatic_captions[preferred]

    # Fallback: first available language from manual subtitles
    if subtitles:
        fallback_lang = next(iter(subtitles.keys()))
        return fallback_lang, subtitles[fallback_lang]

    # Fallback: first available from auto captions
    if automatic_captions:
        fallback_lang = next(iter(automatic_captions.keys()))
        return fallback_lang, automatic_captions[fallback_lang]

    return None, None


def _build_search_url(query: str, limit: int, platform: str) -> str | None:
    """Build a yt-dlp search URL from query parameters.

    Returns None if platform is unknown.
    """
    prefix = PLATFORM_PREFIXES.get(platform)
    if prefix is None:
        return None
    capped_limit = min(limit, 50)
    return f"{prefix}{capped_limit}:{query}"


def _extract_info(url: str, username: str = None, password: str = None) -> dict:
    """Core extraction: run yt-dlp and return the raw info dict."""
    with yt_dlp.YoutubeDL(_build_ydl_opts(username, password)) as ydl:
        info = ydl.extract_info(url, download=False)

    return json.loads(json.dumps(ydl.sanitize_info(info)))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    """Health check for Docker compose.

    Reports:
      - Service status
      - Cookie file path, age in seconds, and whether it exists
        (only if YT_MEDIA_INFO_COOKIES_FILE is set)
    """
    result = {"status": "ok", "service": "yt-media-info-service"}

    cookie_file = os.environ.get("YT_MEDIA_INFO_COOKIES_FILE")
    if cookie_file:
        cookie_info = {
            "path": cookie_file,
            "exists": os.path.exists(cookie_file),
        }
        if cookie_info["exists"]:
            try:
                mtime = os.path.getmtime(cookie_file)
                cookie_info["age_seconds"] = round(time.time() - mtime, 1)
            except OSError:
                cookie_info["age_seconds"] = None
        result["cookies"] = cookie_info

    return result


@app.post("/info")
async def info(req: InfoRequest):
    """Extract rich metadata from a media URL."""
    try:
        raw = _extract_info(req.url, req.username, req.password)
    except yt_dlp.utils.DownloadError as exc:
        raise HTTPException(status_code=422, detail={
            "message": f"yt-dlp download error: {exc}",
            "code": "DOWNLOAD_ERROR",
        })
    except Exception as exc:
        logger.exception("Unexpected error extracting %s", req.url)
        raise HTTPException(status_code=500, detail={
            "message": f"Unexpected extraction error: {exc}",
            "code": "EXTRACTION_ERROR",
        })

    if raw is None:
        raise HTTPException(status_code=422, detail={
            "message": "yt-dlp extraction returned no data. The video may be unavailable, private, or require authentication.",
            "code": "EXTRACTION_FAILED",
        })

    curated = _curate_info(raw)
    if req.include_raw:
        curated["raw"] = raw
    else:
        curated["raw"] = None

    return curated


@app.post("/transcript")
async def transcript(req: TranscriptRequest):
    """Fetch subtitles/transcript text for a media URL."""
    try:
        raw = _extract_info(req.url, req.username, req.password)
    except yt_dlp.utils.DownloadError as exc:
        raise HTTPException(status_code=422, detail={
            "message": f"yt-dlp download error: {exc}",
            "code": "DOWNLOAD_ERROR",
        })
    except Exception as exc:
        logger.exception("Unexpected error extracting %s for transcript", req.url)
        raise HTTPException(status_code=500, detail={
            "message": f"Unexpected extraction error: {exc}",
            "code": "EXTRACTION_ERROR",
        })

    if raw is None:
        raise HTTPException(status_code=422, detail={
            "message": "yt-dlp extraction returned no data. The video may be unavailable, private, or require authentication.",
            "code": "EXTRACTION_FAILED",
        })

    subtitles = raw.get("subtitles") or {}
    automatic_captions = raw.get("automatic_captions") or {}
    preferred_lang = req.language

    lang, urls = _pick_subtitle_language(subtitles, automatic_captions, preferred_lang)

    if not lang or not urls:
        raise HTTPException(status_code=404, detail={
            "message": f"No subtitles available for '{preferred_lang}' or any fallback language",
            "code": "NO_SUBTITLES",
        })

    segments, full_text = _fetch_subtitle_text(urls)

    if not segments and not full_text:
        raise HTTPException(status_code=404, detail={
            "message": f"Subtitles found for '{lang}' but could not be fetched/parsed",
            "code": "SUBTITLE_FETCH_FAILED",
        })

    result = {
        "url": raw.get("webpage_url") or raw.get("url"),
        "language": lang,
        "duration_seconds": raw.get("duration"),
        "full_text": full_text,
    }

    if req.timestamps:
        result["subtitles"] = segments

    return result


@app.post("/search")
async def search(req: SearchRequest):
    """Search for media using yt-dlp's search prefixes."""
    search_url = _build_search_url(req.query, req.limit, req.platform)

    if search_url is None:
        raise HTTPException(status_code=400, detail={
            "message": f"Unknown platform '{req.platform}'. Supported: {', '.join(PLATFORM_PREFIXES.keys())}",
            "code": "UNKNOWN_PLATFORM",
        })

    try:
        raw = _extract_info(search_url)
    except yt_dlp.utils.DownloadError as exc:
        raise HTTPException(status_code=422, detail={
            "message": f"Search failed: {exc}",
            "code": "SEARCH_ERROR",
        })
    except Exception as exc:
        logger.exception("Unexpected error during search: %s", search_url)
        raise HTTPException(status_code=500, detail={
            "message": f"Unexpected search error: {exc}",
            "code": "SEARCH_ERROR",
        })

    entries = raw.get("entries") or []
    results = []
    for entry in entries:
        if entry is None:
            continue
        if isinstance(entry, dict):
            results.append(_entry_to_minimal(entry))

    return {
        "query": req.query,
        "platform": req.platform,
        "count": len(results),
        "results": results,
    }
