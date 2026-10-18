#!/usr/bin/env python3
"""Benchmark Python (1 y 2 workers) vs Rust: RSS en reposo/carga/picos de login y latencias.
Requiere cargo build --release, scripts/mariadb_local.sh start. Usa BD locales refleja_bench_*.
Uso: RS_PROFILE=release back-rs/bench/bench.py [--requests 3000] [--threads 16]
"""
import json, os, statistics, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests" / "contract"))
import diff as D

REQUESTS = int(sys.argv[sys.argv.index("--requests") + 1]) if "--requests" in sys.argv else 3000
THREADS = int(sys.argv[sys.argv.index("--threads") + 1]) if "--threads" in sys.argv else 16
FAST = dict(COLLECT_RATE_PER_MIN="1000000", PING_RATE_PER_MIN="1000000", SESSION_RATE_PER_MIN="1000000",
            PUBLIC_MAX_EVENTS="1000000", PUBLIC_MAX_RUNS="1000000", PUBLIC_MAX_ACTIONS="1000000")


def tree_rss_kb(pid):
    out = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,rss="], capture_output=True, text=True).stdout.split("\n")
    rows = [tuple(map(int, l.split())) for l in out if l.strip()]
    kids, todo, total = {}, [pid], 0
    for p, pp, r in rows:
        kids.setdefault(pp, []).append((p, r))
    rss = {p: r for p, _, r in rows}
    seen = set()
    while todo:
        x = todo.pop()
        if x in seen: continue
        seen.add(x); total += rss.get(x, 0)
        todo += [k for k, _ in kids.get(x, [])]
    return total


def call(port, method, path, headers=None, body=None):
    h = dict(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    if data: h["content-type"] = "application/json"
    t = time.perf_counter()
    try:
        r = urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, method=method, headers=h), timeout=60)
        code, txt = r.status, r.read()
    except urllib.error.HTTPError as e:
        code, txt = e.code, e.read()
    return code, (time.perf_counter() - t) * 1000, txt


def workload(port, n, threads, admin_token):
    lat, errs, lock = [], [0], threading.Lock()
    def worker(k):
        c, _, b = call(port, "POST", "/api/public/session", body={"turnstile_token": "dev-bypass"})
        tok = json.loads(b)["token"]
        H = {"X-Refleja-Token": tok}
        for i in range(n // threads):
            ru = f"{k:08d}-0000-4000-8000-{i % 10:012d}"
            ops = [
                ("POST", "/api/public/collect", H, {"events": [{"type": "run_start", "run_uid": ru}, {"type": "answer", "run_uid": ru, "question_id": "age", "next_id": "start", "step": 1}, {"type": "page_view"}]}),
                ("POST", "/api/public/ping", H, None),
                ("GET", "/api/platform/overview", {"Authorization": "Bearer " + admin_token}, None),
            ]
            m, p, h, b = ops[i % 3]
            code, ms, _ = call(port, m, p, h, b)
            with lock:
                lat.append(ms)
                if code >= 500: errs[0] += 1
    ts = [threading.Thread(target=worker, args=(k,)) for k in range(threads)]
    t0 = time.perf_counter()
    [t.start() for t in ts]; [t.join() for t in ts]
    dur = time.perf_counter() - t0
    lat.sort()
    return dict(req=len(lat), rps=round(len(lat) / dur), p50=round(lat[len(lat) // 2], 1), p95=round(lat[int(len(lat) * .95)], 1), p99=round(lat[int(len(lat) * .99)], 1), errors5xx=errs[0])


def logins_peak(port, pid, n=8):
    peak, stop = [0], threading.Event()
    def sampler():
        while not stop.is_set():
            peak[0] = max(peak[0], tree_rss_kb(pid)); time.sleep(0.02)
    s = threading.Thread(target=sampler); s.start()
    L = {"username": D.ADMIN_USER, "password": D.ADMIN_PASS, "turnstile_token": "dev-bypass"}
    ts = [threading.Thread(target=lambda: call(port, "POST", "/api/auth/login", body=L)) for _ in range(n)]
    t0 = time.perf_counter(); [t.start() for t in ts]; [t.join() for t in ts]
    d = time.perf_counter() - t0
    stop.set(); s.join()
    return peak[0], d


def run(label, kind, port, extra=None, workers=None):
    db = "refleja_bench_" + kind
    D.setup_db(db); D.seed_admins(db, PWH)
    env = {**D.BASE_ENV, **FAST, **(extra or {})}
    D.BASE_ENV_BACKUP = D.BASE_ENV
    old = dict(D.BASE_ENV); D.BASE_ENV.update(FAST)
    try:
        if kind == "py" and workers:
            p = start_py_workers(db, port, workers)
        else:
            p = D.start(kind, db, port)
    finally:
        D.BASE_ENV.clear(); D.BASE_ENV.update(old)
    time.sleep(1)
    idle = tree_rss_kb(p.pid)
    c, _, b = call(port, "POST", "/api/auth/login", body={"username": D.ADMIN_USER, "password": D.ADMIN_PASS, "turnstile_token": "dev-bypass"})
    after_login = tree_rss_kb(p.pid)
    tok = json.loads(b)["access_token"]
    w = workload(port, REQUESTS, THREADS, tok)
    loaded = tree_rss_kb(p.pid)
    peak, d = logins_peak(port, p.pid)
    settled = tree_rss_kb(p.pid)
    D.stop(p)
    return dict(label=label, rss_idle_mb=round(idle / 1024, 1), rss_after_1_login_mb=round(after_login / 1024, 1), rss_after_load_mb=round(loaded / 1024, 1),
                rss_peak_8_concurrent_logins_mb=round(peak / 1024, 1), rss_settled_mb=round(settled / 1024, 1), **w)


def start_py_workers(db, port, workers):
    env = {**os.environ, **D.BASE_ENV, "DATABASE_URL": f"mysql+pymysql://refleja:dev_only_pw@127.0.0.1:33306/{db}?charset=utf8mb4", "PYTHONPATH": str(D.BACK), "PYTHONDONTWRITEBYTECODE": "1"}
    p = subprocess.Popen([str(D.PY), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port), "--workers", str(workers), "--log-level", "warning"],
                         cwd=tempfile.gettempdir(), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(80):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1); return p
        except Exception: time.sleep(0.25)
    raise RuntimeError("py workers no arrancó")


if __name__ == "__main__":
    subprocess.run([str(D.RS / "scripts" / "mariadb_local.sh"), "start"], check=True, capture_output=True)
    PWH = D.hash_pw()
    mock = D.start_mock()
    res = [run("Python 1 worker (uvicorn)", "py", D.PORT_PY),
           run("Python 2 workers (como producción)", "py", D.PORT_PY, workers=2),
           run("Rust (1 proceso)", "rs", D.PORT_RS)]
    mock.shutdown()
    print(json.dumps(res, indent=2, ensure_ascii=False))
