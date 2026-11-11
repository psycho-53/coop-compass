#!/usr/bin/env python3
"""Refresh a static cooperative Steam catalog from SteamSpy's public community tags.

No API key required. The file contains games and tags, NOT anyone's Steam library.
SteamSpy is a third-party source; online/local tags are hints, not verified capabilities.
"""
import datetime as dt
import json
import pathlib
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "catalog.json"
TAG_REQUESTS = ("Co-op", "Online Co-Op", "Local Co-Op", "Split Screen", "Remote Play Together")
USER_AGENT = "CoopCompassCatalogBot/1.0 (+https://github.com/psycho-53/coop-compass)"


def fetch(tag):
    query = urllib.parse.urlencode({"request": "tag", "tag": tag})
    req = urllib.request.Request("https://steamspy.com/api.php?" + query, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=45) as response:
        result = json.load(response)
    if not isinstance(result, dict) or not result:
        raise RuntimeError("SteamSpy returned empty or invalid result for " + tag)
    return result


def normalize(item, source_tag):
    try:
        appid = int(item.get("appid", 0))
    except (ValueError, TypeError):
        return None
    name = str(item.get("name") or "").strip()
    if appid < 1 or not name or appid == 999999:
        return None
    votes = item.get("tags") or {}
    if not isinstance(votes, dict):
        votes = {}
    ordered = sorted(votes.items(), key=lambda entry: int(entry[1]) if str(entry[1]).isdigit() else 0, reverse=True)
    tags = [str(key) for key, _ in ordered[:60] if isinstance(key, str)]
    if source_tag not in tags:
        tags.append(source_tag)
    genre = item.get("genre")
    genres = [part.strip() for part in str(genre or "").split(",") if part.strip()]
    def positive_int(value):
        try:
            return max(0, int(value or 0))
        except (ValueError, TypeError):
            return 0
    online = True if "Online Co-Op" in tags else None
    local = True if any(t in tags for t in ("Local Co-Op", "Split Screen")) else None
    return {
        "appid": appid, "name": name[:170], "tags": tags, "genres": genres,
        "mode_online": online, "mode_local": local, "description": "",
        "positive": positive_int(item.get("positive")),
        "negative": positive_int(item.get("negative")),
        "source": "steamspy"
    }


def main():
    previous = json.loads(DEST.read_text(encoding="utf-8")) if DEST.exists() else {"games": []}
    seed = {int(item["appid"]): item for item in previous.get("games", []) if item.get("source") == "seed"}
    found = {}
    failures = []
    for tag in TAG_REQUESTS:
        if found:
            time.sleep(1.4)  # Public SteamSpy API asks callers to stay below 1 request/sec
        try:
            items = fetch(tag)
        except Exception as exc:
            failures.append(str(tag) + ": " + str(exc))
            continue
        for value in items.values():
            if not isinstance(value, dict):
                continue
            entry = normalize(value, tag)
            if not entry:
                continue
            appid = entry["appid"]
            if appid in found:
                current = found[appid]
                current["tags"] = list(dict.fromkeys(current["tags"] + entry["tags"]))
                current["mode_online"] = current["mode_online"] or entry["mode_online"]
                current["mode_local"] = current["mode_local"] or entry["mode_local"]
            else:
                found[appid] = entry
        print("Tag:", tag, "unique games:", len(found), flush=True)
    if len(found) < 100:
        raise RuntimeError("Too few SteamSpy games: " + str(len(found)) + "; old catalog preserved. " + "; ".join(failures))
    for appid, entry in seed.items():
        if appid not in found:
            found[appid] = entry
        elif entry.get("description"):
            found[appid]["description"] = entry["description"]
    for entry in found.values():
        tags = set(entry["tags"])
        if entry["mode_online"] is None and "Online Co-Op" in tags:
            entry["mode_online"] = True
        if entry["mode_local"] is None and any(t in tags for t in ("Local Co-Op", "Split Screen")):
            entry["mode_local"] = True
    games = sorted(found.values(), key=lambda x: (-x.get("positive", 0), x["name"].casefold()))[:6500]
    output = {
        "updated_at": dt.datetime.now(dt.timezone.utc).date().isoformat(),
        "source": "SteamSpy community tag API; not official Valve metadata",
        "games": games
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("Saved", len(games), "games to", DEST, "errors:", failures)


if __name__ == "__main__":
    main()
