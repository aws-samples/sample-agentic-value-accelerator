import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

type View = 'signIn' | 'newPassword' | 'forgotPassword' | 'confirmReset';

export default function SignIn() {
  const { signIn, completeNewPassword, forgotPassword, confirmForgotPassword } = useAuth();
  const [view, setView] = useState<View>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn(email, password);
      if (result.needsNewPassword) setView('newPassword');
    } catch (err: any) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await completeNewPassword(newPwd);
    } catch (err: any) {
      setError(err.message || 'Failed to set new password');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setMessage('Verification code sent to your email.');
      setView('confirmReset');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmForgotPassword(email, code, newPwd);
      setMessage('Password reset successful. Please sign in.');
      setView('signIn');
      setPassword('');
      setNewPwd('');
      setCode('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white";
  const btnClass = "w-full py-3 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm hover:shadow-md disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen flex items-center justify-center relative px-4 overflow-hidden">
      {/* Soft animated gradient ombre background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      {/* Animated wave layers */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
        <svg className="w-full" viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ height: '180px', animation: 'waveFloat 8s ease-in-out infinite' }}>
          <path fill="rgba(59,130,246,0.06)" d="M0,192L48,186.7C96,181,192,171,288,186.7C384,203,480,245,576,250.7C672,256,768,224,864,208C960,192,1056,192,1152,197.3C1248,203,1344,213,1392,218.7L1440,224L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
        </svg>
      </div>
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
        <svg className="w-full" viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ height: '140px', animation: 'waveFloat 6s ease-in-out infinite reverse' }}>
          <path fill="rgba(99,102,241,0.05)" d="M0,256L48,240C96,224,192,192,288,181.3C384,171,480,181,576,197.3C672,213,768,235,864,229.3C960,224,1056,192,1152,181.3C1248,171,1344,181,1392,186.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
        </svg>
      </div>
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
        <svg className="w-full" viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ height: '100px', animation: 'waveFloat 10s ease-in-out infinite' }}>
          <path fill="rgba(139,92,246,0.04)" d="M0,288L48,272C96,256,192,224,288,218.7C384,213,480,235,576,245.3C672,256,768,256,864,240C960,224,1056,192,1152,186.7C1248,181,1344,203,1392,213.3L1440,224L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
        </svg>
      </div>
      <style>{`
        @keyframes waveFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-10 relative z-10" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)' }}>
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-blue-600 mx-auto mb-4" style={{ boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back</h1>
          <p className="text-sm text-slate-500">Sign in to Agentic Value Accelerator</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>{message}</span>
          </div>
        )}

        {view === 'signIn' && (
          <form onSubmit={handleSignIn} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputClass}
                placeholder="Enter your password"
                required
              />
            </div>
            <button type="submit" disabled={loading} className={btnClass}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <button type="button" onClick={() => { setError(''); setMessage(''); setView('forgotPassword'); }} className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors mt-3">
              Forgot password?
            </button>
          </form>
        )}

        {view === 'newPassword' && (
          <form onSubmit={handleNewPassword} className="space-y-5">
            <p className="text-sm text-slate-600 bg-blue-50 p-4 rounded-xl border border-blue-100">You must set a new password to continue.</p>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
              <input
                type="password"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                className={inputClass}
                placeholder="Enter new password"
                required
              />
            </div>
            <button type="submit" disabled={loading} className={btnClass}>
              {loading ? 'Setting password...' : 'Set Password'}
            </button>
          </form>
        )}

        {view === 'forgotPassword' && (
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <p className="text-sm text-slate-600 bg-blue-50 p-4 rounded-xl border border-blue-100">Enter your email to receive a verification code.</p>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
                required
              />
            </div>
            <button type="submit" disabled={loading} className={btnClass}>
              {loading ? 'Sending...' : 'Send Code'}
            </button>
            <button type="button" onClick={() => { setError(''); setMessage(''); setView('signIn'); }} className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors mt-3">
              Back to sign in
            </button>
          </form>
        )}

        {view === 'confirmReset' && (
          <form onSubmit={handleConfirmReset} className="space-y-5">
            <p className="text-sm text-slate-600 bg-blue-50 p-4 rounded-xl border border-blue-100">Enter the code sent to your email and your new password.</p>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Verification Code</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                className={inputClass}
                placeholder="Enter 6-digit code"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
              <input
                type="password"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                className={inputClass}
                placeholder="Enter new password"
                required
              />
            </div>
            <button type="submit" disabled={loading} className={btnClass}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            <button type="button" onClick={() => { setError(''); setMessage(''); setView('signIn'); }} className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors mt-3">
              Back to sign in
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-slate-400 text-sm flex items-center justify-center gap-1.5">
          Made with
          <svg
            className="w-4 h-4 text-red-500 animate-heartbeat"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 20 20"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
            />
          </svg>
          by FSI PACE Prototyping Team
        </p>
      </div>
    </div>
  );
}
