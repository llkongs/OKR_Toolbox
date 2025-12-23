import { useMemo, useState } from 'react'
import { bitable } from '@lark-base-open/js-sdk'
import {
  Alert,
  Button,
  Card,
  Divider,
  List,
  Modal,
  Progress,
  Space,
  Tabs,
  Typography,
  message,
} from 'antd'
import './App.css'

const { Title, Text } = Typography

type TableMeta = {
  id?: string
  tableId?: string
  table_id?: string
  name?: string
}

type FieldMeta = {
  id?: string
  fieldId?: string
  field_id?: string
  field_name?: string
  name?: string
  isPrimary?: boolean
  property?: { options?: { id?: string; name?: string }[] }
}

type TableApi = {
  getFieldMetaList: () => Promise<FieldMeta[]>
  addRecord: (payload: { fields: Record<string, unknown> }) => Promise<string>
}

function resolveTableId(meta: TableMeta) {
  return meta.tableId || meta.id || meta.table_id || ''
}

function resolveFieldId(meta: FieldMeta) {
  return meta.fieldId || meta.id || meta.field_id || ''
}

function resolveFieldName(meta: FieldMeta) {
  return meta.field_name || meta.name || ''
}

async function getTableByName(name: string) {
  const metaList = (await bitable.base.getTableMetaList()) as TableMeta[]
  const meta = metaList.find((item) => item.name === name)
  if (!meta) {
    throw new Error(`未找到表：${name}`)
  }
  const tableId = resolveTableId(meta)
  return (await bitable.base.getTableById(tableId)) as TableApi
}

function buildFieldIndex(fields: FieldMeta[]) {
  const byName = new Map<string, FieldMeta>()
  const optionMap = new Map<string, Map<string, string>>()
  let primaryFieldId = ''

  fields.forEach((field) => {
    const name = resolveFieldName(field)
    if (name) {
      byName.set(name, field)
    }
    if (field.isPrimary) {
      primaryFieldId = resolveFieldId(field)
    }
    const options = field.property?.options
    if (name && options && options.length > 0) {
      const optMap = new Map<string, string>()
      options.forEach((opt) => {
        if (opt.name && opt.id) {
          optMap.set(opt.name, opt.id)
        }
      })
      optionMap.set(name, optMap)
    }
  })

  return { byName, optionMap, primaryFieldId }
}

function selectValue(fieldName: string, label: string, optionMap: Map<string, Map<string, string>>) {
  const options = optionMap.get(fieldName)
  if (!options) {
    return label
  }
  const optionId = options.get(label)
  if (!optionId) {
    return label
  }
  return { id: optionId }
}

function App() {
  const [seeding, setSeeding] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [pendingOps, setPendingOps] = useState<string[]>([])
  const isBitable = Boolean((bitable as unknown as { base?: unknown }).base)

  const appendLog = (line: string) => {
    setLogLines((prev) => [...prev, line])
  }

  const handleSeed = async () => {
    const operations = [
      '创建 Objective',
      '创建 3 条 KeyResults',
      '创建 6 条 Actions',
      '创建 2 条 Evidence',
      '创建 WeeklyPlan',
      '创建 Idea',
    ]
    setPendingOps(operations)
    setConfirmOpen(true)
  }

  const runSeed = async () => {
    setConfirmOpen(false)
    setSeeding(true)
    setProgress(0)
    setLogLines([])
    let completed = 0
    const totalSteps = 14
    const stepDone = async (line: string) => {
      completed += 1
      appendLog(line)
      setProgress(Math.min(100, Math.round((completed / totalSteps) * 100)))
      await new Promise((resolve) => setTimeout(resolve, 80))
    }

    try {
      const objectiveTable = await getTableByName('Objectives')
      const krTable = await getTableByName('KeyResults')
      const actionTable = await getTableByName('Actions')
      const evidenceTable = await getTableByName('Evidence')
      const weeklyTable = await getTableByName('WeeklyPlan')
      const ideasTable = await getTableByName('Ideas')

      const objectiveFields = buildFieldIndex(await objectiveTable.getFieldMetaList())
      const krFields = buildFieldIndex(await krTable.getFieldMetaList())
      const actionFields = buildFieldIndex(await actionTable.getFieldMetaList())
      const evidenceFields = buildFieldIndex(await evidenceTable.getFieldMetaList())
      const weeklyFields = buildFieldIndex(await weeklyTable.getFieldMetaList())
      const ideasFields = buildFieldIndex(await ideasTable.getFieldMetaList())

      const objectiveTitle = 'O1 - 优质UGC搜索价值验证'
      const objectivePayload: Record<string, unknown> = {
        [objectiveFields.byName.get('O_Title') ? resolveFieldId(objectiveFields.byName.get('O_Title')!) : 'O_Title']: objectiveTitle,
        [objectiveFields.byName.get('Cycle') ? resolveFieldId(objectiveFields.byName.get('Cycle')!) : 'Cycle']: '2026 Q1',
      }
      if (objectiveFields.primaryFieldId) {
        objectivePayload[objectiveFields.primaryFieldId] = objectiveTitle
      }
      const objectiveId = await objectiveTable.addRecord({ fields: objectivePayload })
      await stepDone('已创建 Objective')

      const krData = [
        { title: '完成优质UGC价值验证结论', type: 'Milestone', progress: 30, confidence: 3 },
        { title: '完成漏斗效率分析并明确提效空间', type: 'Deliverable', progress: 20, confidence: 3 },
        { title: '验证搜索对优质UGC供给的撬动上限', type: 'Milestone', progress: 10, confidence: 2 },
      ]

      const krIds: string[] = []
      for (const kr of krData) {
        const payload: Record<string, unknown> = {}
        if (krFields.primaryFieldId) {
          payload[krFields.primaryFieldId] = kr.title
        }
        payload[resolveFieldId(krFields.byName.get('KR_Title')!)] = kr.title
        payload[resolveFieldId(krFields.byName.get('Progress')!)] = kr.progress
        payload[resolveFieldId(krFields.byName.get('Confidence')!)] = kr.confidence
        payload[resolveFieldId(krFields.byName.get('Target')!)] = ''
        payload[resolveFieldId(krFields.byName.get('KR_Type')!)] = selectValue('KR_Type', kr.type, krFields.optionMap)
        payload[resolveFieldId(krFields.byName.get('Objective')!)] = [objectiveId]
        payload[resolveFieldId(krFields.byName.get('Due_Date')!)] = new Date('2026-01-31').getTime()
        krIds.push(await krTable.addRecord({ fields: payload }))
        await stepDone(`已创建 KR：${kr.title}`)
      }

      const actionData = [
        [0, '补充对照实验统计，产出价值验证结论', 90, '2026-01-05', 4],
        [0, '汇总消费价值结论，沉淀 1 页结论 memo', 60, '2026-01-16', 4],
        [1, '做漏斗分阶段转化对比分析', 90, '2026-01-12', 4],
        [1, '梳理提效空间与算法策略建议', 60, '2026-01-22', 4],
        [2, '验证搜索对供给撬动的边界条件', 90, '2026-01-19', 4],
        [2, '形成冷启动链路方案初稿', 60, '2026-01-29', 4],
      ] as const

      const actionIds: string[] = []
      for (const [krIndex, title, minutes, planDate, planHours] of actionData) {
        const payload: Record<string, unknown> = {}
        if (actionFields.primaryFieldId) {
          payload[actionFields.primaryFieldId] = title
        }
        payload[resolveFieldId(actionFields.byName.get('Action_Title')!)] = title
        payload[resolveFieldId(actionFields.byName.get('Est_Minutes')!)] = minutes
        payload[resolveFieldId(actionFields.byName.get('Due')!)] = Date.now()
        payload[resolveFieldId(actionFields.byName.get('Plan_Date')!)] = new Date(planDate).getTime()
        payload[resolveFieldId(actionFields.byName.get('Plan_Hours')!)] = planHours
        payload[resolveFieldId(actionFields.byName.get('Status')!)] = selectValue('Status', 'Backlog', actionFields.optionMap)
        payload[resolveFieldId(actionFields.byName.get('KeyResult')!)] = [krIds[krIndex]]
        actionIds.push(await actionTable.addRecord({ fields: payload }))
        await stepDone(`已创建 Action：${title}`)
      }

      const evidenceData = [
        [0, '价值验证实验对照分析', 'Experiment', 0],
        [1, '漏斗效率分析结果', 'Dashboard', 2],
      ] as const

      for (const [krIndex, title, evType, actionIndex] of evidenceData) {
        const payload: Record<string, unknown> = {}
        if (evidenceFields.primaryFieldId) {
          payload[evidenceFields.primaryFieldId] = title
        }
        payload[resolveFieldId(evidenceFields.byName.get('Evidence_Title')!)] = title
        payload[resolveFieldId(evidenceFields.byName.get('Link')!)] = 'https://example.com'
        payload[resolveFieldId(evidenceFields.byName.get('Date')!)] = Date.now()
        payload[resolveFieldId(evidenceFields.byName.get('Evidence_Type')!)] = selectValue('Evidence_Type', evType, evidenceFields.optionMap)
        payload[resolveFieldId(evidenceFields.byName.get('KeyResult')!)] = [krIds[krIndex]]
        payload[resolveFieldId(evidenceFields.byName.get('Action')!)] = [actionIds[actionIndex]]
        await evidenceTable.addRecord({ fields: payload })
        await stepDone(`已创建 Evidence：${title}`)
      }

      const weeklyPayload: Record<string, unknown> = {}
      if (weeklyFields.primaryFieldId) {
        weeklyPayload[weeklyFields.primaryFieldId] = '本周重点交付'
      }
      weeklyPayload[resolveFieldId(weeklyFields.byName.get('Week_Start')!)] = Date.now()
      weeklyPayload[resolveFieldId(weeklyFields.byName.get('Deliverable')!)] = '完成价值验证结论 + 漏斗分析初稿'
      weeklyPayload[resolveFieldId(weeklyFields.byName.get('Risk')!)] = '实验样本不足影响结论稳定性'
      weeklyPayload[resolveFieldId(weeklyFields.byName.get('Time_Budget_Min')!)] = 600
      weeklyPayload[resolveFieldId(weeklyFields.byName.get('KeyResults')!)] = krIds
      await weeklyTable.addRecord({ fields: weeklyPayload })
      await stepDone('已创建 WeeklyPlan')

      const ideaPayload: Record<string, unknown> = {}
      if (ideasFields.primaryFieldId) {
        ideaPayload[ideasFields.primaryFieldId] = '探索优质UGC冷启动激励机制'
      }
      ideaPayload[resolveFieldId(ideasFields.byName.get('Idea_Title')!)] = '探索优质UGC冷启动激励机制'
      ideaPayload[resolveFieldId(ideasFields.byName.get('Est_Minutes')!)] = 120
      ideaPayload[resolveFieldId(ideasFields.byName.get('Status')!)] = selectValue('Status', 'Parking', ideasFields.optionMap)
      ideaPayload[resolveFieldId(ideasFields.byName.get('Notes')!)] = '等待结论后再评估是否转正'
      ideaPayload[resolveFieldId(ideasFields.byName.get('KeyResults')!)] = [krIds[2]]
      await ideasTable.addRecord({ fields: ideaPayload })
      await stepDone('已创建 Idea')

      message.success('Demo 数据已生成')
    } catch (err) {
      console.error(err)
      message.error(`生成失败：${String(err)}`)
    } finally {
      setSeeding(false)
    }
  }

  const tabs = useMemo(
    () => [
      {
        key: 'demo',
        label: 'Demo 数据',
        children: (
          <Card>
            <Space direction="vertical" size={16}>
              <Text>用于快速生成一套 OKR 演示数据（O1 + 3 个 KR + Actions/Evidence）。</Text>
              {!isBitable && (
                <Alert
                  type="info"
                  showIcon
                  message="当前为本地预览环境，生成数据需在飞书多维表格插件中运行。"
                />
              )}
              <Button type="primary" loading={seeding} onClick={handleSeed} disabled={!isBitable}>
                生成 Demo OKR 数据
              </Button>
              <Alert
                type="warning"
                showIcon
                message="注意：重复点击会创建多份演示数据。"
              />
              <Progress percent={progress} status={seeding ? 'active' : progress === 100 ? 'success' : 'normal'} />
              <Card size="small" title="执行日志">
                <List
                  size="small"
                  dataSource={logLines}
                  locale={{ emptyText: '暂无日志' }}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              </Card>
            </Space>
          </Card>
        ),
      },
      {
        key: 'home',
        label: 'Home 总览',
        children: (
          <Card>
            <Text>展示 Top KRs、偏航提示、开始纠偏入口。</Text>
          </Card>
        ),
      },
      {
        key: 'today',
        label: 'Today',
        children: (
          <Card>
            <Text>从 Action Bank 拉取 1-2 个 MIT，并展示今日任务列表。</Text>
          </Card>
        ),
      },
      {
        key: 'bank',
        label: 'Action Bank',
        children: (
          <Card>
            <Text>按 KR 过滤动作库，快速“拉取到 Today”。</Text>
          </Card>
        ),
      },
      {
        key: 'evidence',
        label: 'Evidence',
        children: (
          <Card>
            <Text>完成 Action 时强制添加证据或失败原因。</Text>
          </Card>
        ),
      },
      {
        key: 'drift',
        label: 'Drift',
        children: (
          <Card>
            <Text>偏航指标：连续无证据天数、未关联 KR 的 Action 数。</Text>
          </Card>
        ),
      },
      {
        key: 'ideas',
        label: 'Parking Lot',
        children: (
          <Card>
            <Text>记录想法，控制探索预算。</Text>
          </Card>
        ),
      },
      {
        key: 'guardrail',
        label: 'Guardrail',
        children: (
          <Card>
            <Text>新建 Action 超过 30 分钟且无 KR 时提示转 Parking。</Text>
          </Card>
        ),
      },
    ],
    [seeding]
  )

  return (
    <div className="app">
      <div className="app-header">
        <Title level={3}>OKR管理工具箱</Title>
        <Text type="secondary">MVP 闭环：OKR → Action → Evidence → Drift → 纠偏</Text>
      </div>
      <Divider />
      <Tabs items={tabs} />
      <Modal
        title="确认生成 Demo 数据"
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onOk={runSeed}
        okText="确认执行"
        cancelText="取消"
        confirmLoading={seeding}
      >
        <Text>将执行以下操作：</Text>
        <List
          size="small"
          dataSource={pendingOps}
          renderItem={(item) => <List.Item>{item}</List.Item>}
        />
      </Modal>
    </div>
  )
}

export default App
