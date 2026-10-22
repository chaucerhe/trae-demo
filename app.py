#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Web 操作台（模拟 Tone 平台）：FastAPI + 静态页 + 流水线控制/状态/度量 API。"""
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import orchestrator

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
WORK = ROOT / "work"

app = FastAPI(title="TRAE 研发流程 Demo · 模拟 Tone 操作台")


@app.get("/", response_class=HTMLResponse)
def index():
    return (STATIC / "index.html").read_text(encoding="utf-8")


@app.post("/api/pipeline/start")
async def start(requirement: str = Form(...), image: Optional[UploadFile] = File(None)):
    img_path = None
    if image is not None and image.filename:
        WORK.mkdir(parents=True, exist_ok=True)
        img_path = WORK / "proto.png"
        img_path.write_bytes(await image.read())
    try:
        orchestrator.start_pipeline(requirement, str(img_path) if img_path else None)
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"ok": False, "error": str(e)})


@app.get("/api/status")
def status():
    return orchestrator.get_status() or {"status": "idle"}


@app.post("/api/pipeline/retry/{pid}")
def retry(pid: str):
    try:
        orchestrator.retry_pipeline(pid)
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"ok": False, "error": str(e)})


@app.post("/api/pipeline/resume/{pid}")
def resume(pid: str):
    try:
        orchestrator.resume_pipeline(pid)
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"ok": False, "error": str(e)})


@app.get("/api/telemetry")
def telemetry():
    return orchestrator.get_telemetry()


@app.get("/api/artifacts")
def artifacts():
    return orchestrator.get_artifacts()


@app.get("/api/report")
def report():
    return {"report": orchestrator.get_report(), "health_url": orchestrator.get_health_url()}


@app.get("/api/history")
def history_list():
    return {"items": orchestrator.get_history_list()}


@app.get("/api/history/{pid}")
def history_run(pid: str):
    run = orchestrator.get_history_run(pid)
    if run is None:
        return JSONResponse(status_code=404, content={"ok": False, "error": "归档不存在"})
    return run


@app.get("/api/probe")
def probe():
    return {"ok": True}


app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
