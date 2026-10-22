#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""流水线编排器：模拟 Java 服务 / trae-proxy，逐阶段调用真实 traecli 完成 Phase 0-7。

设计要点：
- 真实部分：traecli exec / review（模型推理、代码生成、代码评审）
- 模拟部分：Tone 触发、Java 服务编排、部署平台（本地 uvicorn + /healthz）
- 状态：pipeline_meta.json；度量：telemetry.jsonl
"""
import json
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEMO_REPO = ROOT / "demo-repo"
WORK = ROOT / "work"
SPECS = WORK / "specs"
LOGS = WORK / "logs"
HISTORY = WORK / "history"
RUNS = WORK / "runs"          # 每条流水线一个独立目录：runs/<pipeline_id>/{specs,logs,report.md,原型图}
BRANCH_DIR = WORK / "branch"  # git worktree 为临时工作区，各轮共用（P5 合并后即移除）
META = ROOT / "pipeline_meta.json"
TELEMETRY = ROOT / "telemetry.jsonl"
BRANCH = "feat/demo"
HEALTH_PORT = 8010
GIT_USER = ("demo", "demo@local")

PHASE_DEFS = [
    ("init", "前置 · 环境检查与初始化"),
    ("p0_context", "P0-1 · 需求理解：拉取上下文 + 理解原型图"),
    ("p2_branch", "P2 · 分支：Worktree 检测创建"),
    ("p3_code", "P3 · AI 编码：按 Spec 生成代码"),
    ("p4_cr", "P4 · AI CR：自动代码评审"),
    ("p5_merge", "P5 · 推送合并：安全合并"),
    ("p6_deploy", "P6 · 部署：本地起服务 + 健康检查"),
    ("p7_test", "P7 · 测试：pytest + 汇总报告"),
]

_lock = threading.Lock()
_pipeline = None          # 当前流水线状态
_app_process = None       # 部署阶段启动的 uvicorn 进程


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _load_last_state():
    """启动时加载上次运行状态，便于重启后仍可查看最近一次结果。"""
    global _pipeline
    if META.exists():
        try:
            _pipeline = json.loads(META.read_text(encoding="utf-8"))
            # 兼容旧版本：已结束但尚未归档的运行补一份归档
            if _pipeline.get("status") in ("done", "failed"):
                f = HISTORY / f"{_pipeline.get('pipeline_id', '')}.json"
                if not f.exists():
                    _archive(_pipeline)
            return
        except Exception:  # noqa: BLE001
            pass
    _pipeline = None


def _new_state(requirement, image):
    pid = time.strftime("demo-%Y%m%d-%H%M%S")
    return {
        "pipeline_id": pid,
        "run_dir": str(RUNS / pid),   # 本轮产物独立目录
        "requirement": requirement,
        "image": image or "",
        "status": "running",          # idle|running|done|failed
        "current_phase": None,
        "phases": [
            {"key": k, "label": label, "status": "pending", "summary": "", "log": "", "duration_ms": None}
            for k, label in PHASE_DEFS
        ],
        "artifacts": {},
        "report": "",
        "health_url": "",
        "error": "",
        "started_at": _now_iso(),
        "finished_at": None,
    }


def get_status():
    with _lock:
        return json.loads(json.dumps(_pipeline)) if _pipeline else None


def _set_phase(key, status, summary=None, log=None, duration_ms=None, state=None):
    for p in state["phases"]:
        if p["key"] == key:
            p["status"] = status
            if status == "running":
                p["started_at"] = int(time.time() * 1000)  # 前端秒表数据源
            if summary is not None:
                p["summary"] = summary
            if log is not None:
                p["log"] = log
            if duration_ms is not None:
                p["duration_ms"] = duration_ms
            break


def _save_meta():
    META.write_text(json.dumps(_pipeline, ensure_ascii=False, indent=2), encoding="utf-8")


def _archive(state):
    """流水线结束后归档完整快照（含规划文档内容），供历史回看。"""
    try:
        HISTORY.mkdir(parents=True, exist_ok=True)
        snap = json.loads(json.dumps(state))
        specs = _specs(state)
        snap["archived_docs"] = {
            "spec": _read_or_empty(specs / "spec.md"),
            "tasks": _read_or_empty(specs / "tasks.md"),
            "checklist": _read_or_empty(specs / "checklist.md"),
        }
        (HISTORY / f"{state['pipeline_id']}.json").write_text(
            json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


def get_history_list():
    """归档列表（新的在前），供操作台展示。"""
    if not HISTORY.exists():
        return []
    items = []
    for f in sorted(HISTORY.glob("*.json"), reverse=True):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        items.append({
            "pipeline_id": d.get("pipeline_id"),
            "requirement": d.get("requirement", ""),
            "status": d.get("status"),
            "started_at": d.get("started_at"),
            "finished_at": d.get("finished_at"),
            "health_url": d.get("health_url", ""),
        })
    return items


def get_history_run(pipeline_id):
    """按 pipeline_id 读取归档快照。"""
    if not re.fullmatch(r"[A-Za-z0-9_-]+", pipeline_id or ""):
        return None
    f = HISTORY / f"{pipeline_id}.json"
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def _telemetry(phase, status, duration_ms):
    line = {
        "pipeline_id": _pipeline["pipeline_id"],
        "phase": phase,
        "status": status,
        "duration_ms": duration_ms,
        "ts": _now_iso(),
    }
    with TELEMETRY.open("a", encoding="utf-8") as f:
        f.write(json.dumps(line, ensure_ascii=False) + "\n")


def _run(cmd, cwd=None, timeout=300, capture=True):
    """运行命令，返回 (rc, out)。stdin 统一重定向避免 traecli exec 挂起等待输入。"""
    proc = subprocess.run(
        cmd, cwd=str(cwd) if cwd else None,
        capture_output=capture, text=True, timeout=timeout,
        stdin=subprocess.DEVNULL,
    )
    return proc.returncode, (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")


def _git(cmd, cwd):
    return _run(["git"] + cmd, cwd=cwd)


def _traecli_exec(cwd, prompt, extra_args=None, timeout=900, out_file=None):
    """调用真实 traecli exec。返回 (rc, raw_out)。"""
    args = ["traecli", "exec", "-C", str(cwd), "--permission-mode", "bypass_permissions",
            "-m", "Kimi-K3"]
    if extra_args:
        args += extra_args
    if out_file:
        args += ["-o", str(out_file)]
    args.append(prompt)
    return _run(args, cwd=cwd, timeout=timeout)


def _traecli_review(cwd, base="main", title="AI Code Review", log_path=None, timeout=900):
    """调用真实 traecli review。

    已知行为：review 产出一段完整评审后进程不自动退出，因此采用
    “输出稳定 + 出现最终消息标记”后主动终止，并带硬超时兜底。
    """
    log_path = Path(log_path or LOGS / "cr.log")
    with log_path.open("w", encoding="utf-8") as f:
        proc = subprocess.Popen(
            ["traecli", "review", "--base", base, "--title", title,
             "-c", 'model="Kimi-K3"'],
            cwd=str(cwd), stdout=f, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
        )
    t0 = time.time()
    last_size = -1
    stable_since = None
    done = False
    while time.time() - t0 < timeout:
        if proc.poll() is not None:
            done = True
            break
        size = log_path.stat().st_size if log_path.exists() else 0
        if size == last_size:
            if stable_since is None:
                stable_since = time.time()
            elif (time.time() - stable_since >= 25
                  and time.time() - t0 >= 45):
                text = log_path.read_text(encoding="utf-8", errors="replace")
                if "\nTraeCode CLI\n" in text:
                    done = True
                    proc.terminate()
                    try:
                        proc.wait(timeout=5)
                    except Exception:  # noqa: BLE001
                        proc.kill()
                    break
        else:
            stable_since = None
        last_size = size
        time.sleep(5)
    if not done:
        proc.kill()
    out = log_path.read_text(encoding="utf-8", errors="replace")
    return proc.returncode, out


def _specs(state=None):
    """当前运行的 specs 目录（新运行为 runs/<pid>/specs，旧状态回退共享目录）。"""
    rd = (state or _pipeline or {}).get("run_dir")
    return (Path(rd) / "specs") if rd else SPECS


def _logs(state=None):
    """当前运行的 logs 目录（新运行为 runs/<pid>/logs，旧状态回退共享目录）。"""
    rd = (state or _pipeline or {}).get("run_dir")
    return (Path(rd) / "logs") if rd else LOGS


def _read_or_empty(path):
    p = Path(path)
    return p.read_text(encoding="utf-8") if p.exists() else ""


def _truncate(text, n=4000):
    text = (text or "").strip()
    return text if len(text) <= n else text[:n] + "\n…（已截断）"


def _kill_app():
    """终止部署进程；并清理 HEALTH_PORT 上可能残留的孤儿进程（历史服务进程退出后遗留）。"""
    global _app_process
    if _app_process and _app_process.poll() is None:
        _app_process.terminate()
        try:
            _app_process.wait(timeout=5)
        except Exception:
            _app_process.kill()
    _app_process = None
    rc, out = _run(["lsof", "-nP", "-ti", f":{HEALTH_PORT}"], timeout=10)
    if rc == 0 and out.strip():
        pids = [p.strip() for p in out.split() if p.strip()]
        for pid in pids:
            _run(["kill", pid], timeout=5)
        time.sleep(2)
        rc2, out2 = _run(["lsof", "-nP", "-ti", f":{HEALTH_PORT}"], timeout=10)
        if rc2 == 0 and out2.strip():  # SIGTERM 无效则强杀，避免新进程绑定失败
            for pid in out2.split():
                _run(["kill", "-9", pid.strip()], timeout=5)


# ---------------------------------------------------------------- 各阶段
def _ph_init():
    state = _pipeline
    checks = []
    checks.append(("traecli", shutil.which("traecli")))
    checks.append(("git", shutil.which("git")))
    for name, path in checks:
        if not path:
            raise RuntimeError(f"缺少依赖：{name} 未安装")
    WORK.mkdir(parents=True, exist_ok=True)
    _specs().mkdir(parents=True, exist_ok=True)
    _logs().mkdir(parents=True, exist_ok=True)
    _kill_app()  # 清理上一次部署进程
    # 检查 Python 依赖
    rc, out = _run([sys.executable, "-c", "import fastapi, uvicorn, pytest, httpx"], timeout=60)
    if rc != 0:
        raise RuntimeError("Python 依赖缺失，请先执行：pip install -r demo-repo/requirements.txt")


def _ph_p0_context(requirement, image_path):
    specs, logs = _specs(), _logs()
    prompt = (
        "你是企业研发自动化流水线的第一阶段。请阅读仓库 README.md 与 AGENTS.md，理解以下需求并规划实现。\n"
        f"需求：{requirement}\n"
        "请生成三份规划文档（全部中文，写入指定绝对路径）：\n"
        f"1) {specs}/spec.md —— 实现方案：含接口设计、改动文件清单、测试计划\n"
        f"2) {specs}/tasks.md —— 任务清单：编号的可执行步骤\n"
        f"3) {specs}/checklist.md —— 验收清单：每条可勾选\n"
        "完成后用一句话概括你的实现方案。"
    )
    extra = ["--add-dir", str(_pipeline.get("run_dir") or WORK)]
    if image_path and Path(image_path).exists():
        extra += ["-i", str(image_path)]
    out_file = logs / "p0_last.txt"
    rc, out = _traecli_exec(DEMO_REPO, prompt, extra_args=extra, out_file=out_file)
    _pipeline["artifacts"]["p0_raw"] = _truncate(out, 3000)
    summary = _read_or_empty(out_file) or out
    if rc != 0 and not summary:
        raise RuntimeError("P0-1 traecli exec 失败")
    missing = [p for p in ["spec.md", "tasks.md", "checklist.md"] if not (specs / p).exists()]
    if missing:
        raise RuntimeError(f"规划文档未生成：{', '.join(missing)}")
    return summary


def _ph_p2_branch():
    if BRANCH_DIR.exists():
        shutil.rmtree(BRANCH_DIR)
    rc, out = _git(["worktree", "add", str(BRANCH_DIR), "-b", BRANCH], cwd=DEMO_REPO)
    if rc != 0:
        # 分支可能已存在
        rc, out = _git(["worktree", "add", str(BRANCH_DIR), BRANCH], cwd=DEMO_REPO)
    if rc != 0:
        raise RuntimeError(f"创建 worktree 失败：{out[-800:]}")
    return "已创建分支分支 feat/demo（worktree）"


def _ph_p3_code(requirement):
    specs, logs = _specs(), _logs()
    prompt = (
        "你是企业研发自动化流水线的编码阶段。请按规划文档实现需求。\n"
        f"需求：{requirement}\n"
        "规划文档：\n"
        f"- 实现方案：{specs}/spec.md\n"
        f"- 任务清单：{specs}/tasks.md\n"
        f"- 验收清单：{specs}/checklist.md\n"
        "要求：\n"
        "1. 严格按 spec 实现代码与测试，遵循仓库 AGENTS.md 的项目规范；\n"
        "2. 只修改与需求相关的文件，不破坏既有接口与测试；\n"
        "3. 改完运行 `python -m pytest -q` 确保通过；\n"
        "4. 用中文总结你的改动（改了哪些文件、新增了什么、测试结果）。"
    )
    out_file = logs / "p3_last.txt"
    rc, out = _traecli_exec(BRANCH_DIR, prompt, extra_args=["--add-dir", str(specs)], out_file=out_file)
    _pipeline["artifacts"]["p3_raw"] = _truncate(out, 3000)
    summary = _read_or_empty(out_file) or out
    if rc != 0 and not summary:
        raise RuntimeError("P3 traecli exec 失败")
    return summary


def _ph_p4_cr():
    # 先提交分支改动，再对 main 做基线评审
    _git(["add", "-A"], cwd=BRANCH_DIR)
    _git(["-c", f"user.name={GIT_USER[0]}", "-c", f"user.email={GIT_USER[1]}",
          "commit", "-m", "feat: demo implementation", "--allow-empty"], cwd=BRANCH_DIR)
    rc, out = _traecli_review(BRANCH_DIR, base="main", title="AI Code Review",
                              log_path=_logs() / "cr.log", timeout=900)
    _pipeline["artifacts"]["cr_raw"] = _truncate(out, 4000)
    if not out.strip():
        raise RuntimeError("P4 traecli review 失败")
    return out.strip()[-2000:]


def _ph_p5_merge():
    rc, out = _git(["merge", "--no-ff", BRANCH, "-m", "merge feat/demo"], cwd=DEMO_REPO)
    if rc != 0:
        raise RuntimeError(f"合并失败：{out[-800:]}")
    _git(["worktree", "remove", str(BRANCH_DIR), "--force"], cwd=DEMO_REPO)
    return "已安全合并 feat/demo → main"


def _ph_p6_deploy():
    global _app_process
    _kill_app()  # 部署前确保端口空闲（续跑跳过 init 时也必须执行）
    logf = (_logs() / "uvicorn.log").open("w", encoding="utf-8")
    _app_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--app-dir", str(DEMO_REPO),
         "--port", str(HEALTH_PORT)],
        stdout=logf, stderr=subprocess.STDOUT,
    )
    url = f"http://127.0.0.1:{HEALTH_PORT}/healthz"
    last = ""
    ok = False
    for _ in range(60):
        if _app_process.poll() is not None:
            break
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                last = r.read().decode("utf-8", "replace")
                if r.status == 200:
                    ok = True
                    break
        except Exception:
            time.sleep(1)
    if not ok:
        raise RuntimeError(f"健康检查未通过：{last or '服务未启动'}")
    time.sleep(1)  # 绑定失败的进程退出有毫秒级延迟，消除 poll 竞态
    if _app_process.poll() is not None:
        # 健康检查通过但新进程已退出：8010 被旧进程占用，刚才的 200 是旧服务响应的
        raise RuntimeError(f"部署进程启动后即退出（端口 {HEALTH_PORT} 可能被残留进程占用），健康检查结果不可信")
    _pipeline["health_url"] = f"http://localhost:{HEALTH_PORT}"
    _pipeline["artifacts"]["health"] = f"GET /healthz -> 200 {last}"
    return f"部署成功：{_pipeline['health_url']}（/healthz -> 200 {last}）"


def _ph_p7_test():
    rc, out = _run([sys.executable, "-m", "pytest", "-q", "--disable-warnings"], cwd=DEMO_REPO, timeout=300)
    _pipeline["artifacts"]["test"] = _truncate(out, 3000)
    if rc != 0:
        raise RuntimeError(f"pytest 未全绿：\n{out[-1500:]}")
    return out.strip()


def _build_report():
    lines = [
        f"# 流水线汇总报告（{_pipeline['pipeline_id']}）",
        "",
        f"- 需求：{_pipeline['requirement']}",
        f"- 启动时间：{_pipeline['started_at']}",
        f"- 完成时间：{_pipeline['finished_at']}",
        f"- 部署地址：{_pipeline.get('health_url') or '—'}",
        "",
        "## 阶段结果",
        "",
        "| 阶段 | 结果 | 耗时 |",
        "|---|---|---|",
    ]
    for p in _pipeline["phases"]:
        dur = f"{p['duration_ms'] / 1000:.1f}s" if p["duration_ms"] is not None else "—"
        lines.append(f"| {p['label']} | {p['status']} | {dur} |")
    lines += ["", "## 规划文档", ""]
    for name, title in [("spec.md", "实现方案"), ("tasks.md", "任务清单"), ("checklist.md", "验收清单")]:
        content = _read_or_empty(_specs() / name).strip()
        lines += [f"### {title}（{name}）", "", content, ""]
    lines += ["## AI 代码评审结论", "", _pipeline.get("artifacts", {}).get("cr_raw", ""), ""]
    lines += ["## 测试结果", "", _pipeline.get("artifacts", {}).get("test", ""), ""]
    lines += ["## 各阶段日志", ""]
    for p in _pipeline["phases"]:
        if p["log"]:
            lines += [f"### {p['label']}", "", p["log"], ""]
    report = "\n".join(lines)
    report_path = (Path(_pipeline["run_dir"]) / "report.md") if _pipeline.get("run_dir") else (WORK / "report.md")
    report_path.write_text(report, encoding="utf-8")
    return report


def _run_pipeline(requirement, image_path):
    global _pipeline
    state = _new_state(requirement, image_path)
    # 本轮产物独立目录：runs/<pipeline_id>/{specs,logs}，原型图也复制进去
    run_dir = Path(state["run_dir"])
    (run_dir / "specs").mkdir(parents=True, exist_ok=True)
    (run_dir / "logs").mkdir(parents=True, exist_ok=True)
    if image_path and Path(image_path).exists():
        copied = run_dir / ("prototype" + Path(image_path).suffix)
        try:
            shutil.copy2(image_path, copied)
            state["image"] = str(copied)
            image_path = str(copied)
        except Exception:  # noqa: BLE001
            pass
    with _lock:
        _pipeline = state
    _save_meta()
    _drive(state, 0)


def _resume_run(run, resume_idx):
    """恢复归档的失败运行，从失败阶段继续执行（此前阶段保留原结果与日志）。"""
    global _pipeline
    state = json.loads(json.dumps(run))
    state.pop("archived_docs", None)
    for p in state["phases"][resume_idx:]:
        p.update(status="pending", summary="", log="", duration_ms=0)
    state["status"] = "running"
    state["error"] = None
    state["finished_at"] = None
    state["report"] = ""
    with _lock:
        _pipeline = state
    _save_meta()
    _drive(state, resume_idx)


def _drive(state, start_idx):
    """驱动状态机从 start_idx 阶段执行到结束（成功/失败收尾逻辑统一）。"""
    requirement, image_path = state["requirement"], state["image"]
    for idx, (key, label) in enumerate(PHASE_DEFS):
        if idx < start_idx:
            continue
        with _lock:
            _pipeline["current_phase"] = key
            _set_phase(key, "running", state=state)
        _save_meta()
        t0 = time.time()
        try:
            if key == "init":
                _ph_init(); summary = "环境检查通过"
            elif key == "p0_context":
                summary = _ph_p0_context(requirement, image_path)
            elif key == "p2_branch":
                summary = _ph_p2_branch()
            elif key == "p3_code":
                summary = _ph_p3_code(requirement)
            elif key == "p4_cr":
                summary = _ph_p4_cr()
            elif key == "p5_merge":
                summary = _ph_p5_merge()
            elif key == "p6_deploy":
                summary = _ph_p6_deploy()
            elif key == "p7_test":
                summary = _ph_p7_test()
            dur = int((time.time() - t0) * 1000)
            with _lock:
                _set_phase(key, "done", summary=summary, duration_ms=dur, state=state)
            _telemetry(key, "done", dur)
        except Exception as e:
            dur = int((time.time() - t0) * 1000)
            err = f"{e}\n{traceback.format_exc(limit=3)}"
            with _lock:
                _set_phase(key, "failed", summary=str(e), log=_truncate(err, 2000),
                           duration_ms=dur, state=state)
                _pipeline["status"] = "failed"
                _pipeline["error"] = str(e)
            _telemetry(key, "failed", dur)
            _save_meta()
            _archive(_pipeline)
            return
        _save_meta()
    # 汇总报告
    try:
        with _lock:
            _pipeline["status"] = "done"
            _pipeline["finished_at"] = _now_iso()
            _pipeline["current_phase"] = None
        report = _build_report()
        with _lock:
            _pipeline["report"] = report
        _save_meta()
        _telemetry("pipeline", "done", 0)
        _archive(_pipeline)
    except Exception:
        with _lock:
            _pipeline["status"] = "failed"
            _pipeline["error"] = "报告生成失败"
        _save_meta()


def start_pipeline(requirement, image_path=None):
    """启动流水线（后台线程）。同一时间只允许一条。"""
    with _lock:
        if _pipeline and _pipeline["status"] == "running":
            raise RuntimeError("已有流水线在运行，请等待完成")
    t = threading.Thread(target=_run_pipeline, args=(requirement, image_path), daemon=True)
    t.start()
    return True


def resume_pipeline(pid):
    """从失败阶段续跑：恢复该次运行状态，只重跑失败及之后的阶段。"""
    with _lock:
        if _pipeline and _pipeline["status"] == "running":
            raise RuntimeError("已有流水线在运行，请等待完成")
    run = get_history_run(pid)
    if not run:
        raise RuntimeError("历史记录不存在，无法续跑")
    if run.get("status") != "failed":
        raise RuntimeError("仅失败的运行支持续跑")
    resume_idx = next((i for i, p in enumerate(run.get("phases", [])) if p.get("status") == "failed"), None)
    if resume_idx is None:
        raise RuntimeError("未找到失败阶段，无法续跑")
    key = run["phases"][resume_idx]["key"]
    if key in ("p3_code", "p4_cr") and not BRANCH_DIR.exists():
        raise RuntimeError("分支工作区已被清理，无法从该阶段续跑，请改用从头重跑")
    t = threading.Thread(target=_resume_run, args=(run, resume_idx), daemon=True)
    t.start()
    return True


def retry_pipeline(pid):
    """用历史记录中的需求与原型图重新启动一条流水线。"""
    run = get_history_run(pid)
    if not run:
        raise RuntimeError("历史记录不存在，无法重试")
    req = run.get("requirement") or ""
    if not req.strip():
        raise RuntimeError("该记录没有需求描述，无法重试")
    img = run.get("image") or ""
    if img and not Path(img).exists():
        img = None
    return start_pipeline(req, img)


def get_telemetry():
    if not TELEMETRY.exists():
        return {"runs": [], "phases": []}
    runs, phases = [], []
    for line in TELEMETRY.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except Exception:
            continue
        if item.get("phase") == "pipeline":
            runs.append(item)
        else:
            phases.append(item)
    return {"runs": runs[-20:], "phases": phases[-200:]}


def get_artifacts():
    names = {"spec": "spec.md", "tasks": "tasks.md", "checklist": "checklist.md"}
    specs = _specs()
    result = {}
    for key, name in names.items():
        result[key] = _read_or_empty(specs / name)
    result["cr"] = (_pipeline or {}).get("artifacts", {}).get("cr_raw", "")
    if not result["cr"] and (_pipeline or {}).get("status") == "running":
        result["cr"] = _read_or_empty(_logs() / "cr.log")  # P4 进行中：cr.log 边跑边写，实时可读
    result["test"] = (_pipeline or {}).get("artifacts", {}).get("test", "")
    result["health"] = (_pipeline or {}).get("artifacts", {}).get("health", "")
    return result


def get_report():
    if (_pipeline or {}).get("report"):
        return _pipeline["report"]
    rd = (_pipeline or {}).get("run_dir")
    if rd:
        return _read_or_empty(Path(rd) / "report.md")
    return _read_or_empty(WORK / "report.md")


def get_health_url():
    return (_pipeline or {}).get("health_url", "")


_load_last_state()


if __name__ == "__main__":
    # 命令行冒烟：python3 orchestrator.py "需求..."
    import sys as _sys
    req = _sys.argv[1] if len(_sys.argv) > 1 else "为待办 API 新增 /healthz 健康检查并补测试"
    start_pipeline(req)
    print("已启动流水线，Ctrl+C 退出。")
    while True:
        s = get_status()
        if not s:
            break
        cur = s.get("current_phase")
        status = s.get("status")
        sys.stdout.write(f"\r[{status}] 当前阶段: {cur}   ")
        sys.stdout.flush()
        if status in ("done", "failed"):
            print("\n结束:", status, s.get("error", ""))
            print("报告:", get_report()[:500])
            break
        time.sleep(2)
