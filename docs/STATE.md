# STATE.md — OKR_Toolbox 工作进度

## 0. 项目定位
- 项目名：OKR_Toolbox（飞书多维表格插件）
- 目标：OKR 执行闭环（OKR -> Action -> Evidence -> Drift -> 纠偏）
- 部署：GitHub Pages + GitHub Actions
- 代码仓库：`https://github.com/llkongs/OKR_Toolbox`

## 1. 当前已完成（功能）

### Tab: 首页
- 驾驶舱：周/月/季度得分 + 扣分原因
- 今日任务：自动拉取计划已开始且未完成的 Action
- 支持从 Backlog 手动加入 Today
- 支持标记完成（强制证据或失败原因）

### Tab: 诊断
- 落后于计划进度的 Action 列表（按落后程度排序）

### Tab: 证据
- 新增证据（选择 Action、证据类型、标题、链接）
- 最近证据列表

### Tab: 更多
- Demo 数据：一键生成演示数据（OKRPlan + Evidence）
- 诊断日志：复制/清空日志（用于排查插件异常）

## 2. 数据结构/脚本

### 2.1 初始化脚本
- `scripts/init_base.sh`：只创建表结构（含 UsageGuide、Action 计划起止字段等）

### 2.2 Demo/辅助脚本
- `scripts/seed_mock_data.sh`：写入演示 OKR 数据（CLI 方式）
- `scripts/seed_usage_guide.sh`：写入 UsageGuide 表
- `scripts/seed_plan_dates.sh`：写入计划日期
- `scripts/add_planning_fields.sh`：为现有表补字段
- `scripts/normalize_field_types.sh`：提示/尝试字段类型规范化
- `scripts/add_okrplan_score_field.sh`：创建 OKRPlan 的 Score 公式字段

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
- 评分逻辑与公式字段的参数可配置（阈值/权重）
- 证据表单支持常用 Action 快捷选择
- 增加字段缺失的可视提示（如 Action Status/Action Progress）

## 7. 最新进展（2025-12-25）
- 插件切换为 4 个 Tab：首页 / 诊断 / 证据 / 更多
- 驾驶舱评分与落后清单已稳定工作（按 Action 时间进度 vs 实际进度）
- Demo 数据与诊断日志恢复到“更多”
- 主题回归浅色背景 + 黑色文字
