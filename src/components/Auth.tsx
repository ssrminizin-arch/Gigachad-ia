import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
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

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!user.emailVerified) {
          setNeedsVerification(true);
        } else {
          setNeedsVerification(false);
          // Check if IP needs verification even if just re-mounting
          const profileDoc = await getDoc(doc(db, 'users', user.uid));
          if (profileDoc.exists()) {
            const profileData = profileDoc.data();
            const isOwner = user.email === 'afizportapau@gmail.com';
            const ipMatches = currentIp && profileData.lastIp && currentIp === profileData.lastIp;
            const accessExpired = profileData.accessExpiresAt && isAfter(new Date(), new Date(profileData.accessExpiresAt));
            
            if (!isOwner) {
              if (accessExpired) {
                setIsExpired(true);
                setNeedsCode(true);
              } else if (!ipMatches) {
                setIsExpired(false);
                setNeedsCode(true);
              }
            }
          }
        }
      } else {
        setNeedsVerification(false);
        setNeedsCode(false);
      }
    });
    return () => unsubscribe();
  }, [currentIp]);

  const handleResendEmail = async () => {
    if (!auth.currentUser) return;
    setResendLoading(true);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        setNeedsVerification(false);
        onVerified?.();
        return;
      }
      await sendEmailVerification(auth.currentUser);
      alert('E-mail de verificação reenviado!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResendLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
        
        if (codeData.used && codeData.usedBy !== user.uid) {
          throw new Error('Este código pertence a outro usuário.');
        }

        // Update last IP and access expiration
        if (currentIp) {
          await updateDoc(doc(db, 'users', user.uid), {
            lastIp: currentIp,
            accessExpiresAt: codeData.expiresAt
          });
        }

        // If it was a fresh code, mark as used
        if (!codeData.used) {
          await updateDoc(doc(db, 'accessCodes', accessCode), {
            used: true,
            usedBy: user.uid
          });
        }
      }
      
      setNeedsCode(false);
      setIsExpired(false);
      onVerified?.();
    } catch (err: any) {
      setError(err.message || 'Erro ao verificar código.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();

    try {
      const isOwnerEmail = cleanEmail === 'afizportapau@gmail.com';
      
      if (isLogin) {
        // Login Logic
        const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
        const user = userCredential.user;

        // Fetch profile to check IP and Expiration
        const profileDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (!profileDoc.exists()) {
          // Create missing profile if it doesn't exist for some reason
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            role: isOwnerEmail ? 'admin' : 'user',
            createdAt: new Date().toISOString(),
            lastIp: currentIp || undefined,
            accessExpiresAt: isOwnerEmail ? addDays(new Date(), 3650).toISOString() : addDays(new Date(), 30).toISOString()
          });
          onVerified?.();
        } else {
          const profileData = profileDoc.data();
          const ipMatches = currentIp && profileData.lastIp && currentIp === profileData.lastIp;
          const accessExpired = profileData.accessExpiresAt && isAfter(new Date(), new Date(profileData.accessExpiresAt));
          
          if (!isOwnerEmail) {
            if (accessExpired) {
              setIsExpired(true);
              setNeedsCode(true);
            } else if (!ipMatches) {
              setIsExpired(false);
              setNeedsCode(true);
            } else if (currentIp) {
              // Update last IP if it matches
              await updateDoc(doc(db, 'users', user.uid), {
                lastIp: currentIp
              });
              onVerified?.();
            }
          } else if (currentIp) {
            // Update last IP for owner
            await updateDoc(doc(db, 'users', user.uid), {
              lastIp: currentIp
            });
            onVerified?.();
          }
        }

        if (!user.emailVerified) {
          setNeedsVerification(true);
        }
      } else {
        // Sign Up Logic
        let role: 'admin' | 'user' = isOwnerEmail ? 'admin' : 'user';
        let accessExpiresAt = addDays(new Date(), 3650).toISOString(); // Default for owner

        if (!isOwnerEmail) {
          if (accessCode === ADMIN_INITIAL_KEY) {
            role = 'admin';
          } else {
            const codeDoc = await getDoc(doc(db, 'accessCodes', accessCode));
            if (!codeDoc.exists()) throw new Error('Código de acesso inválido.');
            const codeData = codeDoc.data();
            if (codeData.used) throw new Error('Este código já foi utilizado.');
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
            usedBy: user.uid
          });
        }

        // Send Verification Email
        await sendEmailVerification(user);
        setNeedsVerification(true);
        onVerified?.();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro.');
      if (isLogin) await auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  if (needsVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#030303]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl backdrop-blur-xl text-center"
        >
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
        </motion.div>
      </div>
    );
  }

  if (needsCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#030303]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl backdrop-blur-xl"
        >
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

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs p-3 rounded-xl"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

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
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#030303]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl backdrop-blur-xl shadow-2xl"
      >
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
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 pl-12 pr-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all"
                placeholder="••••••••"
              />
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

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs p-3 rounded-xl"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Processando...' : (isLogin ? 'Entrar' : 'Registrar')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
          >
            {isLogin ? 'Não tem uma conta? Registre-se' : 'Já tem uma conta? Entre'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
