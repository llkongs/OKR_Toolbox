# OKR管理工具箱

飞书多维表格插件（Bitable Base Extension），目标是把 OKR 变成可拉取、可纠偏的执行闭环。

## 插件逻辑（MVP）

Tab 结构：
- 首页：驾驶舱得分 + 今日任务（自动拉取计划已开始的 Action）
- 诊断：落后于进度的 Action 列表
- 证据：新增证据 + 最近证据
- 更多：Demo 数据 + 诊断日志

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

创建 OKRPlan Score 公式字段：
```
./scripts/add_okrplan_score_field.sh
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
