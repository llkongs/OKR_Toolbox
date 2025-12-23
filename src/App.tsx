import { useEffect, useState } from 'react'
import { bitable } from '@lark-base-open/js-sdk'
import { Alert, Button, Card, Divider, List, Select, Space, Tabs, Tag, Typography, message } from 'antd'
import OperationRunner from './components/OperationRunner'
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
  getRecords: (params?: { pageSize?: number }) => Promise<{ records: Array<{ recordId: string; fields: Record<string, unknown> }> }>
  addRecord: (payload: { fields: Record<string, unknown> }) => Promise<string>
  setRecord?: (recordId: string, payload: { fields: Record<string, unknown> }) => Promise<unknown>
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
  const optionIdMap = new Map<string, Map<string, string>>()
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
      const idMap = new Map<string, string>()
      options.forEach((opt) => {
        if (opt.name && opt.id) {
          optMap.set(opt.name, opt.id)
          idMap.set(opt.id, opt.name)
        }
      })
      optionMap.set(name, optMap)
      optionIdMap.set(name, idMap)
    }
  })

  return { byName, optionMap, optionIdMap, primaryFieldId }
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

function resolveSelectLabel(
  value: unknown,
  fieldName: string,
  optionIdMap: Map<string, Map<string, string>>
) {
  if (!value) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'object' && value !== null) {
    const id = (value as { id?: string }).id
    if (!id) {
      return ''
    }
    const map = optionIdMap.get(fieldName)
    return map?.get(id) ?? id
  }
  return ''
}

function App() {
  const isBitable = Boolean((bitable as unknown as { base?: unknown }).base)
  const [activeTab, setActiveTab] = useState('demo')
  const [homeLoading, setHomeLoading] = useState(false)
  const [homeError, setHomeError] = useState<string | null>(null)
  const [topKrs, setTopKrs] = useState<
    Array<{
      id: string
      title: string
      progress?: number
      confidence?: number
      due?: number
      daysSinceEvidence: number | null
    }>
  >([])
  const [driftKrsCount, setDriftKrsCount] = useState(0)
  const [unalignedActions, setUnalignedActions] = useState(0)
  const [todayLoading, setTodayLoading] = useState(false)
  const [todayError, setTodayError] = useState<string | null>(null)
  const [todayList, setTodayList] = useState<
    Array<{
      id: string
      title: string
      minutes?: number
      planDate?: number
      krTitle?: string
    }>
  >([])
  const [backlogOptions, setBacklogOptions] = useState<Array<{ value: string; label: string }>>([])
  const [selectedBacklogId, setSelectedBacklogId] = useState<string>()
  const [bankLoading, setBankLoading] = useState(false)
  const [bankError, setBankError] = useState<string | null>(null)
  const [bankKrs, setBankKrs] = useState<Array<{ value: string; label: string }>>([])
  const [bankSelectedKr, setBankSelectedKr] = useState<string>('all')
  const [bankActions, setBankActions] = useState<
    Array<{ id: string; title: string; minutes?: number; planDate?: number; krId?: string; krTitle?: string }>
  >([])

  const runSeed = async (ctx: { step: (line: string) => Promise<void> }) => {
    const { step } = ctx
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
      await step('已创建 Objective')

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
        await step(`已创建 KR：${kr.title}`)
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
        await step(`已创建 Action：${title}`)
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
        await step(`已创建 Evidence：${title}`)
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
      await step('已创建 WeeklyPlan')

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
      await step('已创建 Idea')

      message.success('Demo 数据已生成')
    } catch (err) {
      console.error(err)
      message.error(`生成失败：${String(err)}`)
    }
  }

  const loadHomeData = async () => {
    if (!isBitable) {
      setHomeError('当前为本地预览环境，请在飞书多维表格插件中使用。')
      return
    }
    setHomeLoading(true)
    setHomeError(null)
    try {
      const krTable = await getTableByName('KeyResults')
      const evidenceTable = await getTableByName('Evidence')
      const actionTable = await getTableByName('Actions')

      const krFields = buildFieldIndex(await krTable.getFieldMetaList())
      const evidenceFields = buildFieldIndex(await evidenceTable.getFieldMetaList())
      const actionFields = buildFieldIndex(await actionTable.getFieldMetaList())

      const krRecords = await krTable.getRecords({ pageSize: 5000 })
      const evidenceRecords = await evidenceTable.getRecords({ pageSize: 5000 })
      const actionRecords = await actionTable.getRecords({ pageSize: 5000 })

      const krTitleId = resolveFieldId(krFields.byName.get('KR_Title')!)
      const krProgressId = resolveFieldId(krFields.byName.get('Progress')!)
      const krConfidenceId = resolveFieldId(krFields.byName.get('Confidence')!)
      const krDueId = resolveFieldId(krFields.byName.get('Due_Date')!)
      const evidenceKrId = resolveFieldId(evidenceFields.byName.get('KeyResult')!)
      const evidenceDateId = resolveFieldId(evidenceFields.byName.get('Date')!)
      const actionKrId = resolveFieldId(actionFields.byName.get('KeyResult')!)

      const evidenceMap = new Map<string, number>()
      evidenceRecords.records.forEach((record) => {
        const krLinks = record.fields[evidenceKrId] as string[] | undefined
        const date = record.fields[evidenceDateId] as number | undefined
        if (!krLinks || !date) return
        krLinks.forEach((krId) => {
          const prev = evidenceMap.get(krId) ?? 0
          if (date > prev) {
            evidenceMap.set(krId, date)
          }
        })
      })

      let unaligned = 0
      actionRecords.records.forEach((record) => {
        const links = record.fields[actionKrId] as string[] | undefined
        if (!links || links.length === 0) {
          unaligned += 1
        }
      })
      setUnalignedActions(unaligned)

      const now = Date.now()
      const dayMs = 24 * 60 * 60 * 1000
      const krList = krRecords.records.map((record) => {
        const id = record.recordId
        const title = (record.fields[krTitleId] as string) || '未命名 KR'
        const progress = record.fields[krProgressId] as number | undefined
        const confidence = record.fields[krConfidenceId] as number | undefined
        const due = record.fields[krDueId] as number | undefined
        const lastEvidence = evidenceMap.get(id)
        const daysSinceEvidence = lastEvidence ? Math.floor((now - lastEvidence) / dayMs) : null
        return { id, title, progress, confidence, due, daysSinceEvidence }
      })

      const driftCount = krList.filter((kr) => kr.daysSinceEvidence === null || kr.daysSinceEvidence >= 2).length
      setDriftKrsCount(driftCount)

      const sorted = [...krList].sort((a, b) => {
        const aScore = a.daysSinceEvidence === null ? Number.POSITIVE_INFINITY : a.daysSinceEvidence
        const bScore = b.daysSinceEvidence === null ? Number.POSITIVE_INFINITY : b.daysSinceEvidence
        if (aScore !== bScore) return bScore - aScore
        return (a.progress ?? 0) - (b.progress ?? 0)
      })
      setTopKrs(sorted.slice(0, 5))
    } catch (err) {
      console.error(err)
      setHomeError(`加载失败：${String(err)}`)
    } finally {
      setHomeLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'home') {
      void loadHomeData()
    }
  }, [activeTab])

  const loadTodayData = async () => {
    if (!isBitable) {
      setTodayError('当前为本地预览环境，请在飞书多维表格插件中使用。')
      return
    }
    setTodayLoading(true)
    setTodayError(null)
    try {
      const actionTable = await getTableByName('Actions')
      const krTable = await getTableByName('KeyResults')
      const actionFields = buildFieldIndex(await actionTable.getFieldMetaList())
      const krFields = buildFieldIndex(await krTable.getFieldMetaList())

      const actionRecords = await actionTable.getRecords({ pageSize: 5000 })
      const krRecords = await krTable.getRecords({ pageSize: 5000 })

      const krTitleId = resolveFieldId(krFields.byName.get('KR_Title')!)
      const krMap = new Map<string, string>()
      krRecords.records.forEach((record) => {
        const title = record.fields[krTitleId] as string | undefined
        if (title) {
          krMap.set(record.recordId, title)
        }
      })

      const statusFieldId = resolveFieldId(actionFields.byName.get('Status')!)
      const titleFieldId = resolveFieldId(actionFields.byName.get('Action_Title')!)
      const minutesFieldId = resolveFieldId(actionFields.byName.get('Est_Minutes')!)
      const planDateFieldId = resolveFieldId(actionFields.byName.get('Plan_Date')!)
      const krLinkFieldId = resolveFieldId(actionFields.byName.get('KeyResult')!)

      const todayItems: Array<{ id: string; title: string; minutes?: number; planDate?: number; krTitle?: string }> = []
      const backlogItems: Array<{ value: string; label: string }> = []

      actionRecords.records.forEach((record) => {
        const statusValue = record.fields[statusFieldId]
        const statusLabel = resolveSelectLabel(statusValue, 'Status', actionFields.optionIdMap)
        const title = (record.fields[titleFieldId] as string) || '未命名 Action'
        const minutes = record.fields[minutesFieldId] as number | undefined
        const planDate = record.fields[planDateFieldId] as number | undefined
        const krLinks = record.fields[krLinkFieldId] as string[] | undefined
        const krTitle = krLinks && krLinks.length > 0 ? krMap.get(krLinks[0]) : undefined

        if (statusLabel === 'Today') {
          todayItems.push({ id: record.recordId, title, minutes, planDate, krTitle })
        }
        if (statusLabel === 'Backlog') {
          backlogItems.push({ value: record.recordId, label: title })
        }
      })

      setTodayList(todayItems)
      setBacklogOptions(backlogItems)
    } catch (err) {
      console.error(err)
      setTodayError(`加载失败：${String(err)}`)
    } finally {
      setTodayLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'today') {
      void loadTodayData()
    }
  }, [activeTab])

  const loadBankData = async () => {
    if (!isBitable) {
      setBankError('当前为本地预览环境，请在飞书多维表格插件中使用。')
      return
    }
    setBankLoading(true)
    setBankError(null)
    try {
      const actionTable = await getTableByName('Actions')
      const krTable = await getTableByName('KeyResults')
      const actionFields = buildFieldIndex(await actionTable.getFieldMetaList())
      const krFields = buildFieldIndex(await krTable.getFieldMetaList())

      const actionRecords = await actionTable.getRecords({ pageSize: 5000 })
      const krRecords = await krTable.getRecords({ pageSize: 5000 })

      const krTitleId = resolveFieldId(krFields.byName.get('KR_Title')!)
      const krMap = new Map<string, string>()
      const krOptions: Array<{ value: string; label: string }> = [{ value: 'all', label: '全部 KR' }]
      krRecords.records.forEach((record) => {
        const title = record.fields[krTitleId] as string | undefined
        if (!title) return
        krMap.set(record.recordId, title)
        krOptions.push({ value: record.recordId, label: title })
      })
      setBankKrs(krOptions)

      const statusFieldId = resolveFieldId(actionFields.byName.get('Status')!)
      const titleFieldId = resolveFieldId(actionFields.byName.get('Action_Title')!)
      const minutesFieldId = resolveFieldId(actionFields.byName.get('Est_Minutes')!)
      const planDateFieldId = resolveFieldId(actionFields.byName.get('Plan_Date')!)
      const krLinkFieldId = resolveFieldId(actionFields.byName.get('KeyResult')!)

      const items: Array<{ id: string; title: string; minutes?: number; planDate?: number; krId?: string; krTitle?: string }> = []

      actionRecords.records.forEach((record) => {
        const statusValue = record.fields[statusFieldId]
        const statusLabel = resolveSelectLabel(statusValue, 'Status', actionFields.optionIdMap)
        if (statusLabel !== 'Backlog') return
        const title = (record.fields[titleFieldId] as string) || '未命名 Action'
        const minutes = record.fields[minutesFieldId] as number | undefined
        const planDate = record.fields[planDateFieldId] as number | undefined
        const krLinks = record.fields[krLinkFieldId] as string[] | undefined
        const krId = krLinks && krLinks.length > 0 ? krLinks[0] : undefined
        const krTitle = krId ? krMap.get(krId) : undefined
        items.push({ id: record.recordId, title, minutes, planDate, krId, krTitle })
      })

      setBankActions(items)
    } catch (err) {
      console.error(err)
      setBankError(`加载失败：${String(err)}`)
    } finally {
      setBankLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'bank') {
      void loadBankData()
    }
  }, [activeTab])

  const updateActionStatus = async (recordId: string, status: 'Today' | 'Backlog' | 'Done') => {
    const actionTable = await getTableByName('Actions')
    if (!actionTable.setRecord) {
      throw new Error('当前环境不支持更新记录')
    }
    const actionFields = buildFieldIndex(await actionTable.getFieldMetaList())
    const statusFieldId = resolveFieldId(actionFields.byName.get('Status')!)
    const statusValue = selectValue('Status', status, actionFields.optionMap)
    await actionTable.setRecord(recordId, { fields: { [statusFieldId]: statusValue } })
  }

  const tabs = [
    {
      key: 'demo',
      label: 'Demo 数据',
      children: (
        <OperationRunner
          title="确认生成 Demo 数据"
          description="用于快速生成一套 OKR 演示数据（O1 + 3 个 KR + Actions/Evidence）。"
          buttonLabel="生成 Demo OKR 数据"
          runningLabel="正在生成..."
          disabled={!isBitable}
          totalSteps={14}
          steps={[
            '创建 Objective',
            '创建 3 条 KeyResults',
            '创建 6 条 Actions',
            '创建 2 条 Evidence',
            '创建 WeeklyPlan',
            '创建 Idea',
          ]}
          onRun={runSeed}
        />
      ),
    },
    {
      key: 'home',
      label: 'Home 总览',
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {homeError && <Alert type="error" showIcon message={homeError} />}
          <Card>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap>
                <Tag color={driftKrsCount > 0 ? 'red' : 'green'}>偏航 KR：{driftKrsCount}</Tag>
                <Tag color={unalignedActions > 0 ? 'orange' : 'green'}>未关联 Action：{unalignedActions}</Tag>
              </Space>
              <Space wrap>
                <Button onClick={loadHomeData} loading={homeLoading}>
                  刷新
                </Button>
                <Button type="primary" onClick={() => setActiveTab('drift')}>
                  开始纠偏
                </Button>
              </Space>
            </Space>
          </Card>
          <Card title="Top KRs（按偏航优先）" loading={homeLoading}>
            <List
              dataSource={topKrs}
              locale={{ emptyText: '暂无 KR' }}
              renderItem={(kr) => {
                const dueText = kr.due ? new Date(kr.due).toLocaleDateString('zh-CN') : '未设置'
                const evidenceText = kr.daysSinceEvidence === null ? '无证据' : `${kr.daysSinceEvidence} 天`
                return (
                  <List.Item>
                    <Space direction="vertical">
                      <Text strong>{kr.title}</Text>
                      <Space wrap>
                        <Tag color="blue">进度：{kr.progress ?? 0}%</Tag>
                        <Tag color="gold">信心：{kr.confidence ?? '-'}</Tag>
                        <Tag>距上次证据：{evidenceText}</Tag>
                        <Tag>截止：{dueText}</Tag>
                      </Space>
                    </Space>
                  </List.Item>
                )
              }}
            />
          </Card>
        </Space>
      ),
    },
    {
      key: 'today',
      label: 'Today',
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {todayError && <Alert type="error" showIcon message={todayError} />}
          <Card>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap>
                <Button onClick={loadTodayData} loading={todayLoading}>
                  刷新
                </Button>
              </Space>
              <Space wrap>
                <Select
                  placeholder="从 Backlog 选择 Action"
                  style={{ minWidth: 260 }}
                  options={backlogOptions}
                  value={selectedBacklogId}
                  onChange={setSelectedBacklogId}
                />
                <Button
                  type="primary"
                  disabled={!selectedBacklogId}
                  onClick={async () => {
                    if (!selectedBacklogId) return
                    try {
                      await updateActionStatus(selectedBacklogId, 'Today')
                      message.success('已加入 Today')
                      setSelectedBacklogId(undefined)
                      await loadTodayData()
                    } catch (err) {
                      console.error(err)
                      message.error(`操作失败：${String(err)}`)
                    }
                  }}
                >
                  加入 Today
                </Button>
              </Space>
            </Space>
          </Card>
          <Card title={`今日任务（${todayList.length}）`} loading={todayLoading}>
            <List
              dataSource={todayList}
              locale={{ emptyText: '暂无 Today 任务' }}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      key="done"
                      type="link"
                      onClick={async () => {
                        try {
                          await updateActionStatus(item.id, 'Done')
                          message.success('已标记完成')
                          await loadTodayData()
                        } catch (err) {
                          console.error(err)
                          message.error(`操作失败：${String(err)}`)
                        }
                      }}
                    >
                      标记完成
                    </Button>,
                    <Button
                      key="backlog"
                      type="link"
                      onClick={async () => {
                        try {
                          await updateActionStatus(item.id, 'Backlog')
                          message.info('已移回 Backlog')
                          await loadTodayData()
                        } catch (err) {
                          console.error(err)
                          message.error(`操作失败：${String(err)}`)
                        }
                      }}
                    >
                      移回 Backlog
                    </Button>,
                  ]}
                >
                  <Space direction="vertical">
                    <Text strong>{item.title}</Text>
                    <Space wrap>
                      {item.krTitle && <Tag color="blue">{item.krTitle}</Tag>}
                      {item.minutes && <Tag>预计 {item.minutes} 分钟</Tag>}
                      {item.planDate && <Tag>计划 {new Date(item.planDate).toLocaleDateString('zh-CN')}</Tag>}
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Space>
      ),
    },
    {
      key: 'bank',
      label: 'Action Bank',
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {bankError && <Alert type="error" showIcon message={bankError} />}
          <Card>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap>
                <Button onClick={loadBankData} loading={bankLoading}>
                  刷新
                </Button>
                <Select
                  value={bankSelectedKr}
                  onChange={setBankSelectedKr}
                  options={bankKrs}
                  style={{ minWidth: 220 }}
                />
              </Space>
            </Space>
          </Card>
          <Card title={`Backlog 动作（${bankActions.length}）`} loading={bankLoading}>
            <List
              dataSource={bankActions.filter((item) => bankSelectedKr === 'all' || item.krId === bankSelectedKr)}
              locale={{ emptyText: '暂无 Backlog 动作' }}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      key="pull"
                      type="link"
                      onClick={async () => {
                        try {
                          await updateActionStatus(item.id, 'Today')
                          message.success('已拉取到 Today')
                          await loadBankData()
                        } catch (err) {
                          console.error(err)
                          message.error(`操作失败：${String(err)}`)
                        }
                      }}
                    >
                      拉取到 Today
                    </Button>,
                  ]}
                >
                  <Space direction="vertical">
                    <Text strong>{item.title}</Text>
                    <Space wrap>
                      {item.krTitle && <Tag color="blue">{item.krTitle}</Tag>}
                      {item.minutes && <Tag>预计 {item.minutes} 分钟</Tag>}
                      {item.planDate && <Tag>计划 {new Date(item.planDate).toLocaleDateString('zh-CN')}</Tag>}
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Space>
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
  ]

  return (
    <div className="app">
      <div className="app-header">
        <Title level={3}>OKR管理工具箱</Title>
        <Text type="secondary">MVP 闭环：OKR → Action → Evidence → Drift → 纠偏</Text>
      </div>
      <Divider />
      <Tabs items={tabs} activeKey={activeTab} onChange={setActiveTab} />
    </div>
  )
}

export default App
