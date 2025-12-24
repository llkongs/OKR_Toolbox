import { Component, type ReactNode } from 'react'
import { Alert, Button, Card, Space, Typography } from 'antd'

const { Text } = Typography

type ErrorBoundaryProps = {
  name: string
  onError?: (context: string, error: Error) => void
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    const { name, onError } = this.props
    if (onError) {
      onError(name, error)
    }
  }

  render() {
    const { hasError, error } = this.state
    if (hasError) {
      return (
        <Card>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert type="error" showIcon message={`模块异常：${this.props.name}`} />
            <Text type="secondary">{error?.message}</Text>
            <Button onClick={() => this.setState({ hasError: false, error: undefined })}>
              重试渲染
            </Button>
          </Space>
        </Card>
      )
    }
    return this.props.children
  }
}
