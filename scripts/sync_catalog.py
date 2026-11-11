#!/usr/bin/env python3
"""Create a static catalog of Steam cooperative games for GitHub Pages.

Sources:
  imho.run/datasets/steam-coop-games-all.json  CC BY 4.0; credit and link required.
  steamspy.com/api.php (third-party community tags, 1 req/sec).
No user library or Steam credentials are fetched. The feed may include false positives;
always verify the Steam store before buying.
"""
import datetime as dt
import json
import pathlib
import time
import urllib.parse
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
DEST=ROOT/"data"/"catalog.json"
IMHO="https://imho.run/datasets/steam-coop-games-all.json"
TAGS=("Co-op","Online Co-Op","Local Co-Op","Split Screen","Remote Play Together")
HEADERS={"User-Agent":"CoopCompassCatalogBot/1.1 (https://github.com/psycho-53/coop-compass)"}

def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=65) as response:
        return json.load(response)

def as_int(v):
    try:return max(0,int(v or 0))
    except (TypeError,ValueError):return 0

def main():
    old=json.loads(DEST.read_text(encoding="utf-8")) if DEST.exists() else {"games":[]}
    seeds={int(g["appid"]):g for g in old.get("games",[]) if g.get("source")=="seed"}
    payload=get_json(IMHO)
    rows=payload.get("rows")
    if not isinstance(rows,list) or len(rows)<1000:
        raise RuntimeError("Co-op dataset missing or incomplete; previous file preserved")
    games={}
    for row in rows:
        appid=as_int(row.get("appid"))
        name=str(row.get("name") or "").strip()
        mode=row.get("mode")
        if appid<1 or not name or mode not in ("online","local","both"):
            continue
        games[appid]={
            "appid":appid,"name":name[:180],"tags":[],"genres":[],
            "mode_online":mode in ("online","both"),
            "mode_local":mode in ("local","both"),
            "description":"","positive":0,"negative":0,
            "reviews_bucket":str(row.get("reviews_bucket") or ""),
            "source":"imho"
        }
    print("imho.ru co-op games:",len(games),flush=True)
    for tag in TAGS:
        time.sleep(1.3)
        url="https://steamspy.com/api.php?"+urllib.parse.urlencode({"request":"tag","tag":tag})
        try:
            feed=get_json(url)
        except Exception as exc:
            print("SteamSpy tag unavailable:",tag,exc,flush=True)
            continue
        if not isinstance(feed,dict):
            continue
        for value in feed.values():
            if not isinstance(value,dict):
                continue
            appid=as_int(value.get("appid"))
            if not appid:
                continue
            name=str(value.get("name") or "").strip()
            if appid not in games:
                if not name:continue
                games[appid]={
                    "appid":appid,"name":name[:180],"tags":[],"genres":[],
                    "mode_online":None,"mode_local":None,
                    "description":"","positive":0,"negative":0,
                    "reviews_bucket":"","source":"steamspy"
                }
            g=games[appid]
            voted=value.get("tags") if isinstance(value.get("tags"),dict) else {}
            sorted_tags=sorted(voted.items(),key=lambda kv:as_int(kv[1]),reverse=True)
            for k,_ in sorted_tags[:75]:
                if isinstance(k,str) and k not in g["tags"]:
                    g["tags"].append(k)
            if tag not in g["tags"]:g["tags"].append(tag)
            for cat in str(value.get("genre") or "").split(","):
                cat=cat.strip()
                if cat and cat not in g["genres"]:g["genres"].append(cat)
            g["positive"]=max(g["positive"],as_int(value.get("positive")))
            g["negative"]=max(g["negative"],as_int(value.get("negative")))
            if g["mode_online"] is None and "Online Co-Op" in g["tags"]:g["mode_online"]=True
            if g["mode_local"] is None and any(t in g["tags"] for t in ("Local Co-Op","Split Screen")):g["mode_local"]=True
        print("Enriched tag:",tag,"total:",len(games),flush=True)
    for appid,seed in seeds.items():
        if appid not in games:
            games[appid]=seed
        else:
            g=games[appid]
            g["description"]=seed.get("description","")
            for tag in seed.get("tags",[]):
                if tag not in g["tags"]:g["tags"].append(tag)
    if len(games)<1000:
        raise RuntimeError("Catalog too small; previous data preserved")
    ranked={"20k+":8,"5k+":7,"1k+":6,"500+":5,"100+":4,"50+":3,"10+":2,"<10":1}
    output={
        "updated_at":dt.datetime.now(dt.timezone.utc).date().isoformat(),
        "source":"imho.run CC BY 4.0 (co-op classification); SteamSpy (community tags)",
        "attribution":"https://imho.run/datasets",
        "games":sorted(games.values(),key=lambda g:(-ranked.get(g.get("reviews_bucket"),0),-g.get("positive",0),g["name"].casefold()))
    }
    DEST.parent.mkdir(parents=True,exist_ok=True)
    DEST.write_text(json.dumps(output,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    print("Saved",len(output["games"]),"games to",DEST)

if __name__=="__main__":
    main()
