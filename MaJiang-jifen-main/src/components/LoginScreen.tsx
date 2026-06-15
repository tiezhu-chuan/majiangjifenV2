import React, { useState, useRef } from 'react';
import { 
  auth, 
  db, 
  handleFirestoreError, 
  OperationType,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  doc, 
  setDoc, 
  getDoc
} from '../firebase';
import { compressImageToBase64, slice3x3GridToAvatars } from '../utils/imageCompressor';
import { Upload, Camera, AlertCircle, Sparkles, Chrome } from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';

interface LoginScreenProps {
  onLoginSuccess: (userDoc: any) => void;
}

const PRESET_AVATARS = [
  'https://neeko-copilot.bytedance.net/api/text2image?prompt=cute%20cartoon%20adventurer%20girl%20avatar%20colorful%20simple&image_size=square',
  'https://neeko-copilot.bytedance.net/api/text2image?prompt=cute%20cartoon%20adventurer%20boy%20avatar%20colorful%20simple&image_size=square',
  'https://neeko-copilot.bytedance.net/api/text2image?prompt=cute%20anime%20girl%20avatar%20pink%20hair%20simple&image_size=square',
  'https://neeko-copilot.bytedance.net/api/text2image?prompt=cute%20anime%20boy%20avatar%20cool%20blue%20simple&image_size=square',
  'https://neeko-copilot.bytedance.net/api/text2image?prompt=cute%20robot%20pet%20avatar%20friendly%20simple&image_size=square',
  'https://neeko-copilot.bytedance.net/api/text2image?prompt=cute%20emoji%20smile%20avatar%20happy%20simple&image_size=square',
  'https://neeko-copilot.bytedance.net/api/text2image?prompt=cute%20big%20smile%20face%20avatar%20cheerful%20simple&image_size=square',
  'https://neeko-copilot.bytedance.net/api/text2image?prompt=pixel%20art%20cat%20avatar%20retro%20simple&image_size=square',
  'https://neeko-copilot.bytedance.net/api/text2image?prompt=cute%20professional%20man%20avatar%20modern%20simple&image_size=square'
];

function usernameToEmail(username: string): string {
  const clean = username.trim().toLowerCase();
  const encoded = btoa(clean).replace(/[+/=]/g, (c) => {
    return c === '+' ? '-': c === '/' ? '_' : '';
  }).substring(0, 20);
  return `${encoded}@mahjong-app.com`;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState(PRESET_AVATARS[0]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isOperationNotAllowedError, setIsOperationNotAllowedError] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  
  const [slicedAvatars, setSlicedAvatars] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sliceGridInputRef = useRef<HTMLInputElement>(null);

  const handleGridSlicing = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      setError('');
      const slices = await slice3x3GridToAvatars(file);
      setSlicedAvatars(slices);
      setAvatar(slices[0]);
    } catch (err) {
      console.error(err);
      setError('九宫格切图失败，请确保上传了正常的图片格式！');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  };

  const processImageFile = async (file: File) => {
    try {
      setLoading(true);
      setError('');
      // Compress to maximum 200KB to comfortably fit Firestore limits
      const compressedBase64 = await compressImageToBase64(file, 200, 600);
      setAvatar(compressedBase64);
    } catch (err) {
      console.error(err);
      setError('图片加载或压缩失败，请换张照片试试');
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    
    // Check constraints
    if (username.length < 2 || username.length > 20) {
      setError('用户名长度需在 2 到 20 个字符之间');
      return;
    }
    if (password.length < 6) {
      setError('密码长度需至少为 6 位');
      return;
    }

    setLoading(true);
    setError('');

    const hostEmail = usernameToEmail(username);

    if (isRegistering) {
      try {
        // 1. Create firebase auth user
        const credentials = await createUserWithEmailAndPassword(auth, hostEmail, password);
        const userId = credentials.user.uid;
        
        // 2. Put user data into Firestore
        const userDocRef = doc(db, 'users', userId);
        const userData = {
          id: userId,
          username: username.trim(),
          avatar_url: avatar,
          total_score: 0,
          created_at: new Date()
        };

        try {
          await setDoc(userDocRef, userData);
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.CREATE, `users/${userId}`);
        }

        onLoginSuccess(userData);
      } catch (authErr: any) {
        console.error(authErr);
        if (authErr.code === 'auth/email-already-in-use') {
          setError('用户名已被注册，请直接点击登录');
        } else if (authErr.code === 'auth/operation-not-allowed') {
          setIsOperationNotAllowedError(true);
          setError('当前 Firebase 项目未开启邮箱密码登录。作为开发者，您可以根据下方提示开启它。');
        } else {
          setError(authErr.message || '注册失败，请稍后重试');
        }
      } finally {
        setLoading(false);
      }
    } else {
      // Login standard flow
      try {
        const credentials = await signInWithEmailAndPassword(auth, hostEmail, password);
        const userId = credentials.user.uid;

        // Fetch User profile
        const userDocRef = doc(db, 'users', userId);
        let snap;
        try {
          snap = await getDoc(userDocRef);
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.GET, `users/${userId}`);
        }

        if (snap && snap.exists()) {
          onLoginSuccess(snap.data());
        } else {
          // If Firestore is missing, recreate profile to prevent locking out
          const userData = {
            id: userId,
            username: username.trim(),
            avatar_url: avatar,
            total_score: 0,
            created_at: new Date()
          };
          await setDoc(userDocRef, userData);
          onLoginSuccess(userData);
        }
      } catch (authErr: any) {
        console.error(authErr);
        if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential') {
          setError('用户名或密码错误，或用户不存在');
        } else if (authErr.code === 'auth/operation-not-allowed') {
          setIsOperationNotAllowedError(true);
          setError('当前 Firebase 项目未开启邮箱密码登录。作为开发者，您可以根据下方提示开启它。');
        } else {
          setError(authErr.message || '登录失败，请重试');
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    setIsOperationNotAllowedError(false);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(auth, provider);
      const user = credential.user;
      
      const userDocRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userDocRef);
      
      let userData;
      if (snap.exists()) {
        userData = snap.data();
      } else {
        userData = {
          id: user.uid,
          username: user.displayName || `雀友_${user.uid.substring(0, 5)}`,
          avatar_url: user.photoURL || PRESET_AVATARS[0],
          total_score: 0,
          created_at: new Date()
        };
        await setDoc(userDocRef, userData);
      }
      
      onLoginSuccess(userData);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setIsOperationNotAllowedError(true);
        setError('当前 Firebase 项目未开启 Google 登录或邮箱密码注册。');
      } else {
        setError(err.message || '谷歌账号登录失败，请确保您在主浏览器开启了弹出窗口权限');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 px-4 py-8">
      {/* Decorative Mahjong elements */}
      <div className="absolute top-10 left-5 text-slate-800 font-mono text-7xl select-none font-black opacity-30 transform -rotate-12">
        萬
      </div>
      <div className="absolute bottom-10 right-5 text-slate-800 font-mono text-7xl select-none font-black opacity-30 transform rotate-12">
        發
      </div>

      <div className="w-full max-w-md bg-slate-800 rounded-3xl shadow-xl border border-slate-700/50 p-8 relative overflow-hidden">
        {/* Colorful visual accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 shadow-lg text-white font-serif text-3xl font-bold mb-4">
            中
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">麻将记分辅助</h1>
          <p className="text-slate-400 text-sm mt-1">
            线下好友搓麻，智能记分算账、解锁成就
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-200 rounded-xl flex flex-col gap-2.5 text-sm animate-shake">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
            
            {isOperationNotAllowedError && (
              <div className="mt-3 p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl space-y-2 text-xs text-slate-300">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>自助解锁「账号密码」登录方式</span>
                </div>
                <p className="leading-relaxed">
                  当前 Firebase 账户未开启传统的账号密码登录（默认仅支持 Google 一键登录）。作为开发者，您只需：
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>点击下方链接前往控制台</li>
                  <li>点击 <b>电子邮件/密码 (Email/Password)</b></li>
                  <li>开启 <b>启用 (Enable)</b> 选项并保存</li>
                </ol>
                <div className="pt-1.5 text-center">
                  <a 
                    href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:border-emerald-400 transition-all py-1.5 px-3 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-semibold"
                  >
                    前往 Firebase 控制台配置 →
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Upload Container (Only show on Registration) */}
          {isRegistering && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300">
                个性头像
              </label>
              
              <div className="flex flex-col items-center gap-4">
                {/* Visual Circle Box */}
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={triggerFileInput}
                  className={`relative w-24 h-24 rounded-full border-2 border-dashed flex items-center justify-center cursor-pointer transition-all overflow-hidden group ${
                    isDragging 
                      ? 'border-emerald-400 bg-emerald-500/10 scale-105' 
                      : 'border-slate-600 bg-slate-900/50 hover:border-slate-500 hover:bg-slate-705'
                  }`}
                >
                  {avatar ? (
                    <>
                      <img 
                        src={avatar} 
                        alt="Avatar preview" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                        <Camera className="w-5 h-5 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-2">
                      <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                      <span className="text-xs text-slate-500">上传照片</span>
                    </div>
                  )}
                  
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>

                <div className="text-center">
                  <p className="text-xs text-slate-500">
                    支持点击/拖拽上传，大图自动压缩至 3MB 以内保存
                  </p>
                  
                  {/* Preset Avatars Selection & Slice upload */}
                  <div className="flex flex-col items-center justify-center gap-2 mt-4 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/40">
                    <div className="flex items-center justify-between w-full px-1">
                      <span className="text-xs text-slate-400 font-medium">默认九珍头像:</span>
                      <button
                        type="button"
                        onClick={() => sliceGridInputRef.current?.click()}
                        className="text-[10px] bg-slate-800 hover:bg-slate-750 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded transition-all cursor-pointer font-bold shrink-0 shadow-sm"
                        title="如果您有3x3九宫格头像合集图，点击这里一键切成9张独立头像！"
                      >
                        ⚡ 导入九宫格切图
                      </button>
                      <input 
                        type="file"
                        ref={sliceGridInputRef}
                        onChange={handleGridSlicing}
                        accept="image/*"
                        className="hidden"
                      />
                    </div>
                    
                    <div className="grid grid-cols-5 gap-2 w-full mt-1.5">
                      {(slicedAvatars.length > 0 ? slicedAvatars : PRESET_AVATARS).map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setAvatar(url)}
                          className={`w-9 h-9 rounded-xl overflow-hidden border-2 transition-all hover:scale-110 shrink-0 ${
                            avatar === url ? 'border-emerald-400 scale-105 shadow-md shadow-emerald-500/20' : 'border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <img src={url} alt="preset avatar" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-300" htmlFor="username">
              用户名 (登入口令)
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                const val = e.target.value;
                if (isComposing) {
                  setUsername(val);
                } else {
                  setUsername(val.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, ''));
                }
              }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={(e) => {
                setIsComposing(false);
                setUsername(e.currentTarget.value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, ''));
              }}
              onBlur={() => setUsername(prev => prev.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, ''))}
              placeholder="起个威风的麻将名号"
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-300" htmlFor="password">
              密码
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位安全登录密码"
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-emerald-500/20 active:scale-95 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isRegistering ? (
              <>
                <Sparkles className="w-4 h-4" />
                <span>立即注册并登录</span>
              </>
            ) : (
              <span>进入雀神世界 (登录)</span>
            )}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between gap-3 text-xs text-slate-500">
          <div className="h-px bg-slate-700/60 flex-1" />
          <span>或使用其他登录方式</span>
          <div className="h-px bg-slate-700/60 flex-1" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="mt-4 w-full bg-slate-900 border border-slate-750 text-slate-200 hover:text-white hover:bg-slate-850 hover:border-slate-700 font-semibold py-3 rounded-xl shadow-md transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Chrome className="w-4 h-4 text-emerald-500" />
          <span>使用 Google 账号一键登录</span>
        </button>

        <div className="mt-6 text-center text-sm text-slate-400">
          {isRegistering ? (
            <p>
              已有账号？{' '}
              <button
                onClick={() => setIsRegistering(false)}
                className="text-emerald-400 hover:underline font-medium"
              >
                立即登录
              </button>
            </p>
          ) : (
            <p>
              新雀友？{' '}
              <button
                onClick={() => setIsRegistering(true)}
                className="text-emerald-400 hover:underline font-medium"
              >
                免费开通账号
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
