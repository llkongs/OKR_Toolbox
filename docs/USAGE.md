# 使用说明（Bitable 模板）

这是一套“执行不跑丢”的 OKR 闭环模板。推荐从小范围试用开始，先跑通最小闭环：OKR -> Action -> Evidence -> Drift -> 纠偏。

## 0. 初始化
1) 运行 `scripts/init_base.sh` 创建表结构。
2) （可选）运行 `scripts/seed_mock_data.sh` 导入演示数据。

## 1. 录入 OKR
- 在 `Objectives` 表创建目标（O_Title、Owner、Cycle）。
- 在 `KeyResults` 表创建 3-5 条 KR，并关联到 Objective。
- 每个 KR 需要明确的可交付结果，而不是“推进一下”。

## 2. 建立 Action Bank
- 在 `Actions` 表为每个 KR 建 5-10 条“可执行动作”。
- 粒度建议 30-90 分钟，越具体越好（例如“跑对照 SQL”“写 1 页结论 memo”）。

## 3. 每日拉取（Today）
- 每天从 Action Bank 里挑 1-2 条最重要的动作（MIT）。
- 把状态改为 Today，并在当天完成。

## 4. 证据优先（Evidence-first）
- 当 Action 完成时，必须新增 Evidence（链接/产物/结论）。
- Evidence 必须关联到对应 KR（以及 Action）。

## 5. 周计划与复盘
- 在 `WeeklyPlan` 中记录本周交付、预算、风险。
- 每周复盘时补充证据和结论，避免只“报状态”。

## 6. 偏航检测与纠偏
- 关注 2 个核心指标：
  - 连续无 Evidence 天数
  - 未关联 KR 的 Action 数量
- 触发偏航后执行 3 步纠偏：
  1) 选 1 个 KR 的本周交付
  2) 拉 1 个 30 分钟最小动作
  3) 产出 1 个证据

## 7. Parking Lot（探索预算）
- 新任务超过 30 分钟且无法关联 KR，放入 `Ideas`。
- 探索必须有预算且有产出（结论/模板/代码），否则降级。
