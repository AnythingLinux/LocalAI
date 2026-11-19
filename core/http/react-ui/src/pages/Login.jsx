import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../contexts/BrandingContext'
import { apiUrl } from '../utils/basePath'
import './login.css'
import Icon from '../components/Icon'
import BrandName from '../components/BrandName'

export default function Login() {
  const navigate = useNavigate()
  const { t } = useTranslation('auth')
  const { code: urlInviteCode } = useParams()
  const [searchParams] = useSearchParams()
  const { authEnabled, staticApiKeyRequired, user, loading: authLoading, refresh } = useAuth()
  const branding = useBranding()

  const [logoFailed, setLogoFailed] = useState(false)

  const [providers, setProviders] = useState([])
  const [hasUsers, setHasUsers] = useState(true)
  const [registrationMode, setRegistrationMode] = useState('open')
  const [statusLoading, setStatusLoading] = useState(true)

  const [mode, setMode] = useState('login')
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [weakPasswordWarning, setWeakPasswordWarning] = useState('')
  const [acknowledgeWeakPassword, setAcknowledgeWeakPassword] = useState(false)
  const [token, setToken] = useState('')

  useEffect(() => {
    setLogoFailed(false)
  }, [branding.logoUrl])

  const extractError = (data, fallback) => {
    if (!data) return fallback
    if (typeof data.error === 'string') return data.error
    if (data.error && typeof data.error === 'object') return data.error.message || fallback
    if (typeof data.message === 'string') return data.message
    return fallback
  }

  useEffect(() => {
    if (urlInviteCode) {
      setInviteCode(urlInviteCode)
      setMode('register')
    }
  }, [urlInviteCode])

  useEffect(() => {
    if (searchParams.get('error') === 'invite_required') {
      setError(t('login.errors.inviteRequired'))
    }
  }, [searchParams, t])

  useEffect(() => {
    let active = true
    fetch(apiUrl('/api/auth/status'))
      .then((response) => {
        if (!response.ok) throw new Error(`Auth status request failed: ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (!active) return
        setProviders(Array.isArray(data.providers) ? data.providers : [])
        setHasUsers(data.hasUsers !== false)
        setRegistrationMode(data.registrationMode || 'open')
        if (!data.hasUsers) setMode('register')
        setStatusLoading(false)
      })
      .catch(() => {
        if (active) setStatusLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!authLoading && ((!authEnabled && !staticApiKeyRequired) || user)) {
      navigate('/app', { replace: true })
    }
  }, [authLoading, authEnabled, staticApiKeyRequired, user, navigate])

  const goMode = (nextMode) => {
    setMode(nextMode)
    setStep(1)
    setError('')
    setPending(null)
    setPassword('')
    setConfirmPassword('')
    setWeakPasswordWarning('')
    setAcknowledgeWeakPassword(false)
  }

  const handleEmailLogin = async (event) => {
    event.preventDefault()
    setError('')
    setPending(null)
    setSubmitting(true)
    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(extractError(data, t('login.errors.loginFailed')))
        return
      }
      await refresh()
    } catch {
      setError(t('login.errors.networkError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    setError('')
    setPending(null)
    if (password !== confirmPassword) {
      setError(t('login.errors.passwordsDoNotMatch'))
      return
    }
    setSubmitting(true)
    try {
      const body = { email: email.trim(), password, name }
      if (inviteCode) body.inviteCode = inviteCode
      if (acknowledgeWeakPassword) body.acknowledge_weak_password = true
      const response = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (data && data.overridable) {
          setWeakPasswordWarning(extractError(data, ''))
          setError('')
        } else {
          setError(extractError(data, t('login.errors.registrationFailed')))
          setWeakPasswordWarning('')
          setAcknowledgeWeakPassword(false)
        }
        return
      }
      setWeakPasswordWarning('')
      if (data.pending) {
        setPending({ text: data.message || '' })
        setMode('login')
        setStep(1)
        setPassword('')
        setConfirmPassword('')
        return
      }
      window.location.href = '/app'
    } catch {
      setError(t('login.errors.networkError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleTokenLogin = async (event) => {
    event.preventDefault()
    if (!token.trim()) {
      setError(t('login.errors.enterToken'))
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const response = await fetch(apiUrl('/api/auth/token-login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(extractError(data, t('login.errors.invalidToken')))
        return
      }
      await refresh()
    } catch {
      setError(t('login.errors.networkError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || statusLoading) return null

  const hasGitHub = providers.includes('github')
  const hasOIDC = providers.includes('oidc')
  const hasLocal = providers.includes('local')
  const hasOAuth = hasGitHub || hasOIDC
  const showInviteField = (registrationMode === 'invite' || registrationMode === 'approval') && mode === 'register' && hasUsers
  const inviteRequired = registrationMode === 'invite' && hasUsers
  const firstAdmin = !hasUsers
  const joining = Boolean(urlInviteCode)

  const githubLoginUrl = inviteCode
    ? apiUrl(`/api/auth/github/login?invite_code=${encodeURIComponent(inviteCode)}`)
    : apiUrl('/api/auth/github/login')
  const oidcLoginUrl = inviteCode
    ? apiUrl(`/api/auth/oidc/login?invite_code=${encodeURIComponent(inviteCode)}`)
    : apiUrl('/api/auth/oidc/login')

  const title = firstAdmin
    ? t('login.createAdminTitle')
    : joining
      ? t('login.joinTitle', { name: branding.instanceName })
      : mode === 'register'
        ? t('login.registerTitle')
        : t('login.title')

  const screen = firstAdmin ? 'first-admin' : joining ? 'invite' : mode === 'register' ? 'register' : 'sign-in'
  const Alert = error ? <p className="lg-alert" role="alert" data-tone="error">{error}</p> : null

  return (
    <div className="lg" data-screen={screen} data-step={hasLocal ? step : undefined}>
      <main className="lg-main">
        <header className="lg-hero">
          <div className="lg-hero__brand" aria-label={branding.instanceName || 'LocalAI'}>
            {branding.logoUrl && !logoFailed ? (
              <img
                src={apiUrl(branding.logoUrl)}
                alt=""
                className="lg-hero__logo"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="lg-hero__mark" aria-hidden="true">AI</span>
            )}
            <span className="lg-hero__brand-name">
              <BrandName />
            </span>
          </div>
          <h1 className="lg-hero__title">বাংলায় AI LLM MCP সব একসাথে</h1>
          <p className="lg-hero__subtitle">বাংলা ভাষায় AI প্রযুক্তির জগতে আপনাকে স্বাগতম!</p>
        </header>

        <section className="lg-card">
          {hasLocal && mode === 'register' && (
            <div className="lg-steps" role="img" aria-label={`Step ${step} of 2`}>
              <span data-on />
              <span data-on={step === 2 || undefined} />
            </div>
          )}

          <h2 className="lg-title">{title}</h2>

          {pending && (
            <div className="lg-alert" role="status" data-tone="pending" data-testid="login-pending">
              <Icon name="clock" aria-hidden="true" />
              <p><strong>{t('login.pendingTitle')}</strong> {pending.text || t('login.pendingText')}</p>
            </div>
          )}
          {Alert}

          {mode === 'login' && (
            <>
              {hasOAuth && (
                <div className="lg-oauth">
                  {hasGitHub && (
                    <a href={githubLoginUrl} className="dk-btn dk-btn--secondary dk-btn--lg lg-full">
                      <Icon name="github" /> {t('login.continueWith', { provider: 'GitHub' })}
                    </a>
                  )}
                  {hasOIDC && (
                    <a href={oidcLoginUrl} className="dk-btn dk-btn--secondary dk-btn--lg lg-full">
                      <Icon name="log-in" /> {t('login.continueWith', { provider: 'SSO' })}
                    </a>
                  )}
                </div>
              )}

              <form onSubmit={handleEmailLogin} className="lg-login-form">
                <div className="dk-field">
                  <label className="dk-label" htmlFor="lg-email">{t('login.email')}</label>
                  <input
                    id="lg-email"
                    className="dk-input"
                    type="email"
                    value={email}
                    required
                    autoComplete="username"
                    autoFocus={!hasOAuth}
                    placeholder={t('login.emailPlaceholder')}
                    onChange={(event) => { setEmail(event.target.value); setError('') }}
                  />
                </div>

                <div className="dk-field">
                  <label className="dk-label" htmlFor="lg-password">{t('login.password')}</label>
                  <div className="lg-password-wrap">
                    <input
                      id="lg-password"
                      className="dk-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      required
                      autoComplete="current-password"
                      placeholder={t('login.passwordPlaceholder')}
                      onChange={(event) => { setPassword(event.target.value); setError('') }}
                    />
                    <button
                      type="button"
                      className="lg-password-toggle"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      <Icon name={showPassword ? 'eye-off' : 'eye'} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <button type="submit" className="dk-btn dk-btn--primary dk-btn--lg lg-full" disabled={submitting || !hasLocal}>
                  {submitting ? t('login.signingIn') : t('login.signIn')}
                </button>
                {!hasLocal && (
                  <p className="lg-hint">Email/password authentication is not enabled by the server. Use API Key login below.</p>
                )}
              </form>

              <div className="lg-divider" role="separator"><span>{t('login.or')}</span></div>

              <section className="lg-token" aria-labelledby="lg-token-heading">
                <h3 id="lg-token-heading" className="lg-token__title">{t('login.loginWithToken')}</h3>
                <form onSubmit={handleTokenLogin} className="lg-token__form">
                  <div className="dk-field">
                    <label className="dk-label" htmlFor="lg-token">{t('login.apiKeyLabel')}</label>
                    <input
                      id="lg-token"
                      className="dk-input dk-input--mono"
                      type="password"
                      value={token}
                      autoComplete="off"
                      placeholder={t('login.tokenAltPlaceholder')}
                      onChange={(event) => { setToken(event.target.value); setError('') }}
                    />
                  </div>
                  <button type="submit" className="dk-btn dk-btn--secondary dk-btn--lg lg-full" disabled={submitting}>
                    <Icon name="key" /> {submitting ? t('login.signingIn') : t('login.loginWithToken')}
                  </button>
                </form>
              </section>

              {hasLocal && hasUsers && !(registrationMode === 'invite' && !urlInviteCode) && (
                <p className="lg-foot">
                  {t('login.noAccount')}{' '}
                  <button type="button" className="lg-link" onClick={() => goMode('register')}>{t('login.register')}</button>
                </p>
              )}
            </>
          )}

          {mode === 'register' && hasLocal && (
            <>
              {step === 1 && (
                <form onSubmit={(event) => { event.preventDefault(); if (email.trim()) { setError(''); setStep(2) } }}>
                  <div className="dk-field">
                    <label className="dk-label" htmlFor="lg-register-email">{t('login.email')}</label>
                    <input
                      id="lg-register-email"
                      className="dk-input"
                      type="email"
                      value={email}
                      required
                      autoComplete="username"
                      placeholder={t('login.emailPlaceholder')}
                      onChange={(event) => { setEmail(event.target.value); setError('') }}
                    />
                  </div>
                  <button type="submit" className="dk-btn dk-btn--primary dk-btn--lg lg-full">{t('login.continue')}</button>
                </form>
              )}

              {step === 2 && (
                <form onSubmit={handleRegister}>
                  <p className="lg-as">
                    {email}{' '}
                    <button type="button" className="lg-link" onClick={() => { setStep(1); setError('') }}>{t('login.changeEmail')}</button>
                  </p>

                  {showInviteField && (
                    <div className="dk-field">
                      <label className="dk-label" htmlFor="lg-invite">
                        {t('login.inviteCodeLabel')}{inviteRequired || urlInviteCode ? '' : t('login.inviteCodeOptional')}
                      </label>
                      <input
                        id="lg-invite"
                        className="dk-input dk-input--mono"
                        type="text"
                        value={inviteCode}
                        required={inviteRequired}
                        readOnly={Boolean(urlInviteCode)}
                        placeholder={t('login.inviteCodePlaceholder')}
                        onChange={(event) => { setInviteCode(event.target.value); setError('') }}
                      />
                      {urlInviteCode && <p className="dk-hint">{t('login.inviteFilled')}</p>}
                    </div>
                  )}

                  <div className="dk-field">
                    <label className="dk-label" htmlFor="lg-name">{t('login.name')}</label>
                    <input
                      id="lg-name"
                      className="dk-input"
                      type="text"
                      value={name}
                      autoFocus
                      placeholder={t('login.namePlaceholder')}
                      autoComplete="name"
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>

                  <div className="dk-field">
                    <label className="dk-label" htmlFor="lg-newpw">{t('login.password')}</label>
                    <input
                      id="lg-newpw"
                      className="dk-input"
                      type="password"
                      value={password}
                      required
                      autoComplete="new-password"
                      placeholder={t('login.newPasswordPlaceholder')}
                      onChange={(event) => {
                        setPassword(event.target.value)
                        setError('')
                        setWeakPasswordWarning('')
                        setAcknowledgeWeakPassword(false)
                      }}
                    />
                  </div>

                  <div className="dk-field">
                    <label className="dk-label" htmlFor="lg-confirm">{t('login.confirmPassword')}</label>
                    <input
                      id="lg-confirm"
                      className="dk-input"
                      type="password"
                      value={confirmPassword}
                      required
                      autoComplete="new-password"
                      placeholder={t('login.confirmPasswordPlaceholder')}
                      onChange={(event) => { setConfirmPassword(event.target.value); setError('') }}
                    />
                  </div>

                  {weakPasswordWarning && (
                    <div className="lg-alert" role="alert" data-tone="warn">
                      <p>{weakPasswordWarning}</p>
                      <label className="dk-choice">
                        <input
                          type="checkbox"
                          className="dk-check"
                          checked={acknowledgeWeakPassword}
                          onChange={(event) => setAcknowledgeWeakPassword(event.target.checked)}
                        />
                        {t('login.useAnyway')}
                      </label>
                    </div>
                  )}

                  <button type="submit" className="dk-btn dk-btn--primary dk-btn--lg lg-full" disabled={submitting}>
                    {submitting ? t('login.creatingAccount') : firstAdmin ? t('login.createAdminAccount') : t('login.register')}
                  </button>
                  <button type="button" className="dk-btn dk-btn--ghost lg-full" onClick={() => { setStep(1); setError('') }}>
                    {t('login.back')}
                  </button>
                </form>
              )}

              {hasUsers && (
                <p className="lg-foot">
                  {t('login.hasAccount')}{' '}
                  <button type="button" className="lg-link" onClick={() => goMode('login')}>{t('login.signIn')}</button>
                </p>
              )}
            </>
          )}

          {mode === 'register' && !hasLocal && (
            <p className="lg-hint">Account registration is not enabled by the server.</p>
          )}
        </section>
      </main>
    </div>
  )
}
