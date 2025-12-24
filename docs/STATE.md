# STATE.md — OKR_Toolbox 工作进度

## 0. 项目定位
- 项目名：OKR_Toolbox（飞书多维表格插件）
- 目标：OKR 执行闭环（OKR -> Action -> Evidence -> Drift -> 纠偏）
- 部署：GitHub Pages + GitHub Actions
- 代码仓库：`https://github.com/llkongs/OKR_Toolbox`

## 1. 当前已完成（功能）

### Tab: Demo 数据
- 一键生成演示数据（O1 + 3 KR + Actions/Evidence/WeeklyPlan/Ideas）
- 使用通用组件 `OperationRunner` 显示确认弹窗 + 进度条 + 日志

### Tab: Home 总览
- 展示 Top KRs（按偏航优先排序）
- 展示偏航 KR 数量、未关联 Action 数量
- 支持刷新 + 跳转 Drift（开始纠偏）

### Tab: Today
- 从 Backlog 拉取 1-2 个 MIT
- 显示今日任务列表（KR、预计时长、计划日期）
- 支持标记完成或移回 Backlog
- 完成时强制填写证据或失败原因（自动创建 Evidence）

### Tab: Action Bank
- 仅展示 Backlog 动作
- 支持按 KR 过滤
- 支持一键“拉取到 Today”

### Tab: Evidence
- 新增证据（选择 Action、证据类型、标题、链接）
- 最近证据列表

### Tab: Drift
- 偏航指标：连续无证据天数、未关联 Action 数
- 偏航 KR 列表 + 纠偏 Playbook

### Tab: Parking Lot
- 新增想法（标题/分钟/关联 KR/备注）
- Parking 列表展示

### Tab: Guardrail
- 新建 Action 护栏：>30 分钟且未关联 KR 会引导进入 Parking
- 弹窗确认放入 Parking

## 2. 数据结构/脚本

### 2.1 初始化脚本
- `scripts/init_base.sh`：只创建表结构（含 UsageGuide、Plan 字段等）

### 2.2 Demo/辅助脚本
- `scripts/seed_mock_data.sh`：写入演示 OKR 数据（CLI 方式）
- `scripts/seed_usage_guide.sh`：写入 UsageGuide 表
- `scripts/seed_plan_dates.sh`：写入计划日期
- `scripts/add_planning_fields.sh`：为现有表补字段
- `scripts/normalize_field_types.sh`：提示/尝试字段类型规范化

## 3. 字段优化建议
- KeyResults.Progress -> 进度
- KeyResults.Confidence -> 评分
- Evidence.Link -> 超链接
- UsageGuide.Link -> 超链接
- Actions.Plan_Week -> 公式字段（UI 手动创建）

## 4. 重要说明
- `generated/base_schema.json` 已被 gitignore，不提交
- `.env` 只本地使用，不提交
- `vite.config.ts` 已设置 `base: /OKR_Toolbox/` 用于 Pages

## 5. 部署说明
- GitHub Actions workflow: `.github/workflows/deploy.yml`
- Pages Source: GitHub Actions
- 页面地址：`https://llkongs.github.io/OKR_Toolbox/`

## 6. 当前待办建议
- 优化 Evidence 表单（支持快速回填 Action/KR）
- Action Bank 支持按计划日期排序
- Drift 增加“偏航阈值设置”
- Today 支持快速“拉取 N 条 MIT”
- 添加字段校验/表存在性检查提示

## 7. 最新进展（2025-12-24）
- 修复关联字段可能返回对象导致的报错（统一转数组处理）
- 修复日志复制失败（提供手动复制弹窗）
- 日志新增调试开关（默认开启，可关闭）
- 版本号展示 + URL 自动带版本参数（用于强制刷新缓存）
- PRD 增加“产品逻辑图（执行闭环）”Mermaid 流程图
