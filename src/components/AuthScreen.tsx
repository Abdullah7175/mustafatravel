import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Mail, Lock, LogIn, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const AuthScreen: React.FC = () => {
  const { login } = useAuth(); // expects: (email, password) => Promise<boolean>
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember]   = useState(true);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string>('');
  const [okMsg, setOkMsg]         = useState<string>('');
  const [formData, setFormData]   = useState({ email: '', password: '' });

  const invalid = useMemo(() => {
    if (!formData.email || !formData.password) return true;
    if (!emailOk(formData.email)) return true;
    if (formData.password.length < 6) return true;
    return false;
  }, [formData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) {
      setError('Please enter a valid email and a password (min 6 chars).');
      return;
    }
    setLoading(true);
    setError('');
    setOkMsg('');
    try {
      const success = await login(formData.email.trim(), formData.password); // cookie set by server
      if (success) {
        if (remember) localStorage.setItem('rememberLogin', '1');
        setOkMsg('Signed in successfully.');
      } else {
        setError('Invalid email or password.');
      }
    } catch (err: any) {
      // try to surface server message if present
      const serverMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Login failed. Please try again.';
      setError(serverMsg);
    } finally {
      setLoading(false);
    }
  }

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setFormData((s) => ({ ...s, [e.target.name]: e.target.value }));
    setError('');
    setOkMsg('');
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-black to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-6">
          <div className="rounded-xl p-3 flex items-center justify-center mx-auto mb-4 w-24 h-24 bg-white shadow-xl border-2 border-white/20">
            <img src="/mustafa.png" alt="Mustafa Travel" className="w-full h-full object-contain" />
          </div>
          {/* <h1 className="text-2xl sm:text-4xl font-bold text-white mb-2">MARWAH TRAVELS UMRAH</h1> */}
          {/* <p className="text-gray-600">Management System</p> */}
        </div>

        {/* Auth Form */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
            <p className="text-gray-600 text-sm sm:text-base">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}
            {okMsg && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-800">{okMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 transition-colors ${
                    !formData.email || emailOk(formData.email)
                      ? 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
                      : 'border-red-300 focus:ring-red-500'
                  }`}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  aria-invalid={!!formData.email && !emailOk(formData.email)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className={`w-full pl-10 pr-12 py-3 border rounded-lg focus:ring-2 transition-colors ${
                    !formData.password || formData.password.length >= 6
                      ? 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
                      : 'border-red-300 focus:ring-red-500'
                  }`}
                  placeholder="Enter your password"
                  required
                  minLength={6}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>
              <a href="/forgot-password" className="text-sm text-blue-600 hover:underline">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading || invalid}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-60"
              aria-busy={loading}
            >
              <LogIn className="h-5 w-5" />
              <span>{loading ? 'Signing In…' : 'Sign In'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
