import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../contexts/BrandingContext'
import { apiUrl } from '../utils/basePath'
import './login.css'
import Icon from '../components/Icon'
import BrandName from '../components/BrandName'

// LocalAI Bangla sign-in, registration and invite page.
// Centered layout: brand name (no logo badge), Bengali headline and subtitle,
// then one card. Sign-in shows email + password together with the API-token
// login below it. Registration is two steps: email, then the rest.
// What the page offers comes from /api/auth/status: the providers (local,
// GitHub, OIDC), whether anyone has registered yet, and the registration mode.

const EyeIcon = ({ off }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    ) : (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
)

export default function Login() {
  const navigate = useNavigate()
  const { t } = useTranslation('auth')
  const { code: urlInviteCode } = useParams()
  const [searchParams] = useSearchParams()
  const { authEnabled, staticApiKeyRequired, user, loading: authLoading, refresh } = useAuth()
  const branding = useBranding()
  const [providers, setProviders] = useState([])
  const [hasUsers, setHasUsers] = useState(true)
  const [registrationMode, setRegistrationMode] = useState('open')
  const [statusLoading, setStatusLoading] = useState(true)

  const [mode, setMode] = useState('login') // 'login' or 'register'
  const [step, setStep] = useState(1) // registration step (1 = email, 2 = details)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null) // { text } once an account waits for approval
  const [submitting, setSubmitting] = useState(false)
  // The server's rejection of a weak password that may be overridden: the form
  // then shows an acknowledgement, and the next submit sends it.
  const [weakPasswordWarning, setWeakPasswordWarning] = useState('')
  const [acknowledgeWeakPassword, setAcknowledgeWeakPassword] = useState(false)
  const [token, setToken] = useState('')

  const extractError = (data, fallback) => {
    if (!data) return fallback
    if (typeof data.error === 'string') return data.error
    if (data.error && typeof data.error === 'object') return data.error.message || fallback
    if (typeof data.message === 'string') return data.message
    return fallback
  }

  // The invite link fills in the code and opens registration.
  useEffect(() => {
    if (urlInviteCode) {
      setInviteCode(urlInviteCode)
      setMode('register')
    }
  }, [urlInviteCode])

  // An OAuth redirect can come back with an error (invite_required).
  useEffect(() => {
    if (searchParams.get('error') === 'invite_required') setError(t('login.errors.inviteRequired'))
  }, [searchParams, t])

  useEffect(() => {
    fetch(apiUrl('/api/auth/status'))
      .then(r => r.json())
      .then(data => {
        setProviders(data.providers || [])
        setHasUsers(data.hasUsers !== false)
        setRegistrationMode(data.registrationMode || 'open')
        if (!data.hasUsers) setMode('register')
        setStatusLoading(false)
      })
      .catch(() => setStatusLoading(false))
  }, [])

  // Nothing to sign in to, or already signed in: go to the app.
  useEffect(() => {
    if (!authLoading && ((!authEnabled && !staticApiKeyRequired) || user)) {
      navigate('/app', { replace: true })
    }
  }, [authLoading, authEnabled, staticApiKeyRequired, user, navigate])

  const goMode = (next) => {
    setMode(next); setStep(1); setError(''); setPending(null)
    setPassword(''); setConfirmPassword(''); setShowPassword(false)
  }

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    setError('')
    setPending(null)
    setSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(extractError(data, t('login.errors.loginFailed')))
        setSubmitting(false)
        return
      }
      await refresh()
    } catch {
      setError(t('login.errors.networkError'))
      setSubmitting(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setPending(null)
    if (password !== confirmPassword) {
      setError(t('login.errors.passwordsDoNotMatch'))
      return
    }
    setSubmitting(true)
    try {
      const body = { email, password, name }
      if (inviteCode) body.inviteCode = inviteCode
      if (acknowledgeWeakPassword) body.acknowledge_weak_password = true
      const res = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data && data.overridable) {
          setWeakPasswordWarning(extractError(data, ''))
          setError('')
        } else {
          setError(extractError(data, t('login.errors.registrationFailed')))
          setWeakPasswordWarning('')
          setAcknowledgeWeakPassword(false)
        }
        setSubmitting(false)
        return
      }
      setWeakPasswordWarning('')
      if (data.pending) {
        // The account waits for an admin. Say so on the sign-in screen.
        setPending({ text: data.message || '' })
        setMode('login'); setStep(1); setPassword(''); setConfirmPassword('')
        setSubmitting(false)
        return
      }
      // Full reload so the auth provider picks up the new session cookie.
      window.location.href = '/app'
    } catch {
      setError(t('login.errors.networkError'))
      setSubmitting(false)
    }
  }

  const handleTokenLogin = async (e) => {
    e.preventDefault()
    if (!token.trim()) {
      setError(t('login.errors.enterToken'))
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/auth/token-login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(extractError(data, t('login.errors.invalidToken')))
        setSubmitting(false)
        return
      }
      await refresh()
    } catch {
      setError(t('login.errors.networkError'))
      setSubmitting(false)
    }
  }

  if (authLoading || statusLoading) return null

  // Header: brand name (no logo badge), Bengali headline and subtitle.
  const Hero = (
    <header className="lg-hero">
      <div className="lg-brand"><BrandName /></div>
      <h2 className="lg-headline">
        {branding.instanceTagline || t('login.heroTitle', { defaultValue: 'বাংলায় AI LLM MCP সব একসাথে' })}
      </h2>
      <p className="lg-subtitle">
        {t('login.heroSubtitle', { defaultValue: 'বাংলা ভাষায় AI প্রযুক্তির জগতে আপনাকে স্বাগতম!' })}
      </p>
    </header>
  )

  const Alert = error ? <p className="lg-alert" role="alert" data-tone="error">{error}</p> : null

  const TokenFields = (autoFocus) => (
    <>
      <div className="lg-field">
        <label className="lg-label" htmlFor="lg-token">{t('login.apiKeyLabel')}</label>
        <input
          id="lg-token" className="lg-input lg-input--mono" type="password" value={token} autoComplete="off" autoFocus={autoFocus}
          placeholder={t('login.tokenPlaceholder')} onChange={(e) => { setToken(e.target.value); setError('') }}
        />
      </div>
    </>
  )

  // Legacy key-only mode: one field for the key.
  if (staticApiKeyRequired && !authEnabled) {
    return (
      <div className="lg" data-screen="api-key-only">
        {Hero}
        <main className="lg-card">
          <form onSubmit={handleTokenLogin}>
            <h1 className="lg-title">{t('login.tokenTitle')}</h1>
            <p className="lg-lead">{t('login.tokenLead')}</p>
            {Alert}
            {TokenFields(true)}
            <button type="submit" className="lg-btn lg-btn--primary" disabled={submitting}>
              {submitting ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>
        </main>
      </div>
    )
  }

  const hasGitHub = providers.includes('github')
  const hasOIDC = providers.includes('oidc')
  const hasLocal = providers.includes('local')
  const hasOAuth = hasGitHub || hasOIDC
  const showInviteField = (registrationMode === 'invite' || registrationMode === 'approval') && mode === 'register' && hasUsers
  const inviteRequired = registrationMode === 'invite' && hasUsers
  const firstAdmin = !hasUsers
  const joining = !!urlInviteCode

  const githubLoginUrl = inviteCode ? apiUrl(`/api/auth/github/login?invite_code=${encodeURIComponent(inviteCode)}`) : apiUrl('/api/auth/github/login')
  const oidcLoginUrl = inviteCode ? apiUrl(`/api/auth/oidc/login?invite_code=${encodeURIComponent(inviteCode)}`) : apiUrl('/api/auth/oidc/login')

  const title = firstAdmin ? t('login.createAdminTitle')
    : joining ? t('login.joinTitle', { name: branding.instanceName })
    : mode === 'register' ? t('login.registerTitle') : t('login.title')
  const lead = firstAdmin ? t('login.createAdminLead')
    : joining ? t('login.inviteLead')
    : null
  const screen = firstAdmin ? 'first-admin' : joining ? 'invite' : mode === 'register' ? 'register' : 'sign-in'
  const showSteps = hasLocal && mode === 'register'
  const showOAuth = !(mode === 'register' && step === 2)

  const EmailField = (
    <div className="lg-field">
      <label className="lg-label" htmlFor="lg-email">{t('login.email')}</label>
      <input id="lg-email" className="lg-input" type="email" value={email} required autoComplete="username" autoFocus={!hasOAuth}
        placeholder={t('login.emailPlaceholder')} onChange={(e) => { setEmail(e.target.value); setError('') }} />
    </div>
  )

  return (
    <div className="lg" data-screen={screen} data-step={mode === 'register' ? step : undefined}>
      {Hero}
      <main className="lg-card">
        {showSteps && (
          <div className="lg-steps" role="img" aria-label={`Step ${step} of 2`}>
            <span data-on /><span data-on={step === 2 || undefined} />
          </div>
        )}
        <h1 className="lg-title">{title}</h1>
        {lead && <p className="lg-lead">{lead}</p>}

        {pending && (
          <div className="lg-alert" role="status" data-tone="pending" data-testid="login-pending">
            <Icon name="clock" aria-hidden="true" />
            <p><strong>{t('login.pendingTitle')}</strong> {pending.text || t('login.pendingText')}</p>
          </div>
        )}
        {Alert}

        {showOAuth && hasGitHub && (
          <a href={githubLoginUrl} className="lg-btn lg-btn--secondary">
            <Icon name="github" /> {t('login.continueWith', { provider: 'GitHub' })}
          </a>
        )}
        {showOAuth && hasOIDC && (
          <a href={oidcLoginUrl} className="lg-btn lg-btn--secondary">
            <Icon name="log-in" /> {t('login.continueWith', { provider: 'SSO' })}
          </a>
        )}
        {showOAuth && hasOAuth && hasLocal && <div className="lg-divider" role="separator"><span>{t('login.or')}</span></div>}

        {/* Sign in: email and password together. */}
        {hasLocal && mode === 'login' && (
          <form onSubmit={handleEmailLogin}>
            {EmailField}
            <div className="lg-field">
              <label className="lg-label" htmlFor="lg-password">{t('login.password')}</label>
              <div className="lg-input-wrap">
                <input id="lg-password" className="lg-input lg-input--has-action" type={showPassword ? 'text' : 'password'} value={password} required autoComplete="current-password"
                  placeholder={t('login.passwordPlaceholder')} onChange={(e) => { setPassword(e.target.value); setError('') }} />
                <button type="button" className="lg-eye" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </div>
            <button type="submit" className="lg-btn lg-btn--primary" disabled={submitting}>
              {submitting ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>
        )}

        {/* Register, step 1: email. */}
        {hasLocal && mode === 'register' && step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) { setError(''); setStep(2) } }}>
            {EmailField}
            <button type="submit" className="lg-btn lg-btn--primary">{t('login.continue')}</button>
          </form>
        )}

        {/* Register, step 2: the rest. */}
        {hasLocal && mode === 'register' && step === 2 && (
          <form onSubmit={handleRegister}>
            <p className="lg-as">{email} <button type="button" className="lg-link" onClick={() => { setStep(1); setError('') }}>{t('login.changeEmail')}</button></p>
            {showInviteField && (
              <div className="lg-field">
                <label className="lg-label" htmlFor="lg-invite">
                  {t('login.inviteCodeLabel')}{inviteRequired || urlInviteCode ? '' : t('login.inviteCodeOptional')}
                </label>
                <input id="lg-invite" className="lg-input lg-input--mono" type="text" value={inviteCode} required={inviteRequired} readOnly={!!urlInviteCode}
                  placeholder={t('login.inviteCodePlaceholder')} onChange={(e) => { setInviteCode(e.target.value); setError('') }} />
                {urlInviteCode && <p className="lg-hint">{t('login.inviteFilled')}</p>}
              </div>
            )}
            <div className="lg-field">
              <label className="lg-label" htmlFor="lg-name">{t('login.name')}</label>
              <input id="lg-name" className="lg-input" type="text" value={name} autoFocus placeholder={t('login.namePlaceholder')} autoComplete="name" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="lg-field">
              <label className="lg-label" htmlFor="lg-newpw">{t('login.password')}</label>
              <input id="lg-newpw" className="lg-input" type="password" value={password} required autoComplete="new-password" placeholder={t('login.newPasswordPlaceholder')}
                onChange={(e) => { setPassword(e.target.value); setError(''); setWeakPasswordWarning(''); setAcknowledgeWeakPassword(false) }} />
            </div>
            <div className="lg-field">
              <label className="lg-label" htmlFor="lg-confirm">{t('login.confirmPassword')}</label>
              <input id="lg-confirm" className="lg-input" type="password" value={confirmPassword} required autoComplete="new-password" placeholder={t('login.confirmPasswordPlaceholder')}
                onChange={(e) => { setConfirmPassword(e.target.value); setError('') }} />
            </div>
            {weakPasswordWarning && (
              <div className="lg-alert" role="alert" data-tone="warn">
                <p>{weakPasswordWarning}</p>
                <label className="lg-check">
                  <input type="checkbox" checked={acknowledgeWeakPassword} onChange={(e) => setAcknowledgeWeakPassword(e.target.checked)} />
                  {t('login.useAnyway')}
                </label>
              </div>
            )}
            <button type="submit" className="lg-btn lg-btn--primary" disabled={submitting}>
              {submitting ? t('login.creatingAccount') : firstAdmin ? t('login.createAdminAccount') : t('login.register')}
            </button>
            <button type="button" className="lg-btn lg-btn--ghost" onClick={() => { setStep(1); setError('') }}>{t('login.back')}</button>
          </form>
        )}

        {/* Token login, shown with sign-in. */}
        {mode === 'login' && (
          <>
            <div className="lg-divider" role="separator"><span>{t('login.or')}</span></div>
            <form onSubmit={handleTokenLogin} className="lg-token">
              <h2 className="lg-section-title">{t('login.loginWithToken')}</h2>
              {TokenFields(false)}
              <button type="submit" className="lg-btn lg-btn--secondary" disabled={submitting}>
                <Icon name="key" /> {t('login.loginWithToken')}
              </button>
            </form>
          </>
        )}

        {hasLocal && hasUsers && mode === 'login' && !(registrationMode === 'invite' && !urlInviteCode) && (
          <p className="lg-foot">
            {t('login.noAccount')}{' '}
            <button type="button" className="lg-link" onClick={() => goMode('register')}>{t('login.register')}</button>
          </p>
        )}
        {hasLocal && hasUsers && mode === 'register' && step === 1 && (
          <p className="lg-foot">
            {t('login.hasAccount')}{' '}
            <button type="button" className="lg-link" onClick={() => goMode('login')}>{t('login.signIn')}</button>
          </p>
        )}
      </main>
    </div>
  )
}
