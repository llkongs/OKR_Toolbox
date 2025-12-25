# OKR管理工具箱

飞书多维表格插件（Bitable Base Extension），目标是把 OKR 变成可拉取、可纠偏的执行闭环。

## 插件逻辑（MVP）

Tab 结构：
- Today：按 Action 计划日期拉取 MIT + Focus Block + Evidence + Drift 提醒
- 更多：Home 总览 / Action Bank / Parking / Guardrail / Scorecard / Demo / Debug

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
