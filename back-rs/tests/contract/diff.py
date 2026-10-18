#!/usr/bin/env python3
"""Arnés diferencial: backend Python (back/) vs backend Rust (back-rs/).

Levanta ambos contra dos bases MariaDB locales con el mismo esquema, ejecuta los mismos
escenarios HTTP y compara respuestas normalizadas + estado final de las tablas.
No toca producción ni lee `.env`. Secretos y contraseñas son valores de prueba.

Uso:  back-rs/tests/contract/diff.py [--keep]   (requiere: scripts/mariadb_local.sh, cargo build, back/.venv)
"""
import http.server, json, os, re, socketserver, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BACK = ROOT / "back"
RS = ROOT / "back-rs"
PY = BACK / ".venv" / "bin" / "python"
RS_BIN = RS / "target" / ("release" if os.environ.get("RS_PROFILE") == "release" else "debug") / "refleja-api"
SOCK = Path(os.environ.get("MDB_DIR", os.environ.get("TMPDIR", "/tmp") + "/refleja-mariadb")) / "mysql.sock"
PORT_PY, PORT_RS, PORT_MOCK = 29832, 29833, 29834
ADMIN_USER, ADMIN_PASS = "admin_test", "TestAdmin#2026-ok"
SECRETS = dict(JWT_SECRET="j" * 48, PUBLIC_TOKEN_SECRET="p" * 48, VID_HMAC_KEY="v" * 48)
BASE_ENV = dict(
    ENV="development", DEV_BYPASS_TURNSTILE="true", TURNSTILE_SECRET_LOGIN="sl", TURNSTILE_SECRET_INVISIBLE="si",
    TURNSTILE_VERIFY_URL=f"http://127.0.0.1:{PORT_MOCK}/siteverify",
    PUBLIC_MAX_EVENTS="40", PUBLIC_MAX_RUNS="3", PUBLIC_MAX_ACTIONS="6",
    COLLECT_RATE_PER_MIN="12", PING_RATE_PER_MIN="5", SESSION_RATE_PER_MIN="30", **SECRETS,
)


def sh(*a, **k):
    return subprocess.run(a, check=True, capture_output=True, text=True, **k)


def mdb(db, sql):
    r = subprocess.run(["mariadb", "--no-defaults", "-S", str(SOCK), "-uroot", db, "-N", "-B", "-e", sql], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout


# ---------------------------------------------------------------- Turnstile simulado
class Mock(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length", 0))).decode()
        ok = "response=good-token" in body
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"success": ok}).encode())

    def log_message(self, *a):
        pass


def start_mock():
    class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True
    s = S(("127.0.0.1", PORT_MOCK), Mock)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


# ---------------------------------------------------------------- procesos
def setup_db(name):
    mdb("mysql", f"DROP DATABASE IF EXISTS {name}")
    sh(str(RS / "scripts" / "apply_schema.sh"), name)


def seed_admins(db, pw_hash):
    mdb(db, f"INSERT INTO admin_user (username,password_hash,is_active) VALUES ('{ADMIN_USER}','{pw_hash}',1),('inactivo','{pw_hash}',0)")


def hash_pw():
    code = "from app.security import hash_password; print(hash_password('%s'))" % ADMIN_PASS
    return subprocess.run([str(PY), "-c", code], cwd=tempfile.gettempdir(), env={**os.environ, "PYTHONPATH": str(BACK)}, capture_output=True, text=True, check=True).stdout.strip()


def start(kind, db, port, extra=None):
    env = {**os.environ, **BASE_ENV, **(extra or {})}
    log = open(f"/tmp/refleja-diff-{kind}-{port}.log", "w")
    if kind == "py":
        env.update(DATABASE_URL=f"mysql+pymysql://refleja:dev_only_pw@127.0.0.1:33306/{db}?charset=utf8mb4", PYTHONPATH=str(BACK), PYTHONDONTWRITEBYTECODE="1")
        p = subprocess.Popen([str(PY), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)], cwd=tempfile.gettempdir(), env=env, stdout=log, stderr=log)
    else:
        env.update(DATABASE_URL=f"mysql://refleja:dev_only_pw@127.0.0.1:33306/{db}", APP_PORT=str(port), RUST_LOG="warn")
        p = subprocess.Popen([str(RS_BIN)], cwd=str(RS), env=env, stdout=log, stderr=log)
    for _ in range(80):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1)
            return p
        except Exception:
            if p.poll() is not None:
                raise RuntimeError(f"{kind} terminó: {open(log.name).read()[-800:]}")
            time.sleep(0.25)
    raise RuntimeError(f"{kind} no arrancó")


# ---------------------------------------------------------------- cliente + normalización
JWT = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
TS = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?$")
KEEP_HDRS = ["content-type", "allow", "www-authenticate", "location", "vary", "access-control-allow-origin", "access-control-allow-methods",
             "access-control-allow-headers", "access-control-allow-credentials", "access-control-max-age", "set-cookie"]


TOLERATED_MSG = {"json_invalid", "date_from_datetime_parsing"}  # textos libres (ADR-008); se compara type/loc/estado


def norm_json(v, key=None):
    if isinstance(v, dict) and v.get("type") in TOLERATED_MSG and "loc" in v:
        v = {**v, "msg": "<msg>", "ctx": "<ctx>"}
    if isinstance(v, dict):
        return {k: norm_json(x, k) for k, x in v.items()}
    if isinstance(v, list):
        return [norm_json(x) for x in v]
    if isinstance(v, str):
        if JWT.fullmatch(v):
            return "<jwt>"
        if TS.match(v):
            return "<ts>"
    if key == "seconds_ago" and isinstance(v, int):
        return 0 if v <= 10 else v
    return v


def norm_hdr(k, v, port):
    v = v.replace(f"127.0.0.1:{port}", "HOST")
    if k == "set-cookie":
        v = JWT.sub("<jwt>", v)
        v = re.sub(r"expires=[^;]+", "expires=<date>", v)
    return v


class Client:
    def __init__(self, port):
        self.port, self.log, self.cookie, self.vars = port, [], None, {}

    def req(self, label, method, path, headers=None, body=None, raw=None, cookie=True, record=True):
        h = dict(headers or {})
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            h.setdefault("content-type", "application/json")
        if raw is not None:
            data = raw
        if cookie and self.cookie:
            h["Cookie"] = self.cookie
        rq = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data, method=method, headers=h)

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None
        op = urllib.request.build_opener(NoRedirect)
        try:
            r = op.open(rq, timeout=20)
            code, hd, txt = r.status, r.headers, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            code, hd, txt = e.code, e.headers, e.read().decode("utf-8", "replace")
        hdrs = {}
        for k in KEEP_HDRS:
            vals = hd.get_all(k)
            if vals:
                hdrs[k] = [norm_hdr(k, x, self.port) for x in vals]
        try:
            j = json.loads(txt)
            bodyn = ("json", norm_json(j))
            self.last_json = j
        except Exception:
            bodyn = ("text", txt if "<html" not in txt.lower() else "<html>")
            self.last_json = None
        self.last_headers = hd
        if record:
            self.log.append({"label": label, "status": code, "headers": hdrs, "body": bodyn})
        return code


def scenario(c, ext):
    """Escenario único ejecutado idéntico en ambos backends."""
    CF = {"CF-IPCountry": "MX", "CF-Connecting-IP": "203.0.113.7", "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari"}
    ORIGIN = {"Origin": "https://refleja.org"}
    # ---- meta / framework
    c.req("health", "GET", "/api/health")
    c.req("nope", "GET", "/api/nope")
    c.req("health PUT", "PUT", "/api/health")
    c.req("health POST", "POST", "/api/health")
    c.req("health HEAD", "HEAD", "/api/health")
    c.req("health slash", "GET", "/api/health/")
    c.req("health slash query", "GET", "/api/health/?x=1&y=2")
    c.req("collect slash POST", "POST", "/api/public/collect/", body={})
    c.req("nope slash", "GET", "/api/nope/")
    c.req("root", "GET", "/")
    c.req("OPTIONS bare", "OPTIONS", "/api/health")
    pre = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-refleja-token,content-type"}
    c.req("preflight ok", "OPTIONS", "/api/public/collect", {**ORIGIN, **pre})
    c.req("preflight www", "OPTIONS", "/api/public/collect", {"Origin": "https://www.refleja.org", **pre})
    c.req("preflight bad origin", "OPTIONS", "/api/public/collect", {"Origin": "https://evil.com", **pre})
    c.req("preflight bad method", "OPTIONS", "/api/public/collect", {**ORIGIN, "Access-Control-Request-Method": "DELETE"})
    c.req("preflight bad header", "OPTIONS", "/api/public/collect", {**ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-evil"})
    c.req("preflight no hdrs", "OPTIONS", "/api/auth/login", {**ORIGIN, "Access-Control-Request-Method": "POST"})
    c.req("health origin ok", "GET", "/api/health", ORIGIN)
    c.req("health origin bad", "GET", "/api/health", {"Origin": "https://evil.com"})
    c.req("health localhost", "GET", "/api/health", {"Origin": "http://localhost:8788"})
    c.req("404 with origin", "GET", "/api/nope", ORIGIN)

    # ---- public/session
    c.req("session no body", "POST", "/api/public/session")
    c.req("session {}", "POST", "/api/public/session", body={})
    c.req("session int", "POST", "/api/public/session", body={"turnstile_token": 5})
    c.req("session empty", "POST", "/api/public/session", body={"turnstile_token": ""})
    c.req("session long", "POST", "/api/public/session", body={"turnstile_token": "x" * 2049})
    c.req("session not obj", "POST", "/api/public/session", body=[1])
    c.req("session bad json", "POST", "/api/public/session", raw=b"{bad", headers={"content-type": "application/json"})
    c.req("session text/plain", "POST", "/api/public/session", raw=b'{"turnstile_token":"dev-bypass"}', headers={"content-type": "text/plain"})
    c.req("session no ctype", "POST", "/api/public/session", raw=b'{"turnstile_token":"x"}')
    c.req("session bad token", "POST", "/api/public/session", {**CF}, body={"turnstile_token": "bad-token"})
    c.req("session good-token", "POST", "/api/public/session", {**CF}, body={"turnstile_token": "good-token"})
    c.req("session bypass", "POST", "/api/public/session", {**CF}, body={"turnstile_token": "dev-bypass"})
    c.req("session extra fields", "POST", "/api/public/session", {**CF}, body={"turnstile_token": "dev-bypass", "x": 1})
    pub = c.last_json["token"] if c.last_json else ""
    c.vars["pub"] = pub
    # tokens para distintos perfiles de visitante
    def new_token(headers):
        c.req("session*", "POST", "/api/public/session", headers, body={"turnstile_token": "dev-bypass"}, record=False)
        return c.last_json["token"]
    t_nocf = new_token({"User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120"})
    t_tab = new_token({"CF-IPCountry": "XX", "User-Agent": "Mozilla/5.0 (iPad; CPU OS 17_0) Safari"})
    t_t1 = new_token({"CF-IPCountry": "T1"})
    t_us = new_token({"CF-IPCountry": "us", "User-Agent": "Mozilla/5.0 (Linux; Android 13) Mobile"})
    c.vars.update(t_nocf=t_nocf)

    # ---- ping
    P = lambda t: {"X-Refleja-Token": t}
    c.req("ping none", "POST", "/api/public/ping")
    c.req("ping empty", "POST", "/api/public/ping", P(""))
    c.req("ping garbage", "POST", "/api/public/ping", P("abc"))
    c.req("ping bad sig", "POST", "/api/public/ping", P(pub[:-3] + ("aaa" if not pub.endswith("aaa") else "bbb")))
    c.req("ping ok", "POST", "/api/public/ping", {**CF, **P(pub)})
    ext.setdefault("expired_public", None)
    if ext.get("expired_public"):
        c.req("ping expired", "POST", "/api/public/ping", P(ext["expired_public"]))
        c.req("ping access-as-public", "POST", "/api/public/ping", P(ext["wrong_typ"]))
        c.req("ping alg none", "POST", "/api/public/ping", P(ext["alg_none"]))
        c.req("ping no vid", "POST", "/api/public/ping", P(ext["no_vid"]))
    for i in range(6):
        c.req(f"ping rl {i}", "POST", "/api/public/ping", P(t_us))

    # ---- collect: validación
    C = lambda t, **kw: dict(headers={**CF, **P(t)}, **kw)
    c.req("collect no token", "POST", "/api/public/collect", body={})
    c.req("collect no token + bad body", "POST", "/api/public/collect", raw=b"{bad")
    c.req("collect empty events", "POST", "/api/public/collect", **C(t_nocf, body={"events": []}))
    c.req("collect no body", "POST", "/api/public/collect", headers={**P(t_nocf)})
    c.req("collect bad type", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "bogus"}]}))
    c.req("collect no type", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{}]}))
    c.req("collect 51", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "restart"}] * 51}))
    c.req("collect events str", "POST", "/api/public/collect", **C(t_nocf, body={"events": "x"}))
    c.req("collect events null", "POST", "/api/public/collect", **C(t_nocf, body={"events": None}))
    c.req("collect no events no type", "POST", "/api/public/collect", **C(t_nocf, body={"foo": 1}))
    c.req("collect list body", "POST", "/api/public/collect", **C(t_nocf, body=[{"type": "restart"}]))
    c.req("collect event not obj", "POST", "/api/public/collect", **C(t_nocf, body={"events": [5]}))
    c.req("collect step 21", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "answer", "step": 21}]}))
    c.req("collect step -1", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "answer", "step": -1}]}))
    c.req("collect step str5", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "restart", "step": "5"}]}))
    c.req("collect step 5.0", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "restart", "step": 5.0}]}))
    c.req("collect step 5.5", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "restart", "step": 5.5}]}))
    c.req("collect step abc", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "restart", "step": "abc"}]}))
    c.req("collect step true", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "restart", "step": True}]}))
    c.req("collect step list", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "restart", "step": [1]}]}))
    c.req("collect run_uid int", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "run_start", "run_uid": 5}]}))
    c.req("collect run_uid 37", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "run_start", "run_uid": "x" * 37}]}))
    c.req("collect qid 33", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "answer", "question_id": "q" * 33}]}))
    c.req("collect muni 49", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "municipio", "municipio": "m" * 49}]}))
    c.req("collect flow bad", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "answer", "flow_type": "x"}]}))
    c.req("collect age bad", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "answer", "age_bucket": "x"}]}))
    c.req("collect risk bad", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "result", "risk_level": 1}]}))
    c.req("collect device bad", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "restart", "device": "tv"}]}))
    c.req("collect scores 61", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "result", "scores": {"fisica": 61}}]}))
    c.req("collect scores -1", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "result", "scores": {"fisica": -1}}]}))
    c.req("collect scores not obj", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "result", "scores": 3}]}))
    c.req("collect multi errors", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "bogus"}, {"type": "answer", "step": 99}]}))
    c.req("collect nulls ok", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "restart", "run_uid": None, "step": None, "scores": None}]}))
    c.req("collect extra field", "POST", "/api/public/collect", **C(t_nocf, body={"events": [{"type": "restart", "zzz": 1}]}))
    c.req("collect legacy single", "POST", "/api/public/collect", **C(t_nocf, body={"type": "hide_click"}))
    c.req("collect single + events", "POST", "/api/public/collect", **C(t_nocf, body={"type": "hide_click", "events": []}))
    c.req("collect text/plain", "POST", "/api/public/collect", headers={**P(t_nocf), "content-type": "text/plain"}, raw=b'{"events":[]}')
    c.req("collect access as public", "POST", "/api/public/collect", headers=P("x.y.z"), body={})

    # ---- collect: flujo completo (token t_tab, runs fijos)
    R1, R2, R3, R4 = ["00000000-0000-4000-8000-00000000000%d" % i for i in range(1, 5)]
    full = [
        {"type": "page_view", "device": "tablet"},
        {"type": "run_start", "run_uid": R1},
        {"type": "answer", "run_uid": R1, "question_id": "age", "next_id": "start", "step": 1, "age_bucket": "26-40"},
        {"type": "answer", "run_uid": R1, "question_id": "start", "next_id": "pareja_1", "flow_type": "pareja", "step": 2},
        {"type": "answer", "run_uid": R1, "question_id": "pareja_1", "next_id": "fam_1", "step": 3},
        {"type": "answer", "run_uid": R1, "question_id": "pareja_1", "next_id": "pareja_2", "step": 3},
        {"type": "answer", "run_uid": R1, "question_id": "pareja_2", "next_id": "pareja_3", "step": 4},
        {"type": "municipio", "run_uid": R1, "municipio": "San Nicolas De Los Garza"},
        {"type": "result", "run_uid": R1, "risk_level": "high", "scores": {"psicologica": 7, "fisica": 7, "sexual": 2}, "municipio": "monterrey"},
        {"type": "result", "run_uid": R1, "risk_level": "low"},
        {"type": "directory_municipio", "municipio": "apodaca"},
        {"type": "directory_municipio", "municipio": "Cadereyta Jiménez"},
    ]
    c.req("collect full", "POST", "/api/public/collect", **C(t_tab, body={"events": full}))
    c.req("collect full again (idempotent)", "POST", "/api/public/collect", **C(t_tab, body={"events": full[1:7]}))
    c.req("collect minor", "POST", "/api/public/collect", **C(t_tab, body={"events": [
        {"type": "run_start", "run_uid": R2}, {"type": "answer", "run_uid": R2, "question_id": "age", "age_bucket": "minor", "step": 1},
        {"type": "minor", "run_uid": R2}, {"type": "minor", "run_uid": R2}]}))
    c.req("collect trab flow", "POST", "/api/public/collect", **C(t_tab, body={"events": [
        {"type": "answer", "run_uid": R3, "question_id": "age", "next_id": "start", "flow_type": "trab", "age_bucket": "18-25", "step": 1},
        {"type": "answer", "run_uid": R3, "question_id": "trab_1", "next_id": "trab_2", "flow_type": "fam", "step": 2},
        {"type": "answer", "run_uid": R3, "question_id": "fam_1", "step": 3},
        {"type": "answer", "run_uid": R3, "question_id": "", "next_id": "", "step": 3},
        {"type": "municipio", "run_uid": R3, "municipio": "nope"},
        {"type": "result", "run_uid": R3, "municipio": "linares", "scores": {}}]}))
    c.req("collect run quota (4th run)", "POST", "/api/public/collect", **C(t_tab, body={"events": [
        {"type": "run_start", "run_uid": R4}, {"type": "run_start", "run_uid": "00000000-0000-4000-8000-0000000000aa"}]}))
    c.req("collect no run_uid", "POST", "/api/public/collect", **C(t_tab, body={"events": [{"type": "answer", "question_id": "age"}, {"type": "run_start", "run_uid": ""}]}))
    c.req("collect other visitor mutates run", "POST", "/api/public/collect", **C(t_t1, body={"events": [{"type": "answer", "run_uid": R1, "question_id": "pareja_3", "next_id": "pareja_4", "step": 5}]}))
    c.req("collect actions quota", "POST", "/api/public/collect", **C(t_t1, body={"events": [{"type": "urgent_click"}] * 5 + [{"type": "hide_click"}] * 3 + [{"type": "page_view"}]}))
    c.req("collect actions over", "POST", "/api/public/collect", **C(t_t1, body={"events": [{"type": "restart"}, {"type": "run_start", "run_uid": "00000000-0000-4000-8000-0000000000bb"}]}))
    # cuota de eventos por vida (40)
    for i in range(3):
        c.req(f"collect events quota {i}", "POST", "/api/public/collect", **C(t_us, body={"events": [{"type": "run_start", "run_uid": f"00000000-0000-4000-8000-0000000001{i}{j}"} for j in range(1, 2)] * 1 + [{"type": "hide_click"}] * 14}))
    # rate limit collect (12/min por token)
    for i in range(14):
        c.req(f"collect rl {i}", "POST", "/api/public/collect", **C(t_nocf, body={"events": []}))

    # ---- auth
    J = {"content-type": "application/json"}
    L = lambda u, p, t="dev-bypass": {"username": u, "password": p, "turnstile_token": t}
    c.req("login no body", "POST", "/api/auth/login")
    c.req("login missing", "POST", "/api/auth/login", body={"username": "a"})
    c.req("login long user", "POST", "/api/auth/login", body=L("u" * 65, "x"))
    c.req("login long pass", "POST", "/api/auth/login", body=L("u", "x" * 257))
    c.req("login empty pass", "POST", "/api/auth/login", body=L("u", ""))
    c.req("login bad turnstile", "POST", "/api/auth/login", body=L(ADMIN_USER, ADMIN_PASS, "bad-token"))
    c.req("login bad turnstile mock ok", "POST", "/api/auth/login", body=L(ADMIN_USER, ADMIN_PASS, "good-token"), record=False)
    c.req("login unknown", "POST", "/api/auth/login", body=L("nadie", "xxxxxxxx"))
    c.req("login wrong pw", "POST", "/api/auth/login", body=L(ADMIN_USER, "wrong"))
    c.req("login inactive", "POST", "/api/auth/login", body=L("inactivo", ADMIN_PASS))
    c.req("login case-insens user", "POST", "/api/auth/login", {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Firefox/120"}, body=L(ADMIN_USER.upper(), ADMIN_PASS), record=True)
    c.req("login ok", "POST", "/api/auth/login", {"User-Agent": "Mozilla/5.0 (Windows NT 10.0) Edg/120 Chrome/120", "CF-IPCountry": "MX"}, body=L(ADMIN_USER, ADMIN_PASS))
    at = c.last_json["access_token"]
    c.cookie = c.last_headers.get_all("set-cookie")[0].split(";")[0]
    c.vars["access"], c.vars["refresh_cookie"] = at, c.cookie
    A = {"Authorization": "Bearer " + at}
    c.req("me no auth", "GET", "/api/auth/me")
    c.req("me basic", "GET", "/api/auth/me", {"Authorization": "Basic abc"})
    c.req("me bearer garbage", "GET", "/api/auth/me", {"Authorization": "Bearer abc"})
    c.req("me bearer lower", "GET", "/api/auth/me", {"Authorization": "bearer " + at})
    c.req("me bearer extra space", "GET", "/api/auth/me", {"Authorization": "Bearer   " + at})
    c.req("me ok", "GET", "/api/auth/me", A)
    c.req("me refresh-as-access", "GET", "/api/auth/me", {"Authorization": "Bearer " + c.cookie.split("=", 1)[1]})
    c.req("me public-as-access", "GET", "/api/auth/me", {"Authorization": "Bearer " + pub})
    if ext.get("expired_access"):
        c.req("me expired", "GET", "/api/auth/me", {"Authorization": "Bearer " + ext["expired_access"]})
        c.req("me sub int", "GET", "/api/auth/me", {"Authorization": "Bearer " + ext["sub_int"]})
        c.req("me inactive user token", "GET", "/api/auth/me", {"Authorization": "Bearer " + ext["inactive_access"]})
        c.req("me unknown user token", "GET", "/api/auth/me", {"Authorization": "Bearer " + ext["ghost_access"]})
    # ---- platform (datos del escenario)
    for q in ["overview", "realtime", "funnel", "violence", "municipios", "logins", "timeseries"]:
        c.req("platform " + q + " noauth", "GET", "/api/platform/" + q)
    c.req("platform bad date noauth", "GET", "/api/platform/overview?date_from=bad")
    qs = ["overview", "overview?flow_type=pareja", "overview?flow_type=zzz", "overview?municipio=linares", "overview?municipio=", "overview?date_from=2020-01-01&date_to=2099-01-01",
          "overview?date_from=2099-01-01", "overview?date_to=2000-01-01", "overview?date_from=bad", "overview?date_from=2026-13-45", "overview?date_from=",
          "overview?date_from=2026-01-01T00:00:00", "overview?date_from=2026-01-01T10:00:00", "overview?date_from=20260101",
          "realtime", "realtime?window_seconds=5&limit=1", "realtime?window_seconds=4", "realtime?window_seconds=901", "realtime?limit=0", "realtime?limit=101", "realtime?limit=x",
          "realtime?limit=3&limit=2", "realtime?limit=5.0", "realtime?limit=%205", "funnel", "violence", "violence?flow_type=pareja", "violence?municipio=monterrey",
          "violence?date_from=2020-01-01", "violence?flow_type=nada", "municipios", "municipios?limit=1", "municipios?limit=0", "municipios?limit=101", "municipios?flow_type=pareja",
          "municipios?municipio=ignorado", "logins", "logins?limit=1", "logins?limit=0", "logins?limit=501", "logins?limit=500", "timeseries", "timeseries?date_from=2020-01-01&date_to=2099-12-31",
          "timeseries?date_from=2099-01-01", "timeseries?date_to=2000-01-01", "timeseries?date_from=x"]
    for q in qs:
        c.req("platform " + q, "GET", "/api/platform/" + q, A)
    # ---- refresh / reuso / logout
    c.req("refresh no cookie", "POST", "/api/auth/refresh", cookie=False)
    c.req("refresh garbage cookie", "POST", "/api/auth/refresh", {"Cookie": "refleja_rt=abc"}, cookie=False)
    c.req("refresh wrong typ cookie", "POST", "/api/auth/refresh", {"Cookie": "refleja_rt=" + at}, cookie=False)
    old = c.cookie
    c.req("refresh ok", "POST", "/api/auth/refresh")
    new = c.last_headers.get_all("set-cookie")[0].split(";")[0]
    c.cookie = new
    c.req("refresh reuse old", "POST", "/api/auth/refresh", {"Cookie": old}, cookie=False)
    c.req("refresh after family revoke", "POST", "/api/auth/refresh")
    c.req("me still ok (access)", "GET", "/api/auth/me", A)
    # nueva sesión + logout
    c.req("login 2", "POST", "/api/auth/login", body=L(ADMIN_USER, ADMIN_PASS))
    c.cookie = c.last_headers.get_all("set-cookie")[0].split(";")[0]
    c.req("logout ok", "POST", "/api/auth/logout")
    c.req("refresh after logout", "POST", "/api/auth/refresh")
    c.req("logout again", "POST", "/api/auth/logout")
    c.req("logout no cookie", "POST", "/api/auth/logout", cookie=False)
    c.req("logout garbage", "POST", "/api/auth/logout", {"Cookie": "refleja_rt=abc"}, cookie=False)
    c.req("logout GET", "GET", "/api/auth/logout")
    c.req("me POST", "POST", "/api/auth/me")
    c.req("platform POST", "POST", "/api/platform/overview")
    # login rate / body variants al final
    c.req("login text/plain", "POST", "/api/auth/login", raw=b"{}", headers={"content-type": "text/plain"})
    c.req("login unicode", "POST", "/api/auth/login", body=L("ñandú", "contraseña-ñ"))
    # tras el flujo completo: panel con datos finales
    c.req("login 3", "POST", "/api/auth/login", body=L(ADMIN_USER, ADMIN_PASS), record=False)
    A3 = {"Authorization": "Bearer " + c.last_json["access_token"]}
    for q in ["overview", "funnel", "violence", "municipios", "timeseries", "realtime"]:
        c.req("final " + q, "GET", "/api/platform/" + q, A3)
    c.req("final logins", "GET", "/api/platform/logins?limit=3", A3)
    return c


# ---------------------------------------------------------------- tokens especiales
def forge(secret, header, payload):
    import base64, hashlib, hmac
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d, separators=(",", ":")).encode()).rstrip(b"=").decode()
    si = b(header) + "." + b(payload)
    sig = base64.urlsafe_b64encode(hmac.new(secret.encode(), si.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    return si + "." + sig


def special_tokens(ids):
    now = int(time.time())
    H = {"alg": "HS256", "typ": "JWT"}
    return dict(
        expired_public=forge(SECRETS["PUBLIC_TOKEN_SECRET"], H, {"typ": "public", "vid": "abc", "iat": now - 100, "exp": now - 10}),
        wrong_typ=forge(SECRETS["PUBLIC_TOKEN_SECRET"], H, {"typ": "access", "vid": "abc", "iat": now, "exp": now + 100}),
        alg_none=forge("", {"alg": "none", "typ": "JWT"}, {"typ": "public", "vid": "abc", "iat": now, "exp": now + 100}).rsplit(".", 1)[0] + ".",
        no_vid=forge(SECRETS["PUBLIC_TOKEN_SECRET"], H, {"typ": "public", "iat": now, "exp": now + 100}),
        expired_access=forge(SECRETS["JWT_SECRET"], H, {"typ": "access", "sub": "1", "username": "x", "iat": now - 100, "exp": now - 10}),
        sub_int=forge(SECRETS["JWT_SECRET"], H, {"typ": "access", "sub": 1, "username": "x", "iat": now, "exp": now + 100}),
        inactive_access=forge(SECRETS["JWT_SECRET"], H, {"typ": "access", "sub": str(ids["inactivo"]), "username": "x", "iat": now, "exp": now + 100}),
        ghost_access=forge(SECRETS["JWT_SECRET"], H, {"typ": "access", "sub": "99999", "username": "x", "iat": now, "exp": now + 100}),
    )


# ---------------------------------------------------------------- estado de tablas
def dump(db):
    q = lambda s: [tuple(l.split("\t")) for l in mdb(db, s).splitlines() if l]
    out = {}
    out["visitor"] = sorted(q("SELECT IFNULL(country,'NULL'),IFNULL(device,'NULL'),page_views,events_count,run_count,completed_count,action_count FROM visitor"))
    runs = q("SELECT run_uid,IFNULL(age_bucket,'NULL'),IFNULL(flow_type,'NULL'),started,max_step,IFNULL(last_question_id,'NULL'),completed,IFNULL(municipio,'NULL'),IFNULL(risk_level,'NULL'),score_psicologica,score_fisica,score_economica,score_patrimonial,score_sexual,score_intimidacion,IFNULL(counted,'NULL') FROM form_run ORDER BY run_uid")
    fixed = []
    for r in runs:
        r = list(r)
        try:
            r[-1] = json.dumps(json.loads(r[-1]), sort_keys=True) if r[-1] != "NULL" else "NULL"
        except Exception:
            pass
        fixed.append(tuple(r))
    out["form_run"] = fixed
    out["question_stat"] = q("SELECT question_id,reached_count,answered_count FROM question_stat ORDER BY question_id")
    out["event_counter"] = q("SELECT name,count FROM event_counter ORDER BY name")
    out["daily_metric"] = q("SELECT metric_date,page_views,form_starts,form_completes,minors,new_visitors FROM daily_metric ORDER BY metric_date")
    out["admin_login"] = q("SELECT username,IFNULL(browser,'NULL'),IFNULL(os,'NULL'),IFNULL(device,'NULL'),IFNULL(country,'NULL'),IFNULL(user_agent,'NULL') FROM admin_login ORDER BY id")
    out["admin_session"] = q("SELECT (revoked_at IS NOT NULL),CHAR_LENGTH(token_hash),IFNULL(CHAR_LENGTH(user_agent_hash),'NULL') FROM admin_session ORDER BY id")
    out["admin_user"] = q("SELECT username,is_active,(last_login_at IS NOT NULL),LEFT(password_hash,30) FROM admin_user ORDER BY username")
    return out


def compare(a, b, what):
    bad = 0
    for x, y in zip(a, b):
        if x != y:
            bad += 1
            print(f"\n✗ [{what}] {x['label']}")
            for k in ("status", "headers", "body"):
                if x[k] != y[k]:
                    print(f"   {k}:\n     py: {json.dumps(x[k], ensure_ascii=False)[:700]}\n     rs: {json.dumps(y[k], ensure_ascii=False)[:700]}")
    if len(a) != len(b):
        print("longitudes distintas", len(a), len(b)); bad += 1
    return bad


def main():
    keep = "--keep" in sys.argv
    if not RS_BIN.exists():
        sys.exit("falta compilar: cargo build")
    sh(str(RS / "scripts" / "mariadb_local.sh"), "start")
    mock = start_mock()
    pwh = hash_pw()
    for db in ("refleja_py", "refleja_rs"):
        setup_db(db)
        seed_admins(db, pwh)
    ids = {n: int(mdb("refleja_py", f"SELECT id FROM admin_user WHERE username='{n}'").strip()) for n in ("inactivo",)}
    ext = special_tokens(ids)
    procs = []
    try:
        procs = [start("py", "refleja_py", PORT_PY), start("rs", "refleja_rs", PORT_RS)]
        logs = {}
        for name, port in (("py", PORT_PY), ("rs", PORT_RS)):
            logs[name] = scenario(Client(port), dict(ext)).log
            print(f"{name}: {len(logs[name])} respuestas")
        bad = compare(logs["py"], logs["rs"], "http")
        d_py, d_rs = dump("refleja_py"), dump("refleja_rs")
        for t in d_py:
            if d_py[t] != d_rs[t]:
                bad += 1
                print(f"\n✗ [tabla {t}]\n   py: {d_py[t]}\n   rs: {d_rs[t]}")
        print(f"\n{'OK: sin diferencias' if bad == 0 else f'DIFERENCIAS: {bad}'} ({len(logs['py'])} peticiones comparadas, {len(d_py)} tablas)")
        sys.exit(1 if bad else 0)
    finally:
        for p in procs:
            p.terminate()
        mock.shutdown()
        if not keep:
            pass


if __name__ == "__main__":
    main()
