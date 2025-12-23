import { useState } from 'react'
import { Alert, Button, Card, List, Modal, Progress, Space, Typography } from 'antd'

const { Text } = Typography

type OperationContext = {
  step: (line: string) => Promise<void>
  reset: () => void
}

type OperationRunnerProps = {
  title: string
  description?: string
  steps: string[]
  totalSteps?: number
  disabled?: boolean
  runningLabel?: string
  buttonLabel: string
  onRun: (ctx: OperationContext) => Promise<void>
}

export default function OperationRunner({
  title,
  description,
  steps,
  totalSteps,
  disabled,
  runningLabel,
  buttonLabel,
  onRun,
}: OperationRunnerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const [progress, setProgress] = useState(0)

  const appendLog = (line: string) => {
    setLogLines((prev) => [...prev, line])
  }

  const reset = () => {
    setLogLines([])
    setProgress(0)
  }

  const step = async (line: string) => {
    const divisor = Math.max(totalSteps ?? steps.length, 1)
    setProgress((prev) => {
      const next = Math.min(100, prev + Math.round(100 / divisor))
      return next
    })
    appendLog(line)
    await new Promise((resolve) => setTimeout(resolve, 80))
  }

  const handleRun = async () => {
    setConfirmOpen(false)
    setRunning(true)
    reset()
    try {
      await onRun({ step, reset })
    } finally {
      setRunning(false)
      setProgress(100)
    }
  }

  return (
    <Card>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Text>{description}</Text>
        <Button type="primary" loading={running} onClick={() => setConfirmOpen(true)} disabled={disabled}>
          {running && runningLabel ? runningLabel : buttonLabel}
        </Button>
        <Progress percent={progress} status={running ? 'active' : progress === 100 ? 'success' : 'normal'} />
        <Card size="small" title="执行日志">
          <List
            size="small"
            dataSource={logLines}
            locale={{ emptyText: '暂无日志' }}
            renderItem={(item) => <List.Item>{item}</List.Item>}
          />
        </Card>
      </Space>
      <Modal
        title={title}
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onOk={handleRun}
        okText="确认执行"
        cancelText="取消"
        confirmLoading={running}
      >
        <Text>将执行以下操作：</Text>
        <List size="small" dataSource={steps} renderItem={(item) => <List.Item>{item}</List.Item>} />
        {disabled && (
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            showIcon
            message="当前环境不可执行，请在飞书多维表格插件中操作。"
          />
        )}
      </Modal>
    </Card>
  )
}
