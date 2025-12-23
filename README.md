# OKR管理工具箱

飞书多维表格插件（Bitable Base Extension），目标是把 OKR 变成可拉取、可纠偏的执行闭环。

## 插件逻辑（MVP）

Tab 结构：
- Demo 数据：一键生成 OKR 演示数据（O1 + 3 KR + Actions/Evidence/WeeklyPlan/Ideas）
- Home 总览：Top KRs + Drift 提示 + “开始纠偏”
- Today：每日拉取 1-2 个 MIT
- Action Bank：按 KR 过滤动作库，快速拉取到 Today
- Evidence：完成 Action 必须添加证据或失败原因
- Drift：连续无证据天数、未关联 KR 的 Action 数
- Parking Lot：新想法收集 + 探索预算提示
- Guardrail：新建 Action > 30 分钟且无 KR 时提示转 Parking

## 初始化

只创建表结构（不导入数据）：
```
./scripts/init_base.sh
```

导入演示数据（CLI 方式）：
```
./scripts/seed_mock_data.sh
```

导入使用说明（UsageGuide）：
```
./scripts/seed_usage_guide.sh
```

## 前端开发

```
npm install
npm run dev
```

## 构建

```
npm run build
```
