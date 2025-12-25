# 使用说明（Bitable 模板）

这是一套“执行不跑丢”的 OKR 闭环模板。推荐从小范围试用开始，先跑通最小闭环：OKR -> Action -> Focus Block -> Evidence -> Scorecard -> Drift -> 纠偏。

## 0. 初始化
1) 运行 `scripts/init_base.sh` 创建表结构（含 FocusBlocks / Scorecard）。
2) （可选）运行 `scripts/seed_mock_data.sh` 导入演示数据。

## 1. 录入 OKR
- 在 `Objectives` 表创建目标（O_Title、Owner、Cycle）。
- 在 `KeyResults` 表创建 3-5 条 KR，并关联到 Objective。
- 每个 KR 需要明确的可交付结果，而不是“推进一下”。

## 2. KR 截止日期
- 每个 KR 只要求一个明确的截止日期（Due Date）。
- 截止日期是所有 Action 的时间上限。

## 3. Action 计划日期
- 在 `Actions` 表为每个 KR 建 5-10 条“可执行动作”，并填写计划开始/完成日期（Plan_Start/Plan_End）。
- 每个 Action 的计划完成日期必须早于对应 KR 的截止日期。
- 粒度建议 30-90 分钟，越具体越好（例如“跑对照 SQL”“写 1 页结论 memo”）。
- 建议把 1 周内要完成的动作都规划出来，避免临时起意打断主线。

## 4. 每日拉取（Today）
- 每天检查 Action 计划日期，若计划日期落在当天，则拉入 Today 作为 MIT。
- 把状态改为 Today，并在当天完成。
- 每天建议只拉 1-2 条 MIT，保证产出证据。

## 5. Focus Block（深度时间块）
- Today 的 Action 至少记录 1 个 Focus Block。
- Focus Block 必须写目标产出，并尽量关联 Evidence。

## 6. 证据优先（Evidence-first）
- 当 Action 完成时，必须新增 Evidence（链接/产物/结论）。
- Evidence 必须关联到对应 KR（以及 Action / Focus Block）。
- 证据质量用 1-5 档评分（存在性 / 初步结论 / 可复用 / 影响决策 / 明确下一步）。

## 7. 周评分（Scorecard）
- 在 `Scorecard` 中记录周评分（结果/过程/证据/偏航扣分）。
- 必须写清扣分原因和纠偏动作。
- 评分用于解释“低分原因”，并牵引下周 Action 规划。

## 8. 偏航检测与纠偏
- 关注 3 个核心指标：
  - 连续无 Evidence 天数
  - 未关联 KR 的 Action 数量
  - Scorecard 评分偏低（含扣分原因）
- 触发偏航后执行 3 步纠偏：
  1) 选 1 个 KR 的本周交付
  2) 拉 1 个 30 分钟最小动作
  3) 产出 1 个证据

## 9. Parking Lot（探索预算）
- 新任务超过 30 分钟且无法关联 KR，放入 `Ideas`。
- 探索必须有预算且有产出（结论/模板/代码），否则降级。

## 10. 最小闭环检查清单
- 每个 KR 有截止日期。
- 每周至少新增 2 条 Evidence。
- Today 完成率 >= 70%。
- Scorecard 有扣分原因 + 纠偏动作。
