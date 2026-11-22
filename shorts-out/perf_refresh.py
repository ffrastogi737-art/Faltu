# Paste into COMPOSIO_REMOTE_WORKBENCH (a Haiku subagent can do it). Prints one line per video: ch|id|privacy|publishAt|publishedAt|views|likes|title
# Then save the printed lines to a file and run: python3 shorts-out/perf_merge.py < file     (CHANNEL CARE, 21:00 run)
out=[]
for acct,ch in (("youtube_maimon-mealy","UCNtzvOyrcKhdA1HiM8frvkg"),("youtube_volt-equal","UCO8lnJFO1TLtHPkn9cCNPng")):
    ids=[];tok=None
    for _ in range(3):
        a={"playlistId":"UU"+ch[2:],"maxResults":50,"part":"contentDetails"}
        if tok:a["pageToken"]=tok
        r,e=run_composio_tool("YOUTUBE_LIST_PLAYLIST_ITEMS",a,account=acct)
        d=r.get("data",{});d=d.get("data",d)
        ids+=[i["contentDetails"]["videoId"] for i in d.get("items",[])]
        tok=d.get("nextPageToken")
        if not tok:break
    for k in range(0,len(ids),50):
        r,e=run_composio_tool("YOUTUBE_GET_VIDEO_DETAILS_BATCH",{"id":ids[k:k+50],"parts":["snippet","statistics","status"]},account=acct)
        d=r.get("data",{});d=d.get("data",d)
        for v in d.get("items",[]):
            s=v["statistics"];n=v["snippet"]
            out.append("|".join([ch[2:5],v["id"],v["status"]["privacyStatus"],v["status"].get("publishAt","")[:16],n["publishedAt"][:16],s.get("viewCount","0"),s.get("likeCount","0"),n["title"][:45].replace("|"," ")]))
print("\n".join(out))
