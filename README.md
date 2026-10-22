# TRAE 研发流程 Demo（本地最小化演示系统）

用**真实 Trae CLI** 复刻客户在「Tone」平台的自动化研发流水线（Phase 0-7），用于向其他客户演示"一个 Skill 跑全流程：需求进 → 文档/代码出 → CR → 合并 → 部署 → 测试 → 报告"。

## 架构

```
浏览器（模拟 Tone 操作台）→ app.py（FastAPI :8000）→ orchestrator.py（状态机）
   → 真实 traecli（exec / review）→ demo-repo/（待办 API）+ skills/（Skill Hub）
```

- **真实**：Trae CLI 模型推理、代码生成、代码评审、pytest
- **模拟**：Tone 平台（本地网页）、Java 服务/trae-proxy（Python 编排器）、部署平台（本地 uvicorn + /healthz）

## 目录

```
trae-demo/
├── app.py               # Web 操作台（FastAPI）
├── orchestrator.py      # 流水线编排器（状态机 + 调 traecli）
├── static/index.html    # 操作台 UI
├── demo-repo/           # 待办事项 API 示例工程（FastAPI + pytest）
├── skills/todo-demo/    # 演示企业 Skill
├── pipeline_meta.json   # 运行状态
└── telemetry.jsonl      # 度量数据
```

## 安装

```bash
# 1. 确认 Trae CLI 已登录
traecli login status

# 2. 安装依赖
pip install -r demo-repo/requirements.txt
# 若缺 Web 依赖：pip install fastapi uvicorn

# 3. 确认 demo 仓库初始测试通过
cd demo-repo && python -m pytest -q && cd ..
```

## 运行

```bash
python3 app.py
# 浏览器打开 http://localhost:8000
```

## 演示流程（标准模式，约 8-12 分钟）

1. 操作台输入需求（可预填）+ 上传原型图（可选）→ 点「开始流水线」
2. 观察 Phase 0-7 实时流转：前置 → P0-1 需求理解（模型读图生成 spec/tasks/checklist）→ P2 分支 → P3 AI 编码 → P4 AI CR（`traecli review`）→ P5 合并 → P6 部署（uvicorn + /healthz）→ P7 测试（pytest）
3. 查看「规划文档 / AI 代码评审 / 测试结果 / 部署 / 汇总报告」各面板
4. 查看底部「效果度量」面板（telemetry 落库，各阶段耗时分布）

## 说明

- 每次运行只允许一条流水线；运行完成后可再次启动。
- 部署阶段会占用端口 8010；下次运行会自动清理上一次进程。
- `work/` 目录保留每次运行产物（specs/、logs/、report.md）。
- 真实度边界见飞书设计文档《TRAE 研发流程 Demo 设计方案》。
