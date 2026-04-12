import { useState, FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail]   = useState('')
  const [pass,  setPass]    = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoad]  = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(''); setLoad(true)
    try {
      await login(email, pass)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Errore di login')
    } finally {
      setLoad(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg2)', border: '1px solid var(--bd1)',
    borderRadius: 4, padding: '9px 12px', color: 'var(--t0)',
    fontFamily: 'var(--mono)', fontSize: 12, outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg0)' }}>
      <div style={{ width: 360, background: 'var(--bg1)', border: '1px solid var(--bd1)', borderRadius: 8, padding: 32 }}>

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, color: 'var(--cyan)', marginBottom: 8 }}>⬡</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--cyan)', letterSpacing: '.08em' }}>THREATFLOW</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, fontFamily: 'var(--mono)' }}>IOC Management Platform</div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 5 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={inp} placeholder="analyst@org.com" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 5 }}>Password</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} required
              style={inp} placeholder="••••••••" />
          </div>

          {error && (
            <div style={{ background: 'var(--redx)', border: '1px solid rgba(255,51,85,.3)', borderRadius: 4, padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            background: 'var(--cyan)', color: '#000', border: 'none', borderRadius: 4,
            padding: '10px', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '.04em',
            opacity: loading ? .7 : 1, marginTop: 4,
          }}>
            {loading ? 'ACCESSO...' : 'ACCEDI'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
          Primo accesso? Il primo utente registrato diventa admin.
        </p>
      </div>
    </div>
  )
}
