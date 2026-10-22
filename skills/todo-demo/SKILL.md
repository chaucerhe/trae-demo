---
name: todo-demo
description: 待办事项 API 项目（TRAE 研发流程 Demo）的开发规范与常见任务指南。当任务涉及健康检查接口、接口扩展、排序参数、pytest 测试补充等本仓库需求时使用，提供统一的实现规范。
---

# 待办事项 API 开发规范（企业 Skill 示例）

本 Skill 演示"企业 Skill Hub"概念：将团队研发规范沉淀为可复用 Skill，由 TRAE 按需自动加载。

## 适用场景

- 为待办 API 新增/修改接口（如健康检查、排序、筛选）
- 补充 pytest 测试
- 修改 FastAPI 路由或 Pydantic 模型

## 硬性规范

1. **健康检查**：`GET /healthz` 返回 `{"status": "ok"}`，状态码 200，不依赖数据存储。
2. **排序**：`GET /todos?sort=created_at:desc` 按 `created_at` 倒序；非法参数忽略并返回原顺序。
3. **模型**：请求体用 Pydantic `BaseModel`；响应统一 `response_model`。
4. **测试**：新接口必须在 `tests/test_api.py` 补测试；`pytest -q` 必须全绿。
5. **风格**：中文 docstring + 类型注解；不引入新依赖（除非在 requirements.txt 声明）。

## 注意事项

- 数据存内存即可，禁止引入数据库。
- 修改 `app/main.py` 时保持既有接口兼容（不要破坏现有测试）。
