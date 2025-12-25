import { useEffect, useState } from 'react'
import { bitable } from '@lark-base-open/js-sdk'
import {
  Alert,
  Button,
  Card,
  Divider,
  Input,
  InputNumber,
  List,
  Modal,
  Segmented,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import OperationRunner from './components/OperationRunner'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

const { Title, Text } = Typography
const APP_VERSION = '0.1.6'

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

function isTodayWithinRange(start?: number, end?: number) {
  if (!start && !end) return false
  const today = dayStamp(Date.now())
  const startDay = dayStamp(start ?? end ?? today)
  const endDay = dayStamp(end ?? start ?? today)
  return today >= startDay && today <= endDay
}

function App() {
  const isBitable = Boolean((bitable as unknown as { base?: unknown }).base)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [lastCrash, setLastCrash] = useState<string>(() => {
    try {
      return localStorage.getItem('okr_last_error') ?? ''
    } catch {
      return ''
    }
  })
  const [webhookUrl, setWebhookUrl] = useState(() => {
    try {
      return localStorage.getItem('okr_webhook_url') ?? ''
    } catch {
      return ''
    }
  })
  const [autoSend, setAutoSend] = useState(() => {
    try {
      return localStorage.getItem('okr_webhook_auto') === '1'
    } catch {
      return false
    }
  })
  const [webhookMode, setWebhookMode] = useState<'generic' | 'feishu'>(() => {
    try {
      return (localStorage.getItem('okr_webhook_mode') as 'generic' | 'feishu') || 'generic'
    } catch {
      return 'generic'
    }
  })
  const [activeTab, setActiveTab] = useState('today')
  const [moreTab, setMoreTab] = useState<
    'home' | 'bank' | 'ideas' | 'guardrail' | 'scorecard' | 'demo' | 'debug'
  >('home')
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
      planStart?: number
      planEnd?: number
      krId?: string
      krTitle?: string
    }>
  >([])
  const [backlogOptions, setBacklogOptions] = useState<Array<{ value: string; label: string }>>([])
  const [selectedBacklogId, setSelectedBacklogId] = useState<string>()
  const [actionStatusAvailable, setActionStatusAvailable] = useState(true)
  const [bankLoading, setBankLoading] = useState(false)
  const [bankError, setBankError] = useState<string | null>(null)
  const [bankKrs, setBankKrs] = useState<Array<{ value: string; label: string }>>([])
  const [bankSelectedKr, setBankSelectedKr] = useState<string>('all')
  const [bankActions, setBankActions] = useState<
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
  const [evidenceFocusBlock, setEvidenceFocusBlock] = useState<string>()
  const [focusOptions, setFocusOptions] = useState<Array<{ value: string; label: string }>>([])
  const [completeModalOpen, setCompleteModalOpen] = useState(false)
  const [completeActionId, setCompleteActionId] = useState<string>()
  const [completeActionTitle, setCompleteActionTitle] = useState<string>('')
  const [completeActionKrId, setCompleteActionKrId] = useState<string>()
  const [completeEvidenceTitle, setCompleteEvidenceTitle] = useState('')
  const [completeEvidenceType, setCompleteEvidenceType] = useState<string>('Note')
  const [completeEvidenceLink, setCompleteEvidenceLink] = useState('')
  const [completeFailureReason, setCompleteFailureReason] = useState('')
  const [driftLoading, setDriftLoading] = useState(false)
  const [driftError, setDriftError] = useState<string | null>(null)
  const [driftList, setDriftList] = useState<
    Array<{ id: string; title: string; progress?: number; confidence?: number; daysSinceEvidence: number | null }>
  >([])
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [ideasError, setIdeasError] = useState<string | null>(null)
  const [ideasList, setIdeasList] = useState<
    Array<{ id: string; title: string; minutes?: number; status?: string; krTitle?: string }>
  >([])
  const [ideasKrOptions, setIdeasKrOptions] = useState<Array<{ value: string; label: string }>>([])
  const [okrKrTitleById, setOkrKrTitleById] = useState<Record<string, string>>({})
  const [ideaTitle, setIdeaTitle] = useState('')
  const [ideaMinutes, setIdeaMinutes] = useState<number | null>(null)
  const [ideaNotes, setIdeaNotes] = useState('')
  const [ideaKrId, setIdeaKrId] = useState<string>()
  const [guardrailTitle, setGuardrailTitle] = useState('')
  const [guardrailMinutes, setGuardrailMinutes] = useState<number | null>(null)
  const [guardrailKrId, setGuardrailKrId] = useState<string>()
  const [guardrailModalOpen, setGuardrailModalOpen] = useState(false)
  const [focusLoading, setFocusLoading] = useState(false)
  const [focusError, setFocusError] = useState<string | null>(null)
  const [focusList, setFocusList] = useState<
    Array<{ id: string; title: string; minutes?: number; start?: number; actionTitle?: string }>
  >([])
  const [focusActionId, setFocusActionId] = useState<string>()
  const [focusMinutes, setFocusMinutes] = useState<number | null>(null)
  const [focusGoal, setFocusGoal] = useState('')
  const [scoreLoading, setScoreLoading] = useState(false)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [scoreList, setScoreList] = useState<
    Array<{
      id: string
      weekStart?: number
      weekEnd?: number
      total?: number
      result?: number
      process?: number
      evidence?: number
      drift?: number
      deductions?: string
      actions?: string
    }>
  >([])
  const [scoreWeekStart, setScoreWeekStart] = useState('')
  const [scoreWeekEnd, setScoreWeekEnd] = useState('')
  const [scoreTotal, setScoreTotal] = useState<number | null>(null)
  const [scoreResult, setScoreResult] = useState<number | null>(null)
  const [scoreProcess, setScoreProcess] = useState<number | null>(null)
  const [scoreEvidence, setScoreEvidence] = useState<number | null>(null)
  const [scoreDrift, setScoreDrift] = useState<number | null>(null)
  const [scoreDeductions, setScoreDeductions] = useState('')
  const [scoreActions, setScoreActions] = useState('')
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [copyPayload, setCopyPayload] = useState('')
  const [logEnabled, setLogEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('okr_log_enabled')
      return stored !== '0'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('okr_webhook_url', webhookUrl)
      localStorage.setItem('okr_webhook_auto', autoSend ? '1' : '0')
      localStorage.setItem('okr_webhook_mode', webhookMode)
      localStorage.setItem('okr_log_enabled', logEnabled ? '1' : '0')
    } catch {
      // ignore storage errors
    }
  }, [webhookUrl, autoSend, webhookMode, logEnabled])

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

  useEffect(() => {
    try {
      if (logs.length > 0) {
        localStorage.setItem('okr_logs', JSON.stringify(logs.slice(0, 200)))
      }
    } catch {
      // ignore storage errors
    }
  }, [logs])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('okr_logs')
      if (stored) {
        setLogs(JSON.parse(stored))
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  const sendWebhook = async (entry: LogEntry) => {
    if (!webhookUrl) return
    const payload =
      webhookMode === 'feishu'
        ? {
            msg_type: 'text',
            content: {
              text: `[${entry.level.toUpperCase()}] ${entry.message}\n${entry.detail ?? ''}\n${entry.ts}`,
            },
          }
        : {
            source: 'OKR_Toolbox',
            ...entry,
          }
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  const logEvent = async (level: LogEntry['level'], messageText: string, detail?: string) => {
    if (!logEnabled) return
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ts: new Date().toISOString(),
      level,
      message: messageText,
      detail,
    }
    setLogs((prev) => [entry, ...prev].slice(0, 200))
    if (autoSend && webhookUrl) {
      try {
        await sendWebhook(entry)
      } catch {
        // ignore webhook failures
      }
    }
  }

  const reportError = async (context: string, err: unknown) => {
    const detail = err instanceof Error ? err.stack || err.message : String(err)
    await logEvent('error', context, detail)
  }

  const handleBoundaryError = async (context: string, err: Error) => {
    try {
      localStorage.setItem('okr_last_error', `[${context}] ${err.message}\n${err.stack ?? ''}`)
      setLastCrash(`[${context}] ${err.message}\n${err.stack ?? ''}`)
    } catch {
      // ignore storage errors
    }
    await reportError(`渲染失败：${context}`, err)
  }

  const clearLogs = () => {
    setLogs([])
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

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      void logEvent('error', event.message || '脚本错误', event.error ? String(event.error) : undefined)
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      void logEvent('error', '未处理的 Promise 拒绝', event.reason ? String(event.reason) : undefined)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  const runSeed = async (ctx: { step: (line: string) => Promise<void> }) => {
    const { step } = ctx
    try {
      const okrTable = await getTableByName('OKRPlan')
      const evidenceTable = await getTableByName('Evidence')
      const ideasTable = await getTableByName('Ideas')

      const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())
      const evidenceFields = buildFieldIndex(await evidenceTable.getFieldMetaList())
      const ideasFields = buildFieldIndex(await ideasTable.getFieldMetaList())

      const objectiveTitle = 'O1 - 优质UGC搜索价值验证'
      const objectiveFieldId = resolveFieldIdByCandidates(okrFields, ['Objectives', 'Objective_Title', 'Objective'])
      const krFieldId = resolveFieldIdByCandidates(okrFields, ['Key Results', 'KR_Title', 'KR'])
      const actionFieldId = resolveFieldIdByCandidates(okrFields, ['Actions', 'Action_Title', 'Action'])
      const actionStatusFieldName = resolveFieldNameByCandidates(okrFields, ['Action Status', 'Action_Status', 'Status'])
      const actionStatusId = actionStatusFieldName ? resolveFieldId(okrFields.byName.get(actionStatusFieldName)!) : ''
      const actionMinutesId = resolveFieldIdByCandidates(okrFields, ['Action Est Minutes', 'Action_Est_Minutes', 'Est_Minutes'])
      const cycleFieldId = resolveFieldIdByCandidates(okrFields, ['Cycle'])
      const ownerFieldId = resolveFieldIdByCandidates(okrFields, ['Owner'])
      const krTypeFieldName = okrFields.byName.get('KR_Type') ? 'KR_Type' : ''
      const planStartId = resolveFieldIdByCandidates(okrFields, ['预期开始', 'Action_Plan_Start', 'Plan_Start'])
      const planEndId = resolveFieldIdByCandidates(okrFields, ['预期结束', 'Action_Plan_End', 'Plan_End'])
      const actionProgressId = resolveFieldIdByCandidates(okrFields, ['Action Progress'])
      const actionRiskId = resolveFieldIdByCandidates(okrFields, ['Action Risks'])
      const actionDriftFieldName = okrFields.byName.get('Action Drift Flag') ? 'Action Drift Flag' : ''
      await step('已读取 OKRPlan 字段')

      const krData = [
        { title: '完成优质UGC价值验证结论', type: 'Milestone', progress: 30, confidence: 3 },
        { title: '完成漏斗效率分析并明确提效空间', type: 'Deliverable', progress: 20, confidence: 3 },
        { title: '验证搜索对优质UGC供给的撬动上限', type: 'Milestone', progress: 10, confidence: 2 },
      ]

      const actionData = [
        [0, '补充对照实验统计，产出价值验证结论', 90, '2026-01-05', '2026-01-05'],
        [0, '汇总消费价值结论，沉淀 1 页结论 memo', 60, '2026-01-16', '2026-01-16'],
        [1, '做漏斗分阶段转化对比分析', 90, '2026-01-12', '2026-01-12'],
        [1, '梳理提效空间与算法策略建议', 60, '2026-01-22', '2026-01-22'],
        [2, '验证搜索对供给撬动的边界条件', 90, '2026-01-19', '2026-01-19'],
        [2, '形成冷启动链路方案初稿', 60, '2026-01-29', '2026-01-29'],
      ] as const

      const actionIds: string[] = []
      for (const [krIndex, title, minutes, planStart, planEnd] of actionData) {
        const kr = krData[krIndex]
        const payload: Record<string, unknown> = {}
        if (okrFields.primaryFieldId) {
          payload[okrFields.primaryFieldId] = title
        }
        if (objectiveFieldId) payload[objectiveFieldId] = objectiveTitle
        if (krFieldId) payload[krFieldId] = kr.title
        if (actionFieldId) payload[actionFieldId] = title
        if (actionMinutesId) payload[actionMinutesId] = minutes
        if (actionStatusId) {
          payload[actionStatusId] = selectValue(actionStatusFieldName, 'Backlog', okrFields.optionMap)
        }
        if (cycleFieldId) payload[cycleFieldId] = '2026 Q1'
        if (ownerFieldId) payload[ownerFieldId] = ''
        if (krTypeFieldName) {
          payload[resolveFieldId(okrFields.byName.get(krTypeFieldName)!)] = selectValue(
            krTypeFieldName,
            kr.type,
            okrFields.optionMap
          )
        }
        if (planStartId) payload[planStartId] = new Date(planStart).getTime()
        if (planEndId) payload[planEndId] = new Date(planEnd).getTime()
        if (actionProgressId) payload[actionProgressId] = 0
        if (actionRiskId) payload[actionRiskId] = ''
        if (actionDriftFieldName) {
          payload[resolveFieldId(okrFields.byName.get(actionDriftFieldName)!)] = selectValue(
            actionDriftFieldName,
            'No',
            okrFields.optionMap
          )
        }
        actionIds.push(await okrTable.addRecord({ fields: payload }))
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
        if (evidenceFields.byName.get('KeyResult')) {
          payload[resolveFieldId(evidenceFields.byName.get('KeyResult')!)] = [actionIds[actionIndex]]
        }
        payload[resolveFieldId(evidenceFields.byName.get('Action')!)] = [actionIds[actionIndex]]
        await evidenceTable.addRecord({ fields: payload })
        await step(`已创建 Evidence：${title}`)
      }

      const ideaPayload: Record<string, unknown> = {}
      if (ideasFields.primaryFieldId) {
        ideaPayload[ideasFields.primaryFieldId] = '探索优质UGC冷启动激励机制'
      }
      ideaPayload[resolveFieldId(ideasFields.byName.get('Idea_Title')!)] = '探索优质UGC冷启动激励机制'
      ideaPayload[resolveFieldId(ideasFields.byName.get('Est_Minutes')!)] = 120
      ideaPayload[resolveFieldId(ideasFields.byName.get('Status')!)] = selectValue('Status', 'Parking', ideasFields.optionMap)
      ideaPayload[resolveFieldId(ideasFields.byName.get('Notes')!)] = '等待结论后再评估是否转正'
      ideaPayload[resolveFieldId(ideasFields.byName.get('KeyResults')!)] = [actionIds[4]]
      await ideasTable.addRecord({ fields: ideaPayload })
      await step('已创建 Idea')

      message.success('Demo 数据已生成')
    } catch (err) {
      console.error(err)
      message.error(`生成失败：${String(err)}`)
      await reportError('Demo 数据生成失败', err)
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
      const okrTable = await getTableByName('OKRPlan')
      const evidenceTable = await getTableByName('Evidence')

      const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())
      const evidenceFields = buildFieldIndex(await evidenceTable.getFieldMetaList())

      const okrRecords = await okrTable.getRecords({ pageSize: 5000 })
      const evidenceRecords = await evidenceTable.getRecords({ pageSize: 5000 })

      const { krTitleId, actionTitleId, actionProgressId } = getOkrPlanFieldIds(okrFields)
      const evidenceKrId = resolveFieldId(evidenceFields.byName.get('KeyResult')!)
      const evidenceDateId = resolveFieldId(evidenceFields.byName.get('Date')!)
      const evidenceActionId = resolveFieldId(evidenceFields.byName.get('Action')!)

      const evidenceMap = new Map<string, number>()
      const evidenceList = asArray<{ recordId: string; fields: Record<string, unknown> }>(evidenceRecords.records)
      const okrList = asArray<{ recordId: string; fields: Record<string, unknown> }>(okrRecords.records)

      const okrKrMap = new Map<string, string>()
      const okrActionMap = new Map<string, string>()
      okrList.forEach((record) => {
        const krTitle = krTitleId ? toText(record.fields[krTitleId]) : ''
        const actionTitle = actionTitleId ? toText(record.fields[actionTitleId]) : ''
        if (krTitle) okrKrMap.set(record.recordId, krTitle)
        if (actionTitle) okrActionMap.set(record.recordId, actionTitle)
      })

      evidenceList.forEach((record) => {
        const krLinks = evidenceKrId ? toLinkIds(record.fields[evidenceKrId]) : []
        const actionLinks = evidenceActionId ? toLinkIds(record.fields[evidenceActionId]) : []
        const date = record.fields[evidenceDateId] as number | undefined
        if (!date) return
        const targets = new Set<string>()
        krLinks.forEach((id) => targets.add(id))
        actionLinks.forEach((id) => targets.add(id))
        targets.forEach((id) => {
          const krTitle = okrKrMap.get(id)
          if (!krTitle) return
          const prev = evidenceMap.get(krTitle) ?? 0
          if (date > prev) evidenceMap.set(krTitle, date)
        })
      })

      let unaligned = 0
      okrList.forEach((record) => {
        const actionTitle = actionTitleId ? toText(record.fields[actionTitleId]) : ''
        const krTitle = krTitleId ? toText(record.fields[krTitleId]) : ''
        if (actionTitle && !krTitle) unaligned += 1
      })
      setUnalignedActions(unaligned)

      const now = Date.now()
      const dayMs = 24 * 60 * 60 * 1000
      const krTitles = Array.from(
        new Set(okrList.map((record) => (krTitleId ? toText(record.fields[krTitleId]) : '')).filter(Boolean))
      )
      const krList = krTitles.map((title) => {
        const lastEvidence = evidenceMap.get(title)
        const daysSinceEvidence = lastEvidence ? Math.floor((now - lastEvidence) / dayMs) : null
        let progress: number | undefined
        if (actionProgressId) {
          const values = okrList
            .filter((record) => (krTitleId ? toText(record.fields[krTitleId]) : '') === title)
            .map((record) => record.fields[actionProgressId] as number | undefined)
            .filter((val): val is number => typeof val === 'number')
          if (values.length > 0) {
            progress = Math.round(values.reduce((sum, val) => sum + val, 0) / values.length)
          }
        }
        return { id: title, title, progress, confidence: undefined, due: undefined, daysSinceEvidence }
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
      await reportError('Home 数据加载失败', err)
    } finally {
      setHomeLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'today') {
      void loadTodayData()
      void loadEvidenceData()
      void loadDriftData()
      void loadFocusBlocks()
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
      const okrTable = await getTableByName('OKRPlan')
      const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())
      const okrRecords = await okrTable.getRecords({ pageSize: 5000 })

      const { actionTitleId, statusId, estMinutesId, planStartId, planEndId, krTitleId } = getOkrPlanFieldIds(okrFields)
      const statusFieldName = resolveFieldNameByCandidates(okrFields, ['Action Status', 'Action_Status', 'Status'])
      const statusFieldName = resolveFieldNameByCandidates(okrFields, ['Action Status', 'Action_Status', 'Status'])
      setActionStatusAvailable(Boolean(statusId))
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

      const okrList = asArray<{ recordId: string; fields: Record<string, unknown> }>(okrRecords.records)
      okrList.forEach((record) => {
        const title = actionTitleId ? toText(record.fields[actionTitleId]) : ''
        if (!title) return
        const statusLabel = statusId && statusFieldName
          ? resolveSelectLabel(record.fields[statusId], statusFieldName, okrFields.optionIdMap)
          : ''
        const minutes = estMinutesId ? (record.fields[estMinutesId] as number | undefined) : undefined
        const planStart = planStartId ? (record.fields[planStartId] as number | undefined) : undefined
        const planEnd = planEndId ? (record.fields[planEndId] as number | undefined) : undefined
        const krTitle = krTitleId ? toText(record.fields[krTitleId]) : undefined
        const plannedToday = isTodayWithinRange(planStart, planEnd)

        if (statusLabel === 'Today' || (!statusId && plannedToday)) {
          todayItems.push({ id: record.recordId, title, minutes, planStart, planEnd, krId: record.recordId, krTitle })
        }
        if (statusLabel === 'Backlog' || (!statusId && !plannedToday)) {
          const dateLabel =
            planStart || planEnd
              ? `${planStart ? new Date(planStart).toLocaleDateString('zh-CN') : ''}${
                  planEnd ? ` - ${new Date(planEnd).toLocaleDateString('zh-CN')}` : ''
                }`
              : '未规划'
          const label = plannedToday ? `${title} · 今日计划` : `${title} · ${dateLabel}`
          backlogItems.push({ value: record.recordId, label })
        }
      })

      setTodayList(todayItems)
      setBacklogOptions(backlogItems)
    } catch (err) {
      console.error(err)
      setTodayError(`加载失败：${String(err)}`)
      await reportError('Today 数据加载失败', err)
    } finally {
      setTodayLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab !== 'more') return
    if (moreTab === 'home') {
      void loadHomeData()
    }
    if (moreTab === 'bank') {
      void loadBankData()
    }
    if (moreTab === 'ideas' || moreTab === 'guardrail') {
      void loadIdeasData()
    }
    if (moreTab === 'scorecard') {
      void loadScorecardData()
    }
  }, [activeTab, moreTab])

  const loadBankData = async () => {
    if (!isBitable) {
      setBankError('当前为本地预览环境，请在飞书多维表格插件中使用。')
      return
    }
    setBankLoading(true)
    setBankError(null)
    try {
      const okrTable = await getTableByName('OKRPlan')
      const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())
      const okrRecords = await okrTable.getRecords({ pageSize: 5000 })

      const { actionTitleId, statusId, estMinutesId, planStartId, planEndId, krTitleId } = getOkrPlanFieldIds(okrFields)
      const krOptions: Array<{ value: string; label: string }> = [{ value: 'all', label: '全部 KR' }]
      const okrList = asArray<{ recordId: string; fields: Record<string, unknown> }>(okrRecords.records)
      const krSet = new Set<string>()
      okrList.forEach((record) => {
        const title = krTitleId ? toText(record.fields[krTitleId]) : ''
        if (!title || krSet.has(title)) return
        krSet.add(title)
        krOptions.push({ value: title, label: title })
      })
      setBankKrs(krOptions)

      const items: Array<{
        id: string
        title: string
        minutes?: number
        planStart?: number
        planEnd?: number
        krId?: string
        krTitle?: string
      }> = []

      okrList.forEach((record) => {
        const title = actionTitleId ? toText(record.fields[actionTitleId]) : ''
        if (!title) return
        const statusLabel = statusId && statusFieldName
          ? resolveSelectLabel(record.fields[statusId], statusFieldName, okrFields.optionIdMap)
          : ''
        if (statusId && statusLabel !== 'Backlog') return
        const minutes = estMinutesId ? (record.fields[estMinutesId] as number | undefined) : undefined
        const planStart = planStartId ? (record.fields[planStartId] as number | undefined) : undefined
        const planEnd = planEndId ? (record.fields[planEndId] as number | undefined) : undefined
        const krTitle = krTitleId ? toText(record.fields[krTitleId]) : undefined
        items.push({ id: record.recordId, title, minutes, planStart, planEnd, krTitle })
      })

      setBankActions(items)
    } catch (err) {
      console.error(err)
      setBankError(`加载失败：${String(err)}`)
      await reportError('Action Bank 加载失败', err)
    } finally {
      setBankLoading(false)
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
    focusBlockId?: string
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
    if (params.focusBlockId) {
      payload[resolveFieldId(evidenceFields.byName.get('FocusBlock')!)] = [params.focusBlockId]
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
      const focusTable = await getTableByName('FocusBlocks')

      const evidenceFields = buildFieldIndex(await evidenceTable.getFieldMetaList())
      const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())
      const focusFields = buildFieldIndex(await focusTable.getFieldMetaList())

      const okrRecords = await okrTable.getRecords({ pageSize: 5000 })
      const evidenceRecords = await evidenceTable.getRecords({ pageSize: 5000 })
      const focusRecords = await focusTable.getRecords({ pageSize: 5000 })

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

      const focusTitleId = resolveFieldId(focusFields.byName.get('Block_Title')!)
      const focusStartId = resolveFieldId(focusFields.byName.get('Start_Time')!)
      const focusActionId = resolveFieldId(focusFields.byName.get('Action')!)
      const focusList = asArray<{ recordId: string; fields: Record<string, unknown> }>(focusRecords.records)
      const focusOptions = focusList
        .map((record) => {
          const title = toText(record.fields[focusTitleId]) || '深度时间块'
          const start = record.fields[focusStartId] as number | undefined
          const actionLinks = toLinkIds(record.fields[focusActionId])
          const actionTitle = actionLinks.length > 0 ? actionMap[actionLinks[0]]?.title : undefined
          const dateLabel = start ? new Date(start).toLocaleDateString('zh-CN') : ''
          const label = `${title}${actionTitle ? ` · ${actionTitle}` : ''}${dateLabel ? ` · ${dateLabel}` : ''}`
          return { id: record.recordId, label }
        })
        .sort((a, b) => (a.label < b.label ? 1 : -1))
        .slice(0, 30)

      setFocusOptions(focusOptions.map((item) => ({ value: item.id, label: item.label })))

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
      await reportError('Evidence 加载失败', err)
    } finally {
      setEvidenceLoading(false)
    }
  }

  const loadDriftData = async () => {
    if (!isBitable) {
      setDriftError('当前为本地预览环境，请在飞书多维表格插件中使用。')
      return
    }
    setDriftLoading(true)
    setDriftError(null)
    try {
      const okrTable = await getTableByName('OKRPlan')
      const evidenceTable = await getTableByName('Evidence')

      const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())
      const evidenceFields = buildFieldIndex(await evidenceTable.getFieldMetaList())

      const okrRecords = await okrTable.getRecords({ pageSize: 5000 })
      const evidenceRecords = await evidenceTable.getRecords({ pageSize: 5000 })

      const { krTitleId } = getOkrPlanFieldIds(okrFields)
      const evidenceKrId = evidenceFields.byName.get('KeyResult')
        ? resolveFieldId(evidenceFields.byName.get('KeyResult')!)
        : ''
      const evidenceActionId = resolveFieldId(evidenceFields.byName.get('Action')!)
      const evidenceDateId = resolveFieldId(evidenceFields.byName.get('Date')!)

      const evidenceMap = new Map<string, number>()
      const evidenceList = asArray<{ recordId: string; fields: Record<string, unknown> }>(evidenceRecords.records)
      const okrList = asArray<{ recordId: string; fields: Record<string, unknown> }>(okrRecords.records)

      const okrKrMap = new Map<string, string>()
      okrList.forEach((record) => {
        const krTitle = krTitleId ? toText(record.fields[krTitleId]) : ''
        if (krTitle) okrKrMap.set(record.recordId, krTitle)
      })

      evidenceList.forEach((record) => {
        const krLinks = evidenceKrId ? toLinkIds(record.fields[evidenceKrId]) : []
        const actionLinks = toLinkIds(record.fields[evidenceActionId])
        const date = record.fields[evidenceDateId] as number | undefined
        if (!date) return
        const targets = new Set<string>()
        krLinks.forEach((id) => targets.add(id))
        actionLinks.forEach((id) => targets.add(id))
        targets.forEach((id) => {
          const krTitle = okrKrMap.get(id)
          if (!krTitle) return
          const prev = evidenceMap.get(krTitle) ?? 0
          if (date > prev) evidenceMap.set(krTitle, date)
        })
      })

      let unaligned = 0
      okrList.forEach((record) => {
        const actionTitle = toText(record.fields[resolveFieldIdByCandidates(okrFields, ['Actions', 'Action_Title', 'Action'])])
        const krTitle = krTitleId ? toText(record.fields[krTitleId]) : ''
        if (actionTitle && !krTitle) unaligned += 1
      })
      setUnalignedActions(unaligned)

      const now = Date.now()
      const dayMs = 24 * 60 * 60 * 1000
      const actionProgressId = resolveFieldIdByCandidates(okrFields, ['Action Progress'])
      const krTitles = Array.from(
        new Set(okrList.map((record) => (krTitleId ? toText(record.fields[krTitleId]) : '')).filter(Boolean))
      )
      const krList = krTitles.map((title) => {
        const lastEvidence = evidenceMap.get(title)
        const daysSinceEvidence = lastEvidence ? Math.floor((now - lastEvidence) / dayMs) : null
        let progress: number | undefined
        if (actionProgressId) {
          const values = okrList
            .filter((record) => (krTitleId ? toText(record.fields[krTitleId]) : '') === title)
            .map((record) => record.fields[actionProgressId] as number | undefined)
            .filter((val): val is number => typeof val === 'number')
          if (values.length > 0) {
            progress = Math.round(values.reduce((sum, val) => sum + val, 0) / values.length)
          }
        }
        return { id: title, title, progress, confidence: undefined, daysSinceEvidence }
      })

      const driftItems = krList
        .filter((kr) => kr.daysSinceEvidence === null || kr.daysSinceEvidence >= 2)
        .sort((a, b) => {
          const aScore = a.daysSinceEvidence === null ? Number.POSITIVE_INFINITY : a.daysSinceEvidence
          const bScore = b.daysSinceEvidence === null ? Number.POSITIVE_INFINITY : b.daysSinceEvidence
          if (aScore !== bScore) return bScore - aScore
          return 0
        })
      setDriftList(driftItems)
      setDriftKrsCount(driftItems.length)
    } catch (err) {
      console.error(err)
      setDriftError(`加载失败：${String(err)}`)
      await reportError('Drift 加载失败', err)
    } finally {
      setDriftLoading(false)
    }
  }

  const loadFocusBlocks = async () => {
    if (!isBitable) {
      setFocusError('当前为本地预览环境，请在飞书多维表格插件中使用。')
      return
    }
    setFocusLoading(true)
    setFocusError(null)
    try {
      const focusTable = await getTableByName('FocusBlocks')
      const okrTable = await getTableByName('OKRPlan')

      const focusFields = buildFieldIndex(await focusTable.getFieldMetaList())
      const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())

      const focusRecords = await focusTable.getRecords({ pageSize: 5000 })
      const okrRecords = await okrTable.getRecords({ pageSize: 5000 })

      const { actionTitleId } = getOkrPlanFieldIds(okrFields)
      const actionMap = new Map<string, string>()
      const okrList = asArray<{ recordId: string; fields: Record<string, unknown> }>(okrRecords.records)
      okrList.forEach((record) => {
        const title = actionTitleId ? toText(record.fields[actionTitleId]) : ''
        if (title) {
          actionMap.set(record.recordId, title)
        }
      })

      const focusTitleId = resolveFieldId(focusFields.byName.get('Block_Title')!)
      const focusStartId = resolveFieldId(focusFields.byName.get('Start_Time')!)
      const focusMinutesId = resolveFieldId(focusFields.byName.get('Minutes')!)
      const focusActionId = resolveFieldId(focusFields.byName.get('Action')!)

      const focusList = asArray<{ recordId: string; fields: Record<string, unknown> }>(focusRecords.records)
      const items = focusList
        .map((record) => {
          const title = toText(record.fields[focusTitleId]) || '深度时间块'
          const start = record.fields[focusStartId] as number | undefined
          const minutes = record.fields[focusMinutesId] as number | undefined
          const actionLinks = toLinkIds(record.fields[focusActionId])
          const actionTitle = actionLinks.length > 0 ? actionMap.get(actionLinks[0]) : undefined
          return { id: record.recordId, title, start, minutes, actionTitle }
        })
        .sort((a, b) => (b.start ?? 0) - (a.start ?? 0))
        .slice(0, 20)

      setFocusList(items)
      setFocusOptions(
        items.map((item) => ({
          value: item.id,
          label: `${item.title}${item.actionTitle ? ` · ${item.actionTitle}` : ''}`,
        }))
      )
    } catch (err) {
      console.error(err)
      setFocusError(`加载失败：${String(err)}`)
      await reportError('FocusBlocks 加载失败', err)
    } finally {
      setFocusLoading(false)
    }
  }

  const loadIdeasData = async () => {
    if (!isBitable) {
      setIdeasError('当前为本地预览环境，请在飞书多维表格插件中使用。')
      return
    }
    setIdeasLoading(true)
    setIdeasError(null)
    try {
      const ideasTable = await getTableByName('Ideas')
      const okrTable = await getTableByName('OKRPlan')
      const ideasFields = buildFieldIndex(await ideasTable.getFieldMetaList())
      const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())

      const ideasRecords = await ideasTable.getRecords({ pageSize: 5000 })
      const okrRecords = await okrTable.getRecords({ pageSize: 5000 })

      const { krTitleId } = getOkrPlanFieldIds(okrFields)
      const okrOptions: Array<{ value: string; label: string }> = []
      const krIdToTitle: Record<string, string> = {}
      const okrList = asArray<{ recordId: string; fields: Record<string, unknown> }>(okrRecords.records)
      okrList.forEach((record) => {
        const krTitle = krTitleId ? toText(record.fields[krTitleId]) : ''
        if (!krTitle) return
        if (krIdToTitle[record.recordId]) return
        krIdToTitle[record.recordId] = krTitle
        okrOptions.push({ value: record.recordId, label: krTitle })
      })
      setIdeasKrOptions(okrOptions)
      setOkrKrTitleById(krIdToTitle)

      const titleId = resolveFieldId(ideasFields.byName.get('Idea_Title')!)
      const minutesId = resolveFieldId(ideasFields.byName.get('Est_Minutes')!)
      const statusId = resolveFieldId(ideasFields.byName.get('Status')!)
      const krIdField = resolveFieldId(ideasFields.byName.get('KeyResults')!)

      const ideasList = asArray<{ recordId: string; fields: Record<string, unknown> }>(ideasRecords.records)
      const list = ideasList.map((record) => {
        const title = toText(record.fields[titleId]) || '未命名想法'
        const minutes = record.fields[minutesId] as number | undefined
        const status = resolveSelectLabel(record.fields[statusId], 'Status', ideasFields.optionIdMap)
        const krLinks = toLinkIds(record.fields[krIdField])
        const krTitle = krLinks.length > 0 ? krIdToTitle[krLinks[0]] : undefined
        return { id: record.recordId, title, minutes, status, krTitle }
      })

      setIdeasList(list)
    } catch (err) {
      console.error(err)
      setIdeasError(`加载失败：${String(err)}`)
      await reportError('Parking 加载失败', err)
    } finally {
      setIdeasLoading(false)
    }
  }

  const loadScorecardData = async () => {
    if (!isBitable) {
      setScoreError('当前为本地预览环境，请在飞书多维表格插件中使用。')
      return
    }
    setScoreLoading(true)
    setScoreError(null)
    try {
      const scoreTable = await getTableByName('Scorecard')
      const scoreFields = buildFieldIndex(await scoreTable.getFieldMetaList())
      const scoreRecords = await scoreTable.getRecords({ pageSize: 5000 })

      const weekStartId = resolveFieldId(scoreFields.byName.get('Week_Start')!)
      const weekEndId = resolveFieldId(scoreFields.byName.get('Week_End')!)
      const totalId = resolveFieldId(scoreFields.byName.get('Total_Score')!)
      const resultId = resolveFieldId(scoreFields.byName.get('Result_Score')!)
      const processId = resolveFieldId(scoreFields.byName.get('Process_Score')!)
      const evidenceId = resolveFieldId(scoreFields.byName.get('Evidence_Score')!)
      const driftId = resolveFieldId(scoreFields.byName.get('Drift_Penalty')!)
      const deductionsId = resolveFieldId(scoreFields.byName.get('Top_Deductions')!)
      const actionsId = resolveFieldId(scoreFields.byName.get('Recommended_Actions')!)

      const scoreList = asArray<{ recordId: string; fields: Record<string, unknown> }>(scoreRecords.records)
      const items = scoreList
        .map((record) => ({
          id: record.recordId,
          weekStart: record.fields[weekStartId] as number | undefined,
          weekEnd: record.fields[weekEndId] as number | undefined,
          total: record.fields[totalId] as number | undefined,
          result: record.fields[resultId] as number | undefined,
          process: record.fields[processId] as number | undefined,
          evidence: record.fields[evidenceId] as number | undefined,
          drift: record.fields[driftId] as number | undefined,
          deductions: toText(record.fields[deductionsId]),
          actions: toText(record.fields[actionsId]),
        }))
        .sort((a, b) => (b.weekStart ?? 0) - (a.weekStart ?? 0))
        .slice(0, 20)

      setScoreList(items)
    } catch (err) {
      console.error(err)
      setScoreError(`加载失败：${String(err)}`)
      await reportError('Scorecard 加载失败', err)
    } finally {
      setScoreLoading(false)
    }
  }

  const homeContent = (
    <ErrorBoundary name="Home 总览" onError={handleBoundaryError}>
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
              <Button type="primary" onClick={() => setActiveTab('today')}>
                今日纠偏
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
    </ErrorBoundary>
  )

  const bankContent = (
    <ErrorBoundary name="Action Bank" onError={handleBoundaryError}>
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
            dataSource={bankActions.filter((item) => bankSelectedKr === 'all' || item.krTitle === bankSelectedKr)}
            locale={{ emptyText: '暂无 Backlog 动作' }}
            renderItem={(item) => (
              <List.Item
                actions={[
                    <Button
                      key="pull"
                      type="link"
                      disabled={!actionStatusAvailable}
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

  const ideasContent = (
    <ErrorBoundary name="Parking Lot" onError={handleBoundaryError}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {ideasError && <Alert type="error" showIcon message={ideasError} />}
        <Card title="新增想法" loading={ideasLoading}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Input
              placeholder="想法标题"
              value={ideaTitle}
              onChange={(e) => setIdeaTitle(e.target.value)}
            />
            <InputNumber
              placeholder="预计耗时（分钟）"
              min={1}
              value={ideaMinutes ?? undefined}
              onChange={(value) => setIdeaMinutes(typeof value === 'number' ? value : null)}
            />
            <Select
              placeholder="关联 KR（可选）"
              allowClear
              options={ideasKrOptions}
              value={ideaKrId}
              onChange={(value) => setIdeaKrId(value)}
            />
            <Input.TextArea
              rows={3}
              placeholder="备注"
              value={ideaNotes}
              onChange={(e) => setIdeaNotes(e.target.value)}
            />
            <Space>
              <Button onClick={loadIdeasData} loading={ideasLoading}>
                刷新
              </Button>
              <Button
                type="primary"
                disabled={!ideaTitle || !ideaMinutes}
                onClick={async () => {
                  try {
                    const ideasTable = await getTableByName('Ideas')
                    const ideasFields = buildFieldIndex(await ideasTable.getFieldMetaList())
                    const payload: Record<string, unknown> = {}
                    if (ideasFields.primaryFieldId) {
                      payload[ideasFields.primaryFieldId] = ideaTitle
                    }
                    payload[resolveFieldId(ideasFields.byName.get('Idea_Title')!)] = ideaTitle
                    payload[resolveFieldId(ideasFields.byName.get('Est_Minutes')!)] = ideaMinutes ?? 0
                    payload[resolveFieldId(ideasFields.byName.get('Status')!)] = selectValue(
                      'Status',
                      'Parking',
                      ideasFields.optionMap
                    )
                    payload[resolveFieldId(ideasFields.byName.get('Notes')!)] = ideaNotes
                    if (ideaKrId) {
                      payload[resolveFieldId(ideasFields.byName.get('KeyResults')!)] = [ideaKrId]
                    }
                    await ideasTable.addRecord({ fields: payload })
                    message.success('想法已加入 Parking')
                    setIdeaTitle('')
                    setIdeaMinutes(null)
                    setIdeaNotes('')
                    setIdeaKrId(undefined)
                    await loadIdeasData()
                  } catch (err) {
                    console.error(err)
                    message.error(`操作失败：${String(err)}`)
                  }
                }}
              >
                加入 Parking
              </Button>
            </Space>
          </Space>
        </Card>
        <Card title={`Parking 列表（${ideasList.length}）`} loading={ideasLoading}>
          <List
            dataSource={ideasList}
            locale={{ emptyText: '暂无想法' }}
            renderItem={(item) => (
              <List.Item>
                <Space direction="vertical">
                  <Text strong>{item.title}</Text>
                  <Space wrap>
                    {item.status && <Tag>{item.status}</Tag>}
                    {item.minutes && <Tag>预计 {item.minutes} 分钟</Tag>}
                    {item.krTitle && <Tag color="blue">{item.krTitle}</Tag>}
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      </Space>
    </ErrorBoundary>
  )

  const guardrailContent = (
    <ErrorBoundary name="Guardrail" onError={handleBoundaryError}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card title="新建 Action（护栏）">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {!actionStatusAvailable && (
              <Alert type="warning" showIcon message="OKRPlan 缺少 Action Status 字段，无法创建带状态的 Action。" />
            )}
            <Input
              placeholder="Action 标题"
              value={guardrailTitle}
              onChange={(e) => setGuardrailTitle(e.target.value)}
            />
            <InputNumber
              placeholder="预计耗时（分钟）"
              min={1}
              value={guardrailMinutes ?? undefined}
              onChange={(value) => setGuardrailMinutes(typeof value === 'number' ? value : null)}
            />
            <Select
              placeholder="关联 KR（可选）"
              allowClear
              options={ideasKrOptions}
              value={guardrailKrId}
              onChange={(value) => setGuardrailKrId(value)}
            />
            <Space>
              <Button onClick={loadIdeasData} loading={ideasLoading}>
                刷新 KR
              </Button>
              <Button
                type="primary"
                disabled={!guardrailTitle || !guardrailMinutes}
                onClick={async () => {
                  if (!guardrailMinutes || !guardrailTitle) return
                  if (guardrailMinutes > 30 && !guardrailKrId) {
                    setGuardrailModalOpen(true)
                    return
                  }
                  try {
                    const okrTable = await getTableByName('OKRPlan')
                    const okrFields = buildFieldIndex(await okrTable.getFieldMetaList())
                    const actionTitleId = resolveFieldIdByCandidates(okrFields, ['Actions', 'Action_Title', 'Action'])
                    const estMinutesId = resolveFieldIdByCandidates(okrFields, ['Action Est Minutes', 'Action_Est_Minutes', 'Est_Minutes'])
                    const statusFieldName = resolveFieldNameByCandidates(okrFields, ['Action Status', 'Action_Status', 'Status'])
                    const statusId = statusFieldName ? resolveFieldId(okrFields.byName.get(statusFieldName)!) : ''
                    const krTitleId = resolveFieldIdByCandidates(okrFields, ['Key Results', 'KR_Title', 'KR'])
                    if (!actionTitleId) {
                      throw new Error('OKRPlan 缺少 Actions 字段')
                    }
                    if (!statusId) {
                      throw new Error('OKRPlan 缺少 Action Status 字段')
                    }
                    const payload: Record<string, unknown> = {}
                    if (okrFields.primaryFieldId) {
                      payload[okrFields.primaryFieldId] = guardrailTitle
                    }
                    payload[actionTitleId] = guardrailTitle
                    if (estMinutesId) payload[estMinutesId] = guardrailMinutes
                    payload[statusId] = selectValue(statusFieldName, 'Backlog', okrFields.optionMap)
                    if (guardrailKrId && krTitleId) {
                      payload[krTitleId] = okrKrTitleById[guardrailKrId] || ''
                    }
                    await okrTable.addRecord({ fields: payload })
                    message.success('Action 已创建')
                    setGuardrailTitle('')
                    setGuardrailMinutes(null)
                    setGuardrailKrId(undefined)
                  } catch (err) {
                    console.error(err)
                    message.error(`操作失败：${String(err)}`)
                  }
                }}
              >
                创建 Action
              </Button>
            </Space>
          </Space>
        </Card>
        <Alert
          type="info"
          showIcon
          message="规则：预计耗时 > 30 分钟且未关联 KR 的任务，需要先进入 Parking Lot。"
        />
      </Space>
    </ErrorBoundary>
  )

  const scorecardContent = (
    <ErrorBoundary name="Scorecard" onError={handleBoundaryError}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {scoreError && <Alert type="error" showIcon message={scoreError} />}
        <Card title="新增周评分" loading={scoreLoading}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap>
              <Input
                type="date"
                placeholder="周开始"
                value={scoreWeekStart}
                onChange={(e) => setScoreWeekStart(e.target.value)}
              />
              <Input
                type="date"
                placeholder="周结束"
                value={scoreWeekEnd}
                onChange={(e) => setScoreWeekEnd(e.target.value)}
              />
            </Space>
            <Space wrap>
              <InputNumber
                placeholder="总分"
                min={0}
                max={100}
                value={scoreTotal ?? undefined}
                onChange={(value) => setScoreTotal(typeof value === 'number' ? value : null)}
              />
              <InputNumber
                placeholder="结果分"
                min={0}
                max={100}
                value={scoreResult ?? undefined}
                onChange={(value) => setScoreResult(typeof value === 'number' ? value : null)}
              />
              <InputNumber
                placeholder="过程分"
                min={0}
                max={100}
                value={scoreProcess ?? undefined}
                onChange={(value) => setScoreProcess(typeof value === 'number' ? value : null)}
              />
              <InputNumber
                placeholder="证据分"
                min={0}
                max={100}
                value={scoreEvidence ?? undefined}
                onChange={(value) => setScoreEvidence(typeof value === 'number' ? value : null)}
              />
              <InputNumber
                placeholder="偏航扣分"
                min={0}
                max={100}
                value={scoreDrift ?? undefined}
                onChange={(value) => setScoreDrift(typeof value === 'number' ? value : null)}
              />
            </Space>
            <Input.TextArea
              rows={3}
              placeholder="扣分原因"
              value={scoreDeductions}
              onChange={(e) => setScoreDeductions(e.target.value)}
            />
            <Input.TextArea
              rows={3}
              placeholder="纠偏动作"
              value={scoreActions}
              onChange={(e) => setScoreActions(e.target.value)}
            />
            <Space>
              <Button onClick={loadScorecardData} loading={scoreLoading}>
                刷新
              </Button>
              <Button
                type="primary"
                disabled={!scoreWeekStart || !scoreWeekEnd}
                onClick={async () => {
                  const start = scoreWeekStart ? new Date(scoreWeekStart).getTime() : NaN
                  const end = scoreWeekEnd ? new Date(scoreWeekEnd).getTime() : NaN
                  if (Number.isNaN(start) || Number.isNaN(end)) {
                    message.error('请填写正确的日期')
                    return
                  }
                  try {
                    const scoreTable = await getTableByName('Scorecard')
                    const scoreFields = buildFieldIndex(await scoreTable.getFieldMetaList())
                    const payload: Record<string, unknown> = {}
                    if (scoreFields.primaryFieldId) {
                      payload[scoreFields.primaryFieldId] = `Week ${scoreWeekStart}`
                    }
                    payload[resolveFieldId(scoreFields.byName.get('Week_Start')!)] = start
                    payload[resolveFieldId(scoreFields.byName.get('Week_End')!)] = end
                    if (scoreTotal !== null) {
                      payload[resolveFieldId(scoreFields.byName.get('Total_Score')!)] = scoreTotal
                    }
                    if (scoreResult !== null) {
                      payload[resolveFieldId(scoreFields.byName.get('Result_Score')!)] = scoreResult
                    }
                    if (scoreProcess !== null) {
                      payload[resolveFieldId(scoreFields.byName.get('Process_Score')!)] = scoreProcess
                    }
                    if (scoreEvidence !== null) {
                      payload[resolveFieldId(scoreFields.byName.get('Evidence_Score')!)] = scoreEvidence
                    }
                    if (scoreDrift !== null) {
                      payload[resolveFieldId(scoreFields.byName.get('Drift_Penalty')!)] = scoreDrift
                    }
                    payload[resolveFieldId(scoreFields.byName.get('Top_Deductions')!)] = scoreDeductions
                    payload[resolveFieldId(scoreFields.byName.get('Recommended_Actions')!)] = scoreActions
                    await scoreTable.addRecord({ fields: payload })
                    message.success('评分已保存')
                    setScoreTotal(null)
                    setScoreResult(null)
                    setScoreProcess(null)
                    setScoreEvidence(null)
                    setScoreDrift(null)
                    setScoreDeductions('')
                    setScoreActions('')
                    await loadScorecardData()
                  } catch (err) {
                    console.error(err)
                    message.error(`操作失败：${String(err)}`)
                  }
                }}
              >
                保存评分
              </Button>
            </Space>
          </Space>
        </Card>
        <Card title="最近周评分" loading={scoreLoading}>
          <List
            dataSource={scoreList}
            locale={{ emptyText: '暂无评分' }}
            renderItem={(item) => {
              const start = item.weekStart ? new Date(item.weekStart).toLocaleDateString('zh-CN') : ''
              const end = item.weekEnd ? new Date(item.weekEnd).toLocaleDateString('zh-CN') : ''
              return (
                <List.Item>
                  <Space direction="vertical">
                    <Text strong>{start && end ? `${start} - ${end}` : '未命名周'}</Text>
                    <Space wrap>
                      {item.total !== undefined && <Tag color="green">总分 {item.total}</Tag>}
                      {item.result !== undefined && <Tag color="blue">结果 {item.result}</Tag>}
                      {item.process !== undefined && <Tag color="gold">过程 {item.process}</Tag>}
                      {item.evidence !== undefined && <Tag color="cyan">证据 {item.evidence}</Tag>}
                      {item.drift !== undefined && <Tag color="red">偏航扣分 {item.drift}</Tag>}
                    </Space>
                    {item.deductions && <Text type="secondary">扣分：{item.deductions}</Text>}
                    {item.actions && <Text type="secondary">纠偏：{item.actions}</Text>}
                  </Space>
                </List.Item>
              )
            }}
          />
        </Card>
      </Space>
    </ErrorBoundary>
  )

  const demoContent = (
    <ErrorBoundary
      name="Demo 数据"
      onError={handleBoundaryError}
    >
      <OperationRunner
        title="确认生成 Demo 数据"
        description="用于快速生成一套 OKR 演示数据（OKRPlan + Evidence + Ideas）。"
        buttonLabel="生成 Demo OKR 数据"
        runningLabel="正在生成..."
        disabled={!isBitable}
        totalSteps={5}
        steps={[
          '读取 OKRPlan 字段',
          '创建 6 条 Actions',
          '创建 2 条 Evidence',
          '创建 Idea',
        ]}
        onRun={runSeed}
      />
    </ErrorBoundary>
  )

  const debugContent = (
    <ErrorBoundary name="诊断日志" onError={handleBoundaryError}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card title="调试设置">
          <Space direction="vertical" size={8}>
            <Space>
              <Text>调试模式</Text>
              <Switch checked={logEnabled} onChange={setLogEnabled} />
            </Space>
            <Text type="secondary">关闭后将不再记录日志</Text>
          </Space>
        </Card>
        <Card title="Webhook 设置">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Input
              placeholder="Webhook URL"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value.trim())}
            />
            <Space wrap>
              <Select
                value={webhookMode}
                onChange={(value) => setWebhookMode(value)}
                options={[
                  { value: 'generic', label: '通用 JSON' },
                  { value: 'feishu', label: '飞书机器人' },
                ]}
                style={{ minWidth: 160 }}
              />
              <Space>
                <Text>自动发送</Text>
                <Switch checked={autoSend} onChange={setAutoSend} />
              </Space>
            </Space>
            <Space>
              <Button
                onClick={async () => {
                  const entry: LogEntry = {
                    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    ts: new Date().toISOString(),
                    level: 'info',
                    message: 'Webhook 测试',
                    detail: '来自 OKR管理工具箱',
                  }
                  setLogs((prev) => [entry, ...prev].slice(0, 200))
                  if (!webhookUrl) {
                    message.warning('请先填写 Webhook URL')
                    return
                  }
                  try {
                    await sendWebhook(entry)
                    message.success('Webhook 已发送')
                  } catch (err) {
                    console.error(err)
                    message.error(`发送失败：${String(err)}`)
                  }
                }}
              >
                发送测试
              </Button>
              <Button onClick={copyLogs}>复制日志</Button>
              <Button danger onClick={clearLogs}>
                清空日志
              </Button>
            </Space>
          </Space>
        </Card>
        <Card title={`运行日志（${logs.length}）`}>
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
        </Card>
        {lastCrash && (
          <Card title="上次崩溃记录">
            <Space direction="vertical" size={8}>
              <Text type="secondary">{lastCrash}</Text>
              <Button
                onClick={() => {
                  setLastCrash('')
                  try {
                    localStorage.removeItem('okr_last_error')
                  } catch {
                    // ignore
                  }
                }}
              >
                清除崩溃记录
              </Button>
            </Space>
          </Card>
        )}
      </Space>
    </ErrorBoundary>
  )

  const tabs = [
    {
      key: 'today',
      label: 'Today',
      children: (
        <ErrorBoundary name="Today" onError={handleBoundaryError}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {todayError && <Alert type="error" showIcon message={todayError} />}
            {evidenceError && <Alert type="error" showIcon message={evidenceError} />}
            {driftError && <Alert type="error" showIcon message={driftError} />}
            {focusError && <Alert type="error" showIcon message={focusError} />}
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
                  <Button
                    onClick={async () => {
                      await loadTodayData()
                      await loadEvidenceData()
                      await loadDriftData()
                      await loadFocusBlocks()
                    }}
                    loading={todayLoading || evidenceLoading || driftLoading || focusLoading}
                  >
                    刷新全部
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
                <Text type="secondary">优先拉取计划日期落在今天的 Action。</Text>
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
          <Card title="记录深度时间块" loading={focusLoading}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Select
                placeholder="选择 Today Action"
                options={todayList.map((item) => ({ value: item.id, label: item.title }))}
                value={focusActionId}
                onChange={setFocusActionId}
              />
              <InputNumber
                placeholder="预计时长（分钟）"
                min={10}
                value={focusMinutes ?? undefined}
                onChange={(value) => setFocusMinutes(typeof value === 'number' ? value : null)}
              />
              <Input.TextArea
                rows={2}
                placeholder="本块目标产出"
                value={focusGoal}
                onChange={(e) => setFocusGoal(e.target.value)}
              />
              <Space>
                <Button
                  type="primary"
                  disabled={!focusActionId || !focusMinutes}
                  onClick={async () => {
                    if (!focusActionId || !focusMinutes) return
                    try {
                      const focusTable = await getTableByName('FocusBlocks')
                      const focusFields = buildFieldIndex(await focusTable.getFieldMetaList())
                      const actionMeta = todayList.find((item) => item.id === focusActionId)
                      const actionTitle = actionMeta?.title ?? '深度时间块'
                      const now = Date.now()
                      const payload: Record<string, unknown> = {}
                      if (focusFields.primaryFieldId) {
                        payload[focusFields.primaryFieldId] = `${actionTitle} 深度块`
                      }
                      payload[resolveFieldId(focusFields.byName.get('Block_Title')!)] =
                        focusGoal || `${actionTitle} 深度块`
                      payload[resolveFieldId(focusFields.byName.get('Start_Time')!)] = now
                      payload[resolveFieldId(focusFields.byName.get('End_Time')!)] =
                        now + focusMinutes * 60 * 1000
                      payload[resolveFieldId(focusFields.byName.get('Minutes')!)] = focusMinutes
                      payload[resolveFieldId(focusFields.byName.get('Goal')!)] = focusGoal
                      payload[resolveFieldId(focusFields.byName.get('Action')!)] = [focusActionId]
                      if (focusFields.byName.get('KR')) {
                        payload[resolveFieldId(focusFields.byName.get('KR')!)] = [focusActionId]
                      }
                      if (actionMeta?.krId) {
                        payload[resolveFieldId(focusFields.byName.get('KR')!)] = [actionMeta.krId]
                      }
                      await focusTable.addRecord({ fields: payload })
                      message.success('深度时间块已记录')
                      setFocusActionId(undefined)
                      setFocusMinutes(null)
                      setFocusGoal('')
                      await loadFocusBlocks()
                    } catch (err) {
                      console.error(err)
                      message.error(`操作失败：${String(err)}`)
                    }
                  }}
                >
                  记录 Focus Block
                </Button>
                <Button onClick={loadFocusBlocks} loading={focusLoading}>
                  刷新
                </Button>
              </Space>
            </Space>
          </Card>
          <Card title="最近 Focus Blocks" loading={focusLoading}>
            <List
              dataSource={focusList}
              locale={{ emptyText: '暂无记录' }}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical">
                    <Text strong>{item.title}</Text>
                    <Space wrap>
                      {item.actionTitle && <Tag color="blue">{item.actionTitle}</Tag>}
                      {item.minutes && <Tag>{item.minutes} 分钟</Tag>}
                      {item.start && <Tag>{new Date(item.start).toLocaleString('zh-CN')}</Tag>}
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
          <Card title="新增证据" loading={evidenceLoading}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Select
                placeholder="选择 Action"
                options={evidenceActions}
                value={selectedEvidenceAction}
                onChange={setSelectedEvidenceAction}
              />
              <Select
                placeholder="关联 Focus Block（可选）"
                options={focusOptions}
                allowClear
                value={evidenceFocusBlock}
                onChange={setEvidenceFocusBlock}
              />
              <Input
                placeholder="证据标题"
                value={evidenceTitle}
                onChange={(e) => setEvidenceTitle(e.target.value)}
              />
                <Select
                  placeholder="证据类型"
                  options={evidenceTypeOptions}
                  value={evidenceType}
                  onChange={setEvidenceType}
                />
                <Input
                  placeholder="链接（可选）"
                  value={evidenceLink}
                  onChange={(e) => setEvidenceLink(e.target.value)}
                />
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
                        focusBlockId: evidenceFocusBlock,
                      })
                      message.success('证据已添加')
                      setEvidenceTitle('')
                      setEvidenceLink('')
                      setEvidenceFocusBlock(undefined)
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
            <Card>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space wrap>
                  <Tag color={driftKrsCount > 0 ? 'red' : 'green'}>偏航 KR：{driftKrsCount}</Tag>
                  <Tag color={unalignedActions > 0 ? 'orange' : 'green'}>未关联 Action：{unalignedActions}</Tag>
                </Space>
                <Space wrap>
                  <Button onClick={loadDriftData} loading={driftLoading}>
                    刷新
                  </Button>
                </Space>
              </Space>
            </Card>
            <Card title="偏航 KR 列表" loading={driftLoading}>
              <List
                dataSource={driftList}
                locale={{ emptyText: '暂无偏航 KR' }}
                renderItem={(item) => {
                  const evidenceText =
                    item.daysSinceEvidence === null ? '无证据' : `${item.daysSinceEvidence} 天`
                  return (
                    <List.Item>
                      <Space direction="vertical">
                        <Text strong>{item.title}</Text>
                        <Space wrap>
                          <Tag color="blue">进度：{item.progress ?? 0}%</Tag>
                          <Tag color="gold">信心：{item.confidence ?? '-'}</Tag>
                          <Tag>距上次证据：{evidenceText}</Tag>
                        </Space>
                      </Space>
                    </List.Item>
                  )
                }}
              />
            </Card>
            <Card title="纠偏 Playbook">
              <List
                dataSource={[
                  '选择 1 个 KR 的本周交付',
                  '拉取 1 个 30 分钟最小动作',
                  '产出 1 个证据（哪怕是 1 页 memo）',
                ]}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
          </Space>
        </ErrorBoundary>
      ),
    },
    {
      key: 'more',
      label: '更多',
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Segmented
            options={[
              { label: '总览', value: 'home' },
              { label: 'Action Bank', value: 'bank' },
              { label: 'Parking', value: 'ideas' },
              { label: 'Guardrail', value: 'guardrail' },
              { label: 'Scorecard', value: 'scorecard' },
              { label: 'Demo 数据', value: 'demo' },
              { label: '诊断日志', value: 'debug' },
            ]}
            value={moreTab}
            onChange={(value) =>
              setMoreTab(value as 'home' | 'bank' | 'ideas' | 'guardrail' | 'scorecard' | 'demo' | 'debug')
            }
          />
          {moreTab === 'home' && homeContent}
          {moreTab === 'bank' && bankContent}
          {moreTab === 'ideas' && ideasContent}
          {moreTab === 'guardrail' && guardrailContent}
          {moreTab === 'scorecard' && scorecardContent}
          {moreTab === 'demo' && demoContent}
          {moreTab === 'debug' && debugContent}
        </Space>
      ),
    },
  ]

  return (
    <div className="app">
      <div className="app-header">
        <Title level={3}>OKR管理工具箱</Title>
        <Space wrap>
          <Tag>v{APP_VERSION}</Tag>
          <Text type="secondary">Every minute counts!</Text>
        </Space>
        <Text type="secondary">MVP 闭环：OKR → Action → Evidence → Drift → 纠偏</Text>
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
        title="护栏提示"
        open={guardrailModalOpen}
        onCancel={() => setGuardrailModalOpen(false)}
        onOk={async () => {
          try {
            const ideasTable = await getTableByName('Ideas')
            const ideasFields = buildFieldIndex(await ideasTable.getFieldMetaList())
            const payload: Record<string, unknown> = {}
            if (ideasFields.primaryFieldId) {
              payload[ideasFields.primaryFieldId] = guardrailTitle
            }
            payload[resolveFieldId(ideasFields.byName.get('Idea_Title')!)] = guardrailTitle
            payload[resolveFieldId(ideasFields.byName.get('Est_Minutes')!)] = guardrailMinutes ?? 0
            payload[resolveFieldId(ideasFields.byName.get('Status')!)] = selectValue(
              'Status',
              'Parking',
              ideasFields.optionMap
            )
            if (guardrailKrId) {
              payload[resolveFieldId(ideasFields.byName.get('KeyResults')!)] = [guardrailKrId]
            }
            await ideasTable.addRecord({ fields: payload })
            message.success('已放入 Parking Lot')
            setGuardrailModalOpen(false)
            setGuardrailTitle('')
            setGuardrailMinutes(null)
            setGuardrailKrId(undefined)
            await loadIdeasData()
          } catch (err) {
            console.error(err)
            message.error(`操作失败：${String(err)}`)
          }
        }}
        okText="放入 Parking"
        cancelText="取消"
      >
        <Text>
          预计耗时超过 30 分钟且未关联 KR。是否将该任务放入 Parking Lot？
        </Text>
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
