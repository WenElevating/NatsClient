import { Component, ErrorInfo, ReactNode } from 'react'
import { Result, Button } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    const { t } = this.props

    if (this.state.hasError) {
      return (
        <div style={{ 
          height: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: '#0f0f1a'
        }}>
          <Result
            status="error"
            title={t('errorBoundary.title')}
            subTitle={this.state.error?.message || t('errorBoundary.subtitle')}
            style={{ background: 'transparent' }}
            extra={[
              <Button key="reset" onClick={this.handleReset}>
                {t('errorBoundary.retry')}
              </Button>,
              <Button key="reload" type="primary" onClick={this.handleReload}>
                {t('errorBoundary.reload')}
              </Button>
            ]}
          />
        </div>
      )
    }

    return this.props.children
  }
}

const ErrorBoundaryWrapper: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  return <ErrorBoundary {...props} t={t} />
}

export default ErrorBoundaryWrapper
