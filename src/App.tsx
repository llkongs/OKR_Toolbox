import { useEffect, useState } from 'react'
import { bitable } from '@lark-base-open/js-sdk'
import {
  Alert,
  Button,
  Card,
  Divider,
  Input,
  List,
  Modal,
  Progress as AntProgress,
  Select,
  Space,
  Tag,
  Tabs,
  Typography,
  message,
} from 'antd'
import OperationRunner from './components/OperationRunner'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

const { Title, Text } = Typography
const APP_VERSION = '0.1.13'

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

type LogEntry = {
  id: string
  ts: string
  level: 'info' | 'error' | 'warn'
  message: string
  detail?: string
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

function toText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(toText).join('')
  if (typeof value === 'object') {
    const obj = value as { text?: string; name?: string }
    if (obj.text) return String(obj.text)
    if (obj.name) return String(obj.name)
    return JSON.stringify(value)
  }
  return String(value)
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function toLinkIds(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[]
  if (value && typeof value === 'object') {
    const obj = value as { record_ids?: string[]; recordIds?: string[]; link_record_ids?: string[] }
    if (Array.isArray(obj.record_ids)) return obj.record_ids
    if (Array.isArray(obj.recordIds)) return obj.recordIds
    if (Array.isArray(obj.link_record_ids)) return obj.link_record_ids
  }
  return []
}

function resolveFieldIdByCandidates(fieldIndex: ReturnType<typeof buildFieldIndex>, names: string[]) {
  for (const name of names) {
    const meta = fieldIndex.byName.get(name)
    if (meta) return resolveFieldId(meta)
  }
  return ''
}

function resolveFieldNameByCandidates(fieldIndex: ReturnType<typeof buildFieldIndex>, names: string[]) {
  for (const name of names) {
    if (fieldIndex.byName.get(name)) return name
  }
  return ''
}

function getOkrPlanFieldIds(fieldIndex: ReturnType<typeof buildFieldIndex>) {
  return {
    objectiveId: resolveFieldIdByCandidates(fieldIndex, ['Objectives', 'Objective_Title', 'Objective']),
    krTitleId: resolveFieldIdByCandidates(fieldIndex, ['Key Results', 'KR_Title', 'KR']),
    actionTitleId: resolveFieldIdByCandidates(fieldIndex, ['Actions', 'Action_Title', 'Action']),
    statusId: resolveFieldIdByCandidates(fieldIndex, ['Action Status', 'Action_Status', 'Status']),
    estMinutesId: resolveFieldIdByCandidates(fieldIndex, ['Action Est Minutes', 'Action_Est_Minutes', 'Est_Minutes']),
    planStartId: resolveFieldIdByCandidates(fieldIndex, ['预期开始', 'Action_Plan_Start', 'Plan_Start', 'Plan_Date']),
    planEndId: resolveFieldIdByCandidates(fieldIndex, ['预期结束', 'Action_Plan_End', 'Plan_End', 'Plan_Date']),
    actionProgressId: resolveFieldIdByCandidates(fieldIndex, ['Action Progress']),
  }
}

function dayStamp(ts: number) {
  const date = new Date(ts)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function getQuarterStart(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3) * 3
  return new Date(date.getFullYear(), quarter, 1).getTime()
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

function getWeekStart(date: Date) {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff)
  return start.getTime()
}

function computeActionScore(params: { planStart?: number; planEnd?: number; progress?: number }) {
  const { planStart, planEnd, progress } = params
  if (!planStart || !planEnd) return null
  const start = dayStamp(planStart)
  const end = dayStamp(planEnd)
  if (end < start) return null
  const today = dayStamp(Date.now())
  const duration = end - start
  const timeProgress = duration === 0 ? 1 : Math.min(1, Math.max(0, (today - start) / duration))
  const rawProgress = typeof progress === 'number' ? progress : 0
  const actualProgress = rawProgress > 1 ? rawProgress / 100 : rawProgress
  const delta = actualProgress - timeProgress
  const score = delta >= 0 ? 100 : Math.max(0, Math.round(100 * (1 + delta)))
  return { score, timeProgress, actualProgress, delta }
}

function normalizeProgressValue(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return value > 1 ? value / 100 : value
}

function scoreColor(value: number) {
  if (value >= 85) return '#22c55e'
  if (value >= 70) return '#f59e0b'
  return '#ef4444'
}

function App() {
  const isBitable = Boolean((bitable as unknown as { base?: unknown }).base)
  const [activeTab, setActiveTab] = useState('home')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [copyPayload, setCopyPayload] = useState('')
  const [todayLoading, setTodayLoading] = useState(false)
  const [todayError, setTodayError] = useState<string | null>(null)
  const [todayList, setTodayList] = useState<
    Array<{
      id: string
      title: string
      minutes?: number
      planStart?: number
      planEnd?: number
      krId?: string
      krTitle?: string
    }>
  >([])
  const [backlogOptions, setBacklogOptions] = useState<Array<{ value: string; label: string }>>([])
  const [selectedBacklogId, setSelectedBacklogId] = useState<string>()
  const [actionStatusAvailable, setActionStatusAvailable] = useState(true)
  const [scoreSummary, setScoreSummary] = useState<{ week: number; month: number; quarter: number }>({
    week: 0,
    month: 0,
    quarter: 0,
  })
  const [scoreReasons, setScoreReasons] = useState<string[]>([])
  const [laggingActions, setLaggingActions] = useState<string[]>([])
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const [evidenceActions, setEvidenceActions] = useState<Array<{ value: string; label: string }>>([])
  const [evidenceActionMeta, setEvidenceActionMeta] = useState<Record<string, { krId?: string; krTitle?: string }>>({})
  const [evidenceTypeOptions, setEvidenceTypeOptions] = useState<Array<{ value: string; label: string }>>([
    { value: 'Note', label: 'Note' },
  ])
  const [evidenceList, setEvidenceList] = useState<
    Array<{ title: string; type?: string; date?: number; krTitle?: string; actionTitle?: string }>
  >([])
  const [selectedEvidenceAction, setSelectedEvidenceAction] = useState<string>()
  const [evidenceTitle, setEvidenceTitle] = useState('')
  const [evidenceType, setEvidenceType] = useState<string>('Note')
  const [evidenceLink, setEvidenceLink] = useState('')
  const [completeModalOpen, setCompleteModalOpen] = useState(false)
  const [completeActionId, setCompleteActionId] = useState<string>()
  const [completeActionTitle, setCompleteActionTitle] = useState<string>('')
  const [completeActionKrId, setCompleteActionKrId] = useState<string>()
  const [completeEvidenceTitle, setCompleteEvidenceTitle] = useState('')
  const [completeEvidenceType, setCompleteEvidenceType] = useState<string>('Note')
  const [completeEvidenceLink, setCompleteEvidenceLink] = useState('')
  const [completeFailureReason, setCompleteFailureReason] = useState('')

  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      const current = url.searchParams.get('v')
      if (current !== APP_VERSION) {
        url.searchParams.set('v', APP_VERSION)
        window.location.replace(url.toString())
      }
    } catch {
      // ignore URL errors
    }
  }, [])

  const logEvent = (level: LogEntry['level'], messageText: string, detail?: string) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ts: new Date().toISOString(),
      level,
      message: messageText,
      detail,
    }
    setLogs((prev) => [entry, ...prev].slice(0, 200))
  }

  const reportError = (context: string, err: unknown) => {
    const detail = err instanceof Error ? err.stack || err.message : String(err)
    logEvent('error', context, detail)
  }

  const handleBoundaryError = (context: string, err: Error) => {
    console.error(`[${context}]`, err)
    reportError(`渲染失败：${context}`, err)
  }

  const copyLogs = async () => {
    const payload = JSON.stringify(logs, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
      message.success('日志已复制')
    } catch {
      setCopyPayload(payload)
      setCopyModalOpen(true)
      message.error('复制失败，请手动复制')
    }
  }

  const clearLogs = () => {
    setLogs([])
    message.success('日志已清空')
  }

  const loadTodayData = async () => {
    if (!isBitable) {
      setTodayError('当前为本地预览环境，请在飞书多维表格插件中使用。')
      return
    }
    setTodayLoading(true)
    setTodayError(null)
    try {
      const okrTable = await getTableByName('OKRPlan')
      const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())
      const okrRecords = await okrTable.getRecords({ pageSize: 5000 })

      const {
        actionTitleId,
        statusId,
        estMinutesId,
        planStartId,
        planEndId,
        krTitleId,
        actionProgressId,
      } = getOkrPlanFieldIds(okrFields)
      const statusFieldName = resolveFieldNameByCandidates(okrFields, ['Action Status', 'Action_Status', 'Status'])
      setActionStatusAvailable(Boolean(statusId))

      const todayItems: Array<{
        id: string
        title: string
        minutes?: number
        planStart?: number
        planEnd?: number
        krId?: string
        krTitle?: string
      }> = []
      const backlogItems: Array<{ value: string; label: string }> = []
      const scoredActions: Array<{
        title: string
        planStart?: number
        planEnd?: number
        progress?: number
      }> = []

      const okrList = asArray<{ recordId: string; fields: Record<string, unknown> }>(okrRecords.records)
      okrList.forEach((record) => {
        const title = actionTitleId ? toText(record.fields[actionTitleId]) : ''
        if (!title) return
        const statusLabel =
          statusId && statusFieldName
            ? resolveSelectLabel(record.fields[statusId], statusFieldName, okrFields.optionIdMap)
            : ''
        const minutes = estMinutesId ? (record.fields[estMinutesId] as number | undefined) : undefined
        const planStart = planStartId ? (record.fields[planStartId] as number | undefined) : undefined
        const planEnd = planEndId ? (record.fields[planEndId] as number | undefined) : undefined
        const krTitle = krTitleId ? toText(record.fields[krTitleId]) : undefined
        const progressRaw = actionProgressId ? record.fields[actionProgressId] : undefined
        const progress = typeof progressRaw === 'number' ? progressRaw : undefined
        const started = planStart || planEnd ? dayStamp(planStart ?? planEnd ?? Date.now()) <= dayStamp(Date.now()) : false
        const doneByStatus = statusLabel === 'Done'
        const doneByProgress = progress !== undefined && normalizeProgressValue(progress) >= 1
        const isDone = statusId ? doneByStatus : doneByProgress
        const shouldShowToday = (started || statusLabel === 'Today' || statusLabel === 'Doing') && !isDone

        if (planStart || planEnd || progress !== undefined) {
          scoredActions.push({ title, planStart, planEnd, progress })
        }

        if (shouldShowToday) {
          todayItems.push({ id: record.recordId, title, minutes, planStart, planEnd, krId: record.recordId, krTitle })
        }
        if ((statusId && statusLabel === 'Backlog') || (!statusId && !started)) {
          const dateLabel =
            planStart || planEnd
              ? `${planStart ? new Date(planStart).toLocaleDateString('zh-CN') : ''}${
                  planEnd ? ` - ${new Date(planEnd).toLocaleDateString('zh-CN')}` : ''
                }`
              : '未规划'
          const label = `${title} · ${dateLabel}`
          backlogItems.push({ value: record.recordId, label })
        }
      })

      setTodayList(todayItems)
      setBacklogOptions(backlogItems)

      const now = new Date()
      const todayStampMs = dayStamp(Date.now())
      const weekStart = dayStamp(getWeekStart(now))
      const monthStart = dayStamp(getMonthStart(now))
      const quarterStart = dayStamp(getQuarterStart(now))

      const buildSummary = (rangeStart: number) => {
        const scored = scoredActions
          .map((item) => {
            const scoreInfo = computeActionScore({
              planStart: item.planStart,
              planEnd: item.planEnd,
              progress: item.progress,
            })
            return { ...item, scoreInfo }
          })
          .filter((item) => {
            if (!item.scoreInfo || !item.planStart || !item.planEnd) return false
            const start = dayStamp(item.planStart)
            const end = dayStamp(item.planEnd)
            return end >= rangeStart && start <= todayStampMs
          })

        if (scored.length === 0) {
          return { score: 100, reasons: ['暂无已开始的 Action，得分暂按 100'] }
        }

        const avg = Math.round(
          scored.reduce((sum, item) => sum + (item.scoreInfo?.score ?? 0), 0) / scored.length
        )
        const reasons = scored
          .filter((item) => (item.scoreInfo?.delta ?? 0) < 0)
          .sort((a, b) => (a.scoreInfo?.delta ?? 0) - (b.scoreInfo?.delta ?? 0))
          .slice(0, 5)
          .map((item) => {
            const timeProgress = Math.round((item.scoreInfo?.timeProgress ?? 0) * 100)
            const actualProgress = Math.round((item.scoreInfo?.actualProgress ?? 0) * 100)
            const lag = Math.round(Math.abs((item.scoreInfo?.delta ?? 0) * 100))
            return `《${item.title}》落后 ${lag}%（时间 ${timeProgress}%，实际 ${actualProgress}%）`
          })
        if (reasons.length === 0) {
          reasons.push('暂无扣分项')
        }
        return { score: Math.max(0, Math.min(100, avg)), reasons }
      }

      const weekSummary = buildSummary(weekStart)
      const monthSummary = buildSummary(monthStart)
      const quarterSummary = buildSummary(quarterStart)
      setScoreSummary({ week: weekSummary.score, month: monthSummary.score, quarter: quarterSummary.score })
      setScoreReasons(weekSummary.reasons)

      const lagging = scoredActions
        .map((item) => {
          const scoreInfo = computeActionScore({
            planStart: item.planStart,
            planEnd: item.planEnd,
            progress: item.progress,
          })
          return { ...item, scoreInfo }
        })
        .filter((item) => {
          if (!item.scoreInfo || !item.planStart) return false
          if (dayStamp(item.planStart) > todayStampMs) return false
          return (item.scoreInfo.delta ?? 0) < 0
        })
        .sort((a, b) => (a.scoreInfo?.delta ?? 0) - (b.scoreInfo?.delta ?? 0))
        .slice(0, 10)
        .map((item) => {
          const timeProgress = Math.round((item.scoreInfo?.timeProgress ?? 0) * 100)
          const actualProgress = Math.round((item.scoreInfo?.actualProgress ?? 0) * 100)
          const lag = Math.round(Math.abs((item.scoreInfo?.delta ?? 0) * 100))
          return `《${item.title}》落后 ${lag}%（时间 ${timeProgress}%，实际 ${actualProgress}%）`
        })

      setLaggingActions(lagging)
    } catch (err) {
      console.error(err)
      setTodayError(`加载失败：${String(err)}`)
      reportError('Today 数据加载失败', err)
    } finally {
      setTodayLoading(false)
    }
  }

  const updateActionStatus = async (recordId: string, status: 'Today' | 'Backlog' | 'Done') => {
    const okrTable = await getTableByName('OKRPlan')
    if (!okrTable.setRecord) {
      throw new Error('当前环境不支持更新记录')
    }
    const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())
    const statusFieldName = resolveFieldNameByCandidates(okrFields, ['Action Status', 'Action_Status', 'Status'])
    const statusFieldId = statusFieldName ? resolveFieldId(okrFields.byName.get(statusFieldName)!) : ''
    if (!statusFieldId) {
      throw new Error('OKRPlan 缺少 Action Status 字段')
    }
    const statusValue = selectValue(statusFieldName, status, okrFields.optionMap)
    await okrTable.setRecord(recordId, { fields: { [statusFieldId]: statusValue } })
  }

  const createEvidence = async (params: {
    title: string
    type: string
    link?: string
    actionId?: string
    krId?: string
  }) => {
    const evidenceTable = await getTableByName('Evidence')
    const evidenceFields = buildFieldIndex(await evidenceTable.getFieldMetaList())
    const payload: Record<string, unknown> = {}
    if (evidenceFields.primaryFieldId) {
      payload[evidenceFields.primaryFieldId] = params.title
    }
    payload[resolveFieldId(evidenceFields.byName.get('Evidence_Title')!)] = params.title
    payload[resolveFieldId(evidenceFields.byName.get('Evidence_Type')!)] = selectValue(
      'Evidence_Type',
      params.type,
      evidenceFields.optionMap
    )
    payload[resolveFieldId(evidenceFields.byName.get('Date')!)] = Date.now()
    if (params.link) {
      payload[resolveFieldId(evidenceFields.byName.get('Link')!)] = params.link
    }
    if (params.krId && evidenceFields.byName.get('KeyResult')) {
      payload[resolveFieldId(evidenceFields.byName.get('KeyResult')!)] = [params.krId]
    }
    if (params.actionId) {
      payload[resolveFieldId(evidenceFields.byName.get('Action')!)] = [params.actionId]
    }
    await evidenceTable.addRecord({ fields: payload })
  }

  const loadEvidenceData = async () => {
    if (!isBitable) {
      setEvidenceError('当前为本地预览环境，请在飞书多维表格插件中使用。')
      return
    }
    setEvidenceLoading(true)
    setEvidenceError(null)
    try {
      const evidenceTable = await getTableByName('Evidence')
      const okrTable = await getTableByName('OKRPlan')

      const evidenceFields = buildFieldIndex(await evidenceTable.getFieldMetaList())
      const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())

      const okrRecords = await okrTable.getRecords({ pageSize: 5000 })
      const evidenceRecords = await evidenceTable.getRecords({ pageSize: 5000 })

      const { actionTitleId, krTitleId } = getOkrPlanFieldIds(okrFields)
      const actionMap: Record<string, { title: string; krId?: string; krTitle?: string }> = {}
      const actionOptions: Array<{ value: string; label: string }> = []

      const okrList = asArray<{ recordId: string; fields: Record<string, unknown> }>(okrRecords.records)
      okrList.forEach((record) => {
        const title = actionTitleId ? toText(record.fields[actionTitleId]) : ''
        if (!title) return
        const krTitle = krTitleId ? toText(record.fields[krTitleId]) : undefined
        actionMap[record.recordId] = { title, krId: record.recordId, krTitle }
        actionOptions.push({ value: record.recordId, label: title })
      })

      const typeOptions = evidenceFields.optionMap.get('Evidence_Type')
      const optionList = typeOptions
        ? Array.from(typeOptions.keys()).map((name) => ({ value: name, label: name }))
        : []
      if (optionList.length === 0) {
        optionList.push({ value: 'Note', label: 'Note' })
      }
      setEvidenceTypeOptions(optionList)
      setEvidenceActions(actionOptions)
      setEvidenceActionMeta(actionMap)

      const evidenceTitleId = resolveFieldId(evidenceFields.byName.get('Evidence_Title')!)
      const evidenceTypeId = resolveFieldId(evidenceFields.byName.get('Evidence_Type')!)
      const evidenceDateId = resolveFieldId(evidenceFields.byName.get('Date')!)
      const evidenceKrId = evidenceFields.byName.get('KeyResult')
        ? resolveFieldId(evidenceFields.byName.get('KeyResult')!)
        : ''
      const evidenceActionId = resolveFieldId(evidenceFields.byName.get('Action')!)

      const evidenceList = asArray<{ recordId: string; fields: Record<string, unknown> }>(evidenceRecords.records)
      const list = evidenceList
        .map((record) => {
          const title = toText(record.fields[evidenceTitleId]) || '未命名证据'
          const typeLabel = resolveSelectLabel(record.fields[evidenceTypeId], 'Evidence_Type', evidenceFields.optionIdMap)
          const date = record.fields[evidenceDateId] as number | undefined
          const krLinks = evidenceKrId ? toLinkIds(record.fields[evidenceKrId]) : []
          const actionLinks = toLinkIds(record.fields[evidenceActionId])
          const krTitle = krLinks.length > 0 ? actionMap[krLinks[0]]?.krTitle : undefined
          const actionTitle = actionLinks.length > 0 ? actionMap[actionLinks[0]]?.title : undefined
          return { title, type: typeLabel, date, krTitle, actionTitle }
        })
        .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
        .slice(0, 10)

      setEvidenceList(list)
    } catch (err) {
      console.error(err)
      setEvidenceError(`加载失败：${String(err)}`)
      reportError('Evidence 加载失败', err)
    } finally {
      setEvidenceLoading(false)
    }
  }

  const runSeed = async (ctx: { step: (line: string) => Promise<void> }) => {
    const { step } = ctx
    try {
      const okrTable = await getTableByName('OKRPlan')
      const evidenceTable = await getTableByName('Evidence')
      const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())
      const evidenceFields = buildFieldIndex(await evidenceTable.getFieldMetaList())

      const objectiveFieldId = resolveFieldIdByCandidates(okrFields, ['Objectives', 'Objective_Title', 'Objective'])
      const krFieldId = resolveFieldIdByCandidates(okrFields, ['Key Results', 'KR_Title', 'KR'])
      const actionFieldId = resolveFieldIdByCandidates(okrFields, ['Actions', 'Action_Title', 'Action'])
      const statusFieldName = resolveFieldNameByCandidates(okrFields, ['Action Status', 'Action_Status', 'Status'])
      const statusFieldId = statusFieldName ? resolveFieldId(okrFields.byName.get(statusFieldName)!) : ''
      const minutesId = resolveFieldIdByCandidates(okrFields, ['Action Est Minutes', 'Action_Est_Minutes', 'Est_Minutes'])
      const planStartId = resolveFieldIdByCandidates(okrFields, ['预期开始', 'Action_Plan_Start', 'Plan_Start'])
      const planEndId = resolveFieldIdByCandidates(okrFields, ['预期结束', 'Action_Plan_End', 'Plan_End'])
      const progressId = resolveFieldIdByCandidates(okrFields, ['Action Progress'])
      await step('已读取 OKRPlan 字段')

      const objectiveTitle = 'O1 - 优质UGC搜索价值验证'
      const demoActions = [
        ['完成价值验证对照实验结论', '完成优质UGC价值验证结论', 90, '2026-01-05', '2026-01-05'],
        ['产出漏斗效率分析结论', '完成漏斗效率分析并明确提效空间', 90, '2026-01-12', '2026-01-12'],
        ['验证搜索促供给上限', '验证搜索对优质UGC供给的撬动上限', 90, '2026-01-19', '2026-01-19'],
      ] as const

      const actionIds: string[] = []
      for (const [actionTitle, krTitle, minutes, start, end] of demoActions) {
        const payload: Record<string, unknown> = {}
        if (okrFields.primaryFieldId) {
          payload[okrFields.primaryFieldId] = actionTitle
        }
        if (objectiveFieldId) payload[objectiveFieldId] = objectiveTitle
        if (krFieldId) payload[krFieldId] = krTitle
        if (actionFieldId) payload[actionFieldId] = actionTitle
        if (minutesId) payload[minutesId] = minutes
        if (planStartId) payload[planStartId] = new Date(start).getTime()
        if (planEndId) payload[planEndId] = new Date(end).getTime()
        if (progressId) payload[progressId] = 0
        if (statusFieldId) {
          payload[statusFieldId] = selectValue(statusFieldName, 'Backlog', okrFields.optionMap)
        }
        actionIds.push(await okrTable.addRecord({ fields: payload }))
        await step(`已创建 Action：${actionTitle}`)
      }

      const evidenceTitle = '价值验证实验对照分析'
      const evidencePayload: Record<string, unknown> = {}
      if (evidenceFields.primaryFieldId) {
        evidencePayload[evidenceFields.primaryFieldId] = evidenceTitle
      }
      evidencePayload[resolveFieldId(evidenceFields.byName.get('Evidence_Title')!)] = evidenceTitle
      evidencePayload[resolveFieldId(evidenceFields.byName.get('Evidence_Type')!)] = selectValue(
        'Evidence_Type',
        'Experiment',
        evidenceFields.optionMap
      )
      evidencePayload[resolveFieldId(evidenceFields.byName.get('Date')!)] = Date.now()
      evidencePayload[resolveFieldId(evidenceFields.byName.get('Link')!)] = 'https://example.com'
      if (evidenceFields.byName.get('Action')) {
        evidencePayload[resolveFieldId(evidenceFields.byName.get('Action')!)] = [actionIds[0]]
      }
      if (evidenceFields.byName.get('KeyResult')) {
        evidencePayload[resolveFieldId(evidenceFields.byName.get('KeyResult')!)] = [actionIds[0]]
      }
      await evidenceTable.addRecord({ fields: evidencePayload })
      await step('已创建 Evidence')

      message.success('Demo 数据已生成')
    } catch (err) {
      console.error(err)
      message.error(`生成失败：${String(err)}`)
      reportError('Demo 数据生成失败', err)
    }
  }


  useEffect(() => {
    void loadTodayData()
    void loadEvidenceData()
  }, [])


  const homeContent = (
    <ErrorBoundary name="首页" onError={handleBoundaryError}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {todayError && <Alert type="error" showIcon message={todayError} />}
        <Card title="得分驾驶舱">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space>
              <Button onClick={loadTodayData} loading={todayLoading}>
                刷新得分
              </Button>
            </Space>
            <Space wrap size={24}>
              <Space direction="vertical" align="center">
                <AntProgress
                  type="dashboard"
                  percent={scoreSummary.week}
                  strokeColor={scoreColor(scoreSummary.week)}
                  format={(percent) => `${percent ?? 0}%`}
                />
                <Text strong>本周得分</Text>
              </Space>
              <Space direction="vertical" align="center">
                <AntProgress
                  type="dashboard"
                  percent={scoreSummary.month}
                  strokeColor={scoreColor(scoreSummary.month)}
                  format={(percent) => `${percent ?? 0}%`}
                />
                <Text strong>本月得分</Text>
              </Space>
              <Space direction="vertical" align="center">
                <AntProgress
                  type="dashboard"
                  percent={scoreSummary.quarter}
                  strokeColor={scoreColor(scoreSummary.quarter)}
                  format={(percent) => `${percent ?? 0}%`}
                />
                <Text strong>本季度得分</Text>
              </Space>
            </Space>
            <Divider style={{ margin: 0 }} />
            <Space direction="vertical" size={8}>
              <Text type="secondary">本周扣分原因（按影响程度排序）</Text>
              <List
                dataSource={scoreReasons}
                locale={{ emptyText: '暂无扣分项' }}
                renderItem={(item) => (
                  <List.Item>
                    <Text>{item}</Text>
                  </List.Item>
                )}
              />
            </Space>
          </Space>
        </Card>
        <Card title="今日计划">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {!actionStatusAvailable && (
              <Alert
                type="warning"
                showIcon
                message="OKRPlan 缺少 Action Status 字段，无法更新状态，仅展示计划日期内任务。"
              />
            )}
            <Space wrap>
              <Button onClick={loadTodayData} loading={todayLoading}>
                刷新今日任务
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
                disabled={!selectedBacklogId || !actionStatusAvailable}
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
            <Text type="secondary">默认展示计划已开始且未完成的 Action，可手动补充 Backlog。</Text>
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
                    disabled={!actionStatusAvailable}
                    onClick={() => {
                      setCompleteActionId(item.id)
                      setCompleteActionTitle(item.title)
                      setCompleteActionKrId(item.krId)
                      setCompleteEvidenceTitle('')
                      setCompleteEvidenceLink('')
                      setCompleteFailureReason('')
                      setCompleteEvidenceType(evidenceTypeOptions[0]?.value ?? 'Note')
                      setCompleteModalOpen(true)
                    }}
                  >
                    标记完成
                  </Button>,
                  <Button
                    key="backlog"
                    type="link"
                    disabled={!actionStatusAvailable}
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
                    {(item.planStart || item.planEnd) && (
                      <Tag>
                        计划
                        {item.planStart ? ` ${new Date(item.planStart).toLocaleDateString('zh-CN')}` : ''}
                        {item.planEnd ? ` - ${new Date(item.planEnd).toLocaleDateString('zh-CN')}` : ''}
                      </Tag>
                    )}
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      </Space>
    </ErrorBoundary>
  )

  const diagnosticsContent = (
    <ErrorBoundary name="诊断" onError={handleBoundaryError}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card title="落后于进度的 Action">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Button onClick={loadTodayData} loading={todayLoading}>
              刷新诊断
            </Button>
            <List
              dataSource={laggingActions}
              locale={{ emptyText: '暂无落后项' }}
              renderItem={(item) => (
                <List.Item>
                  <Text>{item}</Text>
                </List.Item>
              )}
            />
          </Space>
        </Card>
      </Space>
    </ErrorBoundary>
  )

  const evidenceContent = (
    <ErrorBoundary name="证据" onError={handleBoundaryError}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {evidenceError && <Alert type="error" showIcon message={evidenceError} />}
        <Card title="新增证据" loading={evidenceLoading}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Select
              placeholder="选择 Action"
              options={evidenceActions}
              value={selectedEvidenceAction}
              onChange={setSelectedEvidenceAction}
            />
            <Input placeholder="证据标题" value={evidenceTitle} onChange={(e) => setEvidenceTitle(e.target.value)} />
            <Select
              placeholder="证据类型"
              options={evidenceTypeOptions}
              value={evidenceType}
              onChange={setEvidenceType}
            />
            <Input placeholder="链接（可选）" value={evidenceLink} onChange={(e) => setEvidenceLink(e.target.value)} />
            <Space>
              <Button onClick={loadEvidenceData} loading={evidenceLoading}>
                刷新
              </Button>
              <Button
                type="primary"
                disabled={!selectedEvidenceAction || !evidenceTitle}
                onClick={async () => {
                  if (!selectedEvidenceAction) return
                  const meta = evidenceActionMeta[selectedEvidenceAction]
                  try {
                    await createEvidence({
                      title: evidenceTitle,
                      type: evidenceType || 'Note',
                      link: evidenceLink || undefined,
                      actionId: selectedEvidenceAction,
                      krId: meta?.krId,
                    })
                    message.success('证据已添加')
                    setEvidenceTitle('')
                    setEvidenceLink('')
                    await loadEvidenceData()
                  } catch (err) {
                    console.error(err)
                    message.error(`操作失败：${String(err)}`)
                  }
                }}
              >
                添加证据
              </Button>
            </Space>
          </Space>
        </Card>
        <Card title="最近证据" loading={evidenceLoading}>
          <List
            dataSource={evidenceList}
            locale={{ emptyText: '暂无证据' }}
            renderItem={(item) => (
              <List.Item>
                <Space direction="vertical">
                  <Text strong>{item.title}</Text>
                  <Space wrap>
                    {item.type && <Tag color="blue">{item.type}</Tag>}
                    {item.krTitle && <Tag>{item.krTitle}</Tag>}
                    {item.actionTitle && <Tag color="gold">{item.actionTitle}</Tag>}
                    {item.date && <Tag>{new Date(item.date).toLocaleDateString('zh-CN')}</Tag>}
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      </Space>
    </ErrorBoundary>
  )

  const moreContent = (
    <ErrorBoundary name="更多" onError={handleBoundaryError}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <OperationRunner
          title="确认生成 Demo 数据"
          description="用于快速生成一套 OKR 演示数据（OKRPlan + Evidence）。"
          buttonLabel="生成 Demo OKR 数据"
          runningLabel="正在生成..."
          disabled={!isBitable}
          totalSteps={4}
          steps={['读取 OKRPlan 字段', '创建 3 条 Actions', '创建 1 条 Evidence']}
          onRun={runSeed}
        />
        <Card title={`诊断日志（${logs.length}）`}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space>
              <Button onClick={copyLogs}>复制日志</Button>
              <Button danger onClick={clearLogs}>
                清空日志
              </Button>
            </Space>
            <List
              dataSource={logs}
              locale={{ emptyText: '暂无日志' }}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical">
                    <Space wrap>
                      <Tag color={item.level === 'error' ? 'red' : item.level === 'warn' ? 'orange' : 'blue'}>
                        {item.level.toUpperCase()}
                      </Tag>
                      <Text>{item.ts}</Text>
                    </Space>
                    <Text>{item.message}</Text>
                    {item.detail && <Text type="secondary">{item.detail}</Text>}
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        </Card>
      </Space>
    </ErrorBoundary>
  )

  const tabs = [
    { key: 'home', label: '首页', children: homeContent },
    { key: 'diagnostics', label: '诊断', children: diagnosticsContent },
    { key: 'evidence', label: '证据', children: evidenceContent },
    { key: 'more', label: '更多', children: moreContent },
  ]

  return (
    <div className="app">
      <div className="app-header">
        <Title level={3}>OKR管理工具箱</Title>
        <Space wrap>
          <Tag>v{APP_VERSION}</Tag>
          <Text type="secondary">Every minute counts!</Text>
        </Space>
        <Text type="secondary">今日拉取 + 证据沉淀</Text>
      </div>
      <Divider />
      <Tabs items={tabs} activeKey={activeTab} onChange={setActiveTab} />
      <Modal
        title="完成 Action 并添加证据"
        open={completeModalOpen}
        onCancel={() => setCompleteModalOpen(false)}
        onOk={async () => {
          if (!completeActionId) return
          if (!completeEvidenceTitle && !completeFailureReason) {
            message.error('请填写证据标题或失败原因')
            return
          }
          try {
            const title = completeEvidenceTitle || `失败原因：${completeFailureReason}`
            const type = completeEvidenceTitle ? completeEvidenceType || 'Note' : 'Note'
            const link = completeEvidenceTitle ? completeEvidenceLink : ''
            await createEvidence({
              title,
              type,
              link: link || undefined,
              actionId: completeActionId,
              krId: completeActionKrId,
            })
            await updateActionStatus(completeActionId, 'Done')
            message.success('已完成并记录证据')
            setCompleteModalOpen(false)
            await loadTodayData()
            await loadEvidenceData()
          } catch (err) {
            console.error(err)
            message.error(`操作失败：${String(err)}`)
          }
        }}
        okText="确认完成"
        cancelText="取消"
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text strong>{completeActionTitle}</Text>
          <Input
            placeholder="证据标题（或留空并填写失败原因）"
            value={completeEvidenceTitle}
            onChange={(e) => setCompleteEvidenceTitle(e.target.value)}
          />
          <Select
            placeholder="证据类型"
            options={evidenceTypeOptions}
            value={completeEvidenceType}
            onChange={setCompleteEvidenceType}
          />
          <Input
            placeholder="证据链接（可选）"
            value={completeEvidenceLink}
            onChange={(e) => setCompleteEvidenceLink(e.target.value)}
          />
          <Input.TextArea
            rows={3}
            placeholder="失败原因（可选）"
            value={completeFailureReason}
            onChange={(e) => setCompleteFailureReason(e.target.value)}
          />
        </Space>
      </Modal>
      <Modal
        title="手动复制日志"
        open={copyModalOpen}
        onCancel={() => setCopyModalOpen(false)}
        onOk={() => setCopyModalOpen(false)}
        okText="关闭"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <Input.TextArea rows={8} value={copyPayload} readOnly />
      </Modal>
    </div>
  )
}

export default App
