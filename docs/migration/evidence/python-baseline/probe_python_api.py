import json, sys, urllib.request, urllib.error

U = "http://127.0.0.1:29832/api"


def call(method, path, body=None, headers=None, raw=None):
    h = dict(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("content-type", "application/json")
    if raw is not None:
        data = raw
    req = urllib.request.Request(U + path, data=data, method=method, headers=h)
    try:
        r = urllib.request.urlopen(req)
        code, hd, txt = r.status, r.headers, r.read().decode()
    except urllib.error.HTTPError as e:
        code, hd, txt = e.code, e.headers, e.read().decode()
    return code, hd, txt


def show(label, res, maxlen=700):
    code, hd, txt = res
    print(f"### {label} -> {code}")
    for k in ("set-cookie", "www-authenticate"):
        v = hd.get_all(k) if hd else None
        if v:
            print(f"  {k}: " + "; ".join(x.split('=')[0] + '=' + (x.split('=',1)[1][:12] + '…' + x[x.index(';'):] if ';' in x else x) for x in v))
    print("  " + txt[:maxlen].replace("\n", " "))


T = {"turnstile_token": "dev-bypass"}
r = call("POST", "/auth/login", {"username": "admin", "password": "admin", **T})
show("login ok", r)
AT = json.loads(r[2])["access_token"]
rt = [c for c in r[1].get_all("set-cookie")][0].split(";")[0]
A = {"Authorization": "Bearer " + AT}
show("me", call("GET", "/auth/me", headers=A))

r = call("POST", "/public/session", T, {"CF-IPCountry": "MX", "User-Agent": "Mozilla/5.0 (iPhone; Mobi)"})
show("public/session", r)
PT = json.loads(r[2])["token"]
P = {"X-Refleja-Token": PT}
RU = "11111111-1111-1111-1111-111111111111"
evs = [
    {"type": "page_view", "device": "mobile"},
    {"type": "run_start", "run_uid": RU},
    {"type": "answer", "run_uid": RU, "question_id": "age", "next_id": "start", "step": 1, "age_bucket": "18-25"},
    {"type": "answer", "run_uid": RU, "question_id": "start", "next_id": "pareja_1", "flow_type": "pareja", "step": 2},
    {"type": "answer", "run_uid": RU, "question_id": "pareja_1", "next_id": "fam_1", "step": 3},
    {"type": "answer", "run_uid": RU, "question_id": "pareja_1", "next_id": "pareja_2", "step": 3},
    {"type": "municipio", "run_uid": RU, "municipio": "Monterrey"},
    {"type": "result", "run_uid": RU, "risk_level": "high", "scores": {"psicologica": 5, "fisica": 2}, "municipio": "monterrey"},
    {"type": "result", "run_uid": RU, "risk_level": "low"},
    {"type": "directory_municipio", "municipio": "apodaca"},
    {"type": "directory_municipio", "municipio": "no-existe"},
    {"type": "urgent_click"},
]
show("collect batch", call("POST", "/public/collect", {"events": evs}, P))
show("collect legacy single", call("POST", "/public/collect", {"type": "hide_click"}, P))
show("collect invalid type", call("POST", "/public/collect", {"events": [{"type": "bogus"}]}, P))
show("collect 51 events", call("POST", "/public/collect", {"events": [{"type": "restart"}] * 51}, P), 300)
show("collect empty events", call("POST", "/public/collect", {"events": []}, P))
show("collect no body", call("POST", "/public/collect", None, P))
show("collect malformed json", call("POST", "/public/collect", None, {**P, "content-type": "application/json"}, raw=b"{bad"))
show("collect wrong token typ (access as public)", call("POST", "/public/collect", {"events": []}, {"X-Refleja-Token": AT}))
show("ping", call("POST", "/public/ping", None, P))
for e in ("overview", "realtime", "funnel", "violence", "municipios", "timeseries", "logins"):
    show("platform/" + e, call("GET", "/platform/" + e, headers=A), 1500)
show("overview bad date", call("GET", "/platform/overview?date_from=bad", headers=A))
show("realtime limit=0", call("GET", "/platform/realtime?limit=0", headers=A))
show("overview flow_type=zzz", call("GET", "/platform/overview?flow_type=zzz", headers=A), 300)
show("platform with refresh token as bearer", call("GET", "/platform/overview", headers={"Authorization": "Bearer " + rt.split("=",1)[1]}))

# refresh rotation / reuse
def with_cookie(c):
    return {"Cookie": c}
r1 = call("POST", "/auth/refresh", None, with_cookie(rt))
show("refresh #1", r1, 200)
rt2 = r1[1].get_all("set-cookie")[0].split(";")[0]
r2 = call("POST", "/auth/refresh", None, with_cookie(rt))
show("refresh reuse of rotated", r2)
r3 = call("POST", "/auth/refresh", None, with_cookie(rt2))
show("refresh after family revoke", r3)
show("refresh no cookie", call("POST", "/auth/refresh"))
show("logout", call("POST", "/auth/logout", None, with_cookie(rt2)))
show("logout no cookie", call("POST", "/auth/logout"))
