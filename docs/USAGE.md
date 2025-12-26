# 使用说明（Bitable 模板）

这是一套“执行不跑丢”的 OKR 闭环模板。推荐从小范围试用开始，先跑通最小闭环：OKR -> Action -> Evidence -> 诊断 -> 纠偏。

## 0. 初始化
1) 运行 `scripts/init_base.sh` 创建表结构（OKRPlan/Evidence/UsageGuide 等）。
2) （可选）运行 `scripts/seed_mock_data.sh` 导入演示数据。
3) （建议）运行 `scripts/add_okrplan_score_field.sh` 创建 Score 公式字段。

## 1. 录入 OKR（OKRPlan 单表）
- 在 `OKRPlan` 表填写 Objectives / Key Results / Actions / Owner / Cycle。
- 每条记录代表“某个 KR 下的一条 Action”。
- 每个 KR 需要明确的可交付结果，而不是“推进一下”。

## 2. KR 截止日期
- 每个 KR 只要求一个明确的截止日期（Due Date）。
- 截止日期是所有 Action 的时间上限。

## 3. Action 计划日期
- 在 `OKRPlan` 表为每个 KR 建 5-10 条“可执行动作”，并填写计划开始/完成日期（预期开始/预期结束）。
- 每个 Action 的计划完成日期必须早于对应 KR 的截止日期。
- 粒度建议 30-90 分钟，越具体越好（例如“跑对照 SQL”“写 1 页结论 memo”）。
- 建议把 1 周内要完成的动作都规划出来，避免临时起意打断主线。

## 3.1 Action 评分（Score）
- 在 `OKRPlan` 新增公式字段 `Score`，用于对比“时间进度 vs 实际进度”。
- 建议运行脚本 `scripts/add_okrplan_score_field.sh` 自动创建公式字段。

## 4. 首页（驾驶舱 + 今日任务）
- 插件自动拉取“计划已开始且未完成”的 Action。
- 支持从 Backlog 手动加入 Today。
- 驾驶舱显示周/月/季度得分，并列出扣分原因（落后于时间进度的 Action）。

## 5. 证据优先（Evidence-first）
- 当 Action 完成时，必须新增 Evidence（链接/产物/结论）。
- Evidence 必须关联到对应 KR（以及 Action）。
- 证据质量用 1-5 档评分（存在性 / 初步结论 / 可复用 / 影响决策 / 明确下一步）。

## 6. 诊断（落后进度）
- “诊断”Tab 展示所有落后于时间进度的 Action。
- 优先把落后项调回 Today，并补充 Evidence。

## 7. 最小闭环检查清单
- 每个 KR 有截止日期。
- 每周至少新增 2 条 Evidence。
- Today 完成率 >= 70%。
- 诊断列表为“暂无落后项”。
