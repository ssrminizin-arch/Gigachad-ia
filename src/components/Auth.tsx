import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc
} from 'firebase/firestore';
import { Mail, Lock, Key, ArrowRight, ShieldCheck, MailCheck, RefreshCw, Globe, AlertCircle } from 'lucide-react';
import { isAfter, addDays } from 'date-fns';

const ADMIN_INITIAL_KEY = (import.meta as any).env.VITE_ADMIN_INITIAL_KEY || 'ADMIN_SECRET_2026';

interface AuthProps {
  onVerified?: () => void;
}

export function Auth({ onVerified }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentIp, setCurrentIp] = useState<string | null>(null);

  useEffect(() => {
    const fetchIp = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        setCurrentIp(data.ip);
      } catch (err) {
        console.error('Failed to fetch IP:', err);
      }
    };
    fetchIp();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!user.emailVerified) {
          setNeedsVerification(true);
          setLoading(false);
        } else {
          setNeedsVerification(false);
          
          // Check if IP needs verification
          try {
            const profileDoc = await getDoc(doc(db, 'users', user.uid));
            if (profileDoc.exists()) {
              const profileData = profileDoc.data();
              const isOwner = user.email?.toLowerCase() === 'afizportapau@gmail.com';
              
              if (isOwner) {
                setNeedsCode(false);
                onVerified?.();
              } else {
                const ipMatches = currentIp && profileData.lastIp && currentIp === profileData.lastIp;
                const accessExpired = profileData.accessExpiresAt && isAfter(new Date(), new Date(profileData.accessExpiresAt));
                
                if (accessExpired) {
                  setIsExpired(true);
                  setNeedsCode(true);
                } else if (currentIp && !ipMatches) {
                  setIsExpired(false);
                  setNeedsCode(true);
                } else if (ipMatches || !currentIp) {
                  // If IP matches or we can't determine IP, allow entry (don't block if ipify is down)
                  setNeedsCode(false);
                  onVerified?.();
                }
              }
            } else {
              // Profile doesn't exist yet (just registered)
              // The handleSubmit handles creation, but if it's missing, we allow entry to create it
              onVerified?.();
            }
          } catch (err) {
            console.error("Error checking profile:", err);
            onVerified?.(); // Fallback to allow entry if Firestore fails
          }
          setLoading(false);
        }
      } else {
        setNeedsVerification(false);
        setNeedsCode(false);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [currentIp, onVerified]);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (successMessage || error) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
        setError(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, error]);

  const handleResendEmail = async () => {
    if (!auth.currentUser) return;
    setResendLoading(true);
    setSuccessMessage(null);
    setError(null);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        setNeedsVerification(false);
        onVerified?.();
        return;
      }
      await sendEmailVerification(auth.currentUser);
      setSuccessMessage('E-mail de verificação reenviado!');
    } catch (err: any) {
      setError(translateError(err.message));
    } finally {
      setResendLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    setSuccessMessage(null);
    setError(null);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        setNeedsVerification(false);
        
        // Check profile after verification
        const profileDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (!profileDoc.exists()) {
          // Create missing profile
          const isOwnerEmail = auth.currentUser.email?.toLowerCase() === 'afizportapau@gmail.com';
          await setDoc(doc(db, 'users', auth.currentUser.uid), {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            role: isOwnerEmail ? 'admin' : 'user',
            createdAt: new Date().toISOString(),
            lastIp: currentIp || undefined,
            accessExpiresAt: isOwnerEmail ? addDays(new Date(), 3650).toISOString() : addDays(new Date(), 30).toISOString()
          });
        }
        
        onVerified?.();
      } else {
        setError('E-mail ainda não verificado. Verifique sua caixa de entrada.');
      }
    } catch (err: any) {
      setError(translateError(err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (!auth.currentUser) throw new Error('Usuário não autenticado.');
      const user = auth.currentUser;

      if (accessCode === ADMIN_INITIAL_KEY) {
        // Admin key is always valid
        if (currentIp) {
          await updateDoc(doc(db, 'users', user.uid), {
            lastIp: currentIp,
            accessExpiresAt: addDays(new Date(), 3650).toISOString() // 10 years for admin key
          });
        }
      } else {
        const codeDoc = await getDoc(doc(db, 'accessCodes', accessCode));
        if (!codeDoc.exists()) throw new Error('Código de acesso inválido.');
        
        const codeData = codeDoc.data();
        if (isAfter(new Date(), new Date(codeData.expiresAt))) throw new Error('Este código expirou.');
        
        // Check if code is already used by someone else
        const isUsedByOther = codeData.used && (
          (codeData.usedBy && codeData.usedBy !== user.uid) || 
          (codeData.usedByEmail && codeData.usedByEmail !== user.email?.toLowerCase())
        );

        if (isUsedByOther) {
          throw new Error('Este código pertence a outro usuário.');
        }

        // Update last IP and access expiration
        if (currentIp) {
          await updateDoc(doc(db, 'users', user.uid), {
            lastIp: currentIp,
            accessExpiresAt: codeData.expiresAt
          });
        }

        // If it was a fresh code or used by email but not yet by UID, mark as used by this UID
        if (!codeData.used || !codeData.usedBy) {
          await updateDoc(doc(db, 'accessCodes', accessCode), {
            used: true,
            usedBy: user.uid,
            usedByEmail: user.email?.toLowerCase() || codeData.usedByEmail
          });
        }
      }
      
      setNeedsCode(false);
      setIsExpired(false);
      onVerified?.();
    } catch (err: any) {
      setError(translateError(err.message || 'Erro ao verificar código.'));
    } finally {
      setLoading(false);
    }
  };

  const translateError = (message: string) => {
    const msg = message.toLowerCase();
    if (msg.includes('auth/user-not-found') || msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
      return 'E-mail ou senha incorretos. Verifique e tente novamente.';
    }
    if (msg.includes('auth/invalid-email')) {
      return 'Formato de e-mail inválido.';
    }
    if (msg.includes('auth/email-already-in-use')) {
      return 'Este e-mail já está em uso.';
    }
    if (msg.includes('auth/weak-password')) {
      return 'A senha deve ter pelo menos 6 caracteres.';
    }
    if (msg.includes('auth/too-many-requests')) {
      return 'Muitas tentativas. Tente novamente mais tarde.';
    }
    if (msg.includes('network-request-failed')) {
      return 'Erro de conexão. Verifique sua internet.';
    }
    return 'Ocorreu um erro ao tentar entrar. Tente novamente.';
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Por favor, insira seu e-mail para recuperar a senha.');
      return;
    }
    setLoading(true);
    setSuccessMessage(null);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setSuccessMessage('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (err: any) {
      setError(translateError(err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const cleanEmail = email.trim().toLowerCase();
    
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Por favor, insira um e-mail válido.');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        // The onAuthStateChanged listener will handle the rest
      } else {
        const isOwnerEmail = cleanEmail === 'afizportapau@gmail.com';
        let role: 'admin' | 'user' = isOwnerEmail ? 'admin' : 'user';
        let accessExpiresAt = addDays(new Date(), 3650).toISOString();

        if (!isOwnerEmail) {
          if (accessCode === ADMIN_INITIAL_KEY) {
            role = 'admin';
          } else {
            const codeDoc = await getDoc(doc(db, 'accessCodes', accessCode));
            if (!codeDoc.exists()) throw new Error('Código de acesso inválido.');
            const codeData = codeDoc.data();
            
            const isUsedByOther = codeData.used && (
              (codeData.usedBy) || 
              (codeData.usedByEmail && codeData.usedByEmail !== cleanEmail)
            );

            if (isUsedByOther) throw new Error('Este código já foi utilizado por outro usuário.');
            if (isAfter(new Date(), new Date(codeData.expiresAt))) throw new Error('Este código expirou.');
            accessExpiresAt = codeData.expiresAt;
          }
        }

        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const user = userCredential.user;

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          role: role,
          createdAt: new Date().toISOString(),
          registeredWithCode: isOwnerEmail ? 'owner' : accessCode,
          lastIp: currentIp || undefined,
          accessExpiresAt: accessExpiresAt
        });

        if (!isOwnerEmail && accessCode !== ADMIN_INITIAL_KEY) {
          await updateDoc(doc(db, 'accessCodes', accessCode), {
            used: true,
            usedBy: user.uid,
            usedByEmail: cleanEmail
          });
        }

        await sendEmailVerification(user);
        setNeedsVerification(true);
      }
    } catch (err: any) {
      console.error(err);
      setError(translateError(err.message || 'Ocorreu um erro.'));
      setLoading(false);
    }
  };

  if (needsVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#030303]">
        <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl backdrop-blur-xl text-center">
          <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <MailCheck className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-2xl font-serif italic text-zinc-100 mb-4">Verifique seu E-mail</h1>
          <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
            Enviamos um link de verificação para <span className="text-zinc-100 font-bold">{auth.currentUser?.email}</span>. 
            Por favor, verifique sua caixa de entrada (e a pasta de spam) para ativar sua conta.
          </p>
          
          <div className="space-y-4">
            <button 
              onClick={handleCheckVerification}
              disabled={loading}
              className="w-full bg-zinc-100 hover:bg-white text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Já verifiquei meu e-mail'}
            </button>
            
            <button 
              onClick={handleResendEmail}
              disabled={resendLoading}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 border border-zinc-800"
            >
              {resendLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Reenviar e-mail'}
            </button>

            <button 
              onClick={() => auth.signOut()}
              className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors mt-4"
            >
              Sair e tentar outro email
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (needsCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#030303]">
        <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl backdrop-blur-xl">
          <div className="text-center mb-8">
            <div className={`w-16 h-16 ${isExpired ? 'bg-red-500/10 border-red-500/20' : 'bg-amber-500/10 border-amber-500/20'} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
              {isExpired ? <AlertCircle className="w-8 h-8 text-red-500" /> : <Globe className="w-8 h-8 text-amber-500" />}
            </div>
            <h1 className="text-2xl font-serif italic text-zinc-100">
              {isExpired ? 'Acesso Expirado' : 'IP não reconhecido'}
            </h1>
            <p className="text-zinc-500 text-sm mt-2">
              {isExpired 
                ? 'Seu período de acesso de 30 dias terminou. Por favor, insira um novo código de acesso para continuar usando a IA.' 
                : 'Detectamos um acesso de um novo local. Por favor, insira seu código de acesso para confirmar sua identidade.'}
            </p>
          </div>

          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">
                {isExpired ? 'Novo Código de Acesso' : 'Código de Acesso'}
              </label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input 
                  type="text"
                  required
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 pl-12 pr-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all"
                  placeholder="Seu código de acesso"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs p-3 rounded-xl">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs p-3 rounded-xl">
                {successMessage}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Verificando...' : 'Confirmar Identidade'}
              <ArrowRight className="w-4 h-4" />
            </button>

            <button 
              type="button"
              onClick={() => auth.signOut()}
              className="w-full text-zinc-600 hover:text-zinc-400 text-xs transition-colors mt-4"
            >
              Cancelar e Sair
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#030303]">
      <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl backdrop-blur-xl shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-serif italic text-zinc-100">
            {isLogin ? 'Bem-vindo de volta' : 'Criar Conta'}
          </h1>
          <p className="text-zinc-500 text-sm mt-2">
            {isLogin ? 'Acesse sua conta para continuar' : 'Use seu código de acesso para se registrar'}
          </p>
          {!isLogin && email.toLowerCase() === 'afizportapau@gmail.com' && (
            <p className="text-emerald-500 text-[10px] mt-2 font-bold uppercase tracking-widest">
              Email de proprietário detectado. Acesso admin garantido.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 pl-12 pr-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all"
                placeholder="seu@email.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input 
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 pl-12 pr-12 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 p-1"
              >
                {showPassword ? (
                  <span className="text-[10px] font-bold uppercase tracking-tighter">Ocultar</span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-tighter">Mostrar</span>
                )}
              </button>
            </div>
          </div>

          {!isLogin && email.toLowerCase() !== 'afizportapau@gmail.com' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Código de Acesso</label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input 
                  type="text"
                  required
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 pl-12 pr-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all"
                  placeholder="Seu código de 30 dias"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs p-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs p-3 rounded-xl mb-4">
              {successMessage}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Processando...' : (isLogin ? 'Entrar' : 'Registrar')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

          <div className="mt-6 text-center space-y-4">
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="block w-full text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
            >
              {isLogin ? 'Não tem uma conta? Registre-se' : 'Já tem uma conta? Entre'}
            </button>
            
            {isLogin && (
              <button 
                onClick={handleForgotPassword}
                className="block w-full text-zinc-600 hover:text-zinc-400 text-[10px] uppercase tracking-widest transition-colors"
              >
                Esqueceu sua senha?
              </button>
            )}
          </div>
      </div>
    </div>
  );
}
