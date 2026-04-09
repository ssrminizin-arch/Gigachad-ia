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
import { Mail, Lock, Key, ArrowRight, ShieldCheck, MailCheck, RefreshCw } from 'lucide-react';
import { isAfter } from 'date-fns';

const ADMIN_INITIAL_KEY = (import.meta as any).env.VITE_ADMIN_INITIAL_KEY || 'ADMIN_SECRET_2026';

export function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !user.emailVerified) {
        setNeedsVerification(true);
      } else {
        setNeedsVerification(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleResendEmail = async () => {
    if (!auth.currentUser) return;
    setResendLoading(true);
    try {
      await sendEmailVerification(auth.currentUser);
      alert('E-mail de verificação reenviado!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const isOwnerEmail = email.toLowerCase() === 'afizportapau@gmail.com';
      
      if (isLogin) {
        // Login Logic
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (!isOwnerEmail) {
          // Verify access code on login for non-admins
          if (accessCode === ADMIN_INITIAL_KEY) {
            // Admin key is always valid
          } else {
            const codeDoc = await getDoc(doc(db, 'accessCodes', accessCode));
            if (!codeDoc.exists()) throw new Error('Código de acesso inválido.');
            
            const codeData = codeDoc.data();
            if (isAfter(new Date(), new Date(codeData.expiresAt))) throw new Error('Este código expirou.');
            
            // If the code is used, it must belong to this user
            if (codeData.used && codeData.usedBy !== user.uid) {
              throw new Error('Este código pertence a outro usuário.');
            }
            
            // If the code is NOT used, the user might be "claiming" it now (though usually done at register)
            // For simplicity, we'll just ensure it's a valid code for this user.
          }
        }

        if (!user.emailVerified) {
          setNeedsVerification(true);
        }
      } else {
        // Sign Up Logic
        let role: 'admin' | 'user' = isOwnerEmail ? 'admin' : 'user';

        if (!isOwnerEmail) {
          if (accessCode === ADMIN_INITIAL_KEY) {
            role = 'admin';
          } else {
            const codeDoc = await getDoc(doc(db, 'accessCodes', accessCode));
            if (!codeDoc.exists()) throw new Error('Código de acesso inválido.');
            const codeData = codeDoc.data();
            if (codeData.used) throw new Error('Este código já foi utilizado.');
            if (isAfter(new Date(), new Date(codeData.expiresAt))) throw new Error('Este código expirou.');
          }
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          role: role,
          createdAt: new Date().toISOString(),
          registeredWithCode: isOwnerEmail ? 'owner' : accessCode
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
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro.');
      // If login failed due to code, sign out
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
              onClick={() => window.location.reload()}
              className="w-full bg-zinc-100 hover:bg-white text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              Já verifiquei meu e-mail
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

          {email.toLowerCase() !== 'afizportapau@gmail.com' && (
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
                  placeholder={isLogin ? "Seu código de acesso" : "Seu código de 30 dias"}
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
