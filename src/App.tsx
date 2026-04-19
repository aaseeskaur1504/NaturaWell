/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Leaf, 
  Droplets, 
  Footprints, 
  Camera, 
  Calendar, 
  LineChart, 
  User, 
  Search, 
  Plus, 
  CheckCircle2, 
  AlertCircle,
  Bell,
  Trash2,
  ChevronRight,
  Sparkles,
  MessageSquare,
  Compass,
  CircleCheckBig,
  Utensils
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  updateDoc,
  deleteDoc,
  Timestamp,
  increment,
  getDocFromServer
} from 'firebase/firestore';
import { 
  LineChart as ReChart, 
  Line, 
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

import { auth, db } from './lib/firebase';
import { cn, formatDate } from './lib/utils';
import { 
  getNaturalRemedies, 
  getGeneralHealthTips, 
  getBodyAdvice, 
  sendMessageToAura,
  Remedy, 
  BodyAdvice,
  ChatMessage
} from './services/geminiService';

// --- Types ---
interface UserProfile {
  skinType: string;
  hairType: string;
  concerns: string[];
  stepGoal: number;
  waterGoal: number;
  age: number;
  height: number;
  weight: number;
}

interface DailyLog {
  date: string;
  steps: number;
  water: number;
  exercises: boolean;
  yoga: boolean;
  meditation: boolean;
}

interface ProgressEntry {
  id: string;
  date: any;
  imageUrl?: string;
  note: string;
  area: string;
}

interface Reminder {
  id: string;
  title: string;
  time: string;
  type: 'medicine' | 'remedy' | 'water';
  enabled: boolean;
}

// --- Components ---

const Button = ({ children, className, variant = 'primary', ...props }: any) => {
  const variants = {
    primary: 'bg-brand text-white hover:opacity-90 border-1.5 border-border-bold',
    secondary: 'bg-white border-1.5 border-border-bold text-text-main hover:bg-border',
    ghost: 'bg-transparent hover:bg-black/5',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border-1.5 border-red-200'
  } as any;
  
  return (
    <button 
      className={cn(
        "px-6 py-3 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 text-sm uppercase tracking-wider",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, title, subtitle }: any) => (
  <div className={cn("bg-card-bg rounded-xl p-6 border-1.5 border-border-bold flex flex-col relative", className)}>
    {(title || subtitle) && (
      <div className="mb-4">
        {title && <h3 className="text-[12px] uppercase tracking-[1px] font-bold text-text-sub mb-2">{title}</h3>}
        {subtitle && <p className="text-sm text-text-sub font-medium">{subtitle}</p>}
      </div>
    )}
    {children}
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'daily' | 'consult' | 'chat' | 'journal' | 'trends' | 'reminders' | 'profile' | 'roadmap'>('daily');
  const [loading, setLoading] = useState(true);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);
  
  // States for sub-screens
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [healthTips, setHealthTips] = useState<string[]>([]);
  const [remedies, setRemedies] = useState<Remedy[]>([]);
  const [isConsulting, setIsConsulting] = useState(false);

  const setupRealtimeData = (uid: string) => {
    // Logs (last 7 days - we fetch all but the view uses what it needs)
    const logsQuery = query(collection(db, `users/${uid}/logs`), orderBy('date', 'desc'));
    const unsubLogs = onSnapshot(logsQuery, (snap) => {
      setDailyLogs(snap.docs.map(d => d.data() as DailyLog));
    }, (err) => console.error("Logs listener error:", err));

    // Progress
    const progQuery = query(collection(db, `users/${uid}/progress`), orderBy('date', 'desc'));
    const unsubProg = onSnapshot(progQuery, (snap) => {
      setProgressEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProgressEntry)));
    }, (err) => console.error("Progress listener error:", err));

    // Reminders
    const remQuery = query(collection(db, `users/${uid}/reminders`), orderBy('time', 'asc'));
    const unsubRem = onSnapshot(remQuery, (snap) => {
      setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reminder)));
    }, (err) => console.error("Reminders listener error:", err));

    return () => {
      unsubLogs();
      unsubProg();
      unsubRem();
    };
  };

  useEffect(() => {
    let cleanupListeners: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      // Clear existing listeners first
      if (cleanupListeners) {
        cleanupListeners();
        cleanupListeners = null;
      }

      setUser(u);
      if (u) {
        // Fetch profile
        const profileDoc = await getDoc(doc(db, 'users', u.uid));
        if (profileDoc.exists()) {
          setProfile(profileDoc.data() as UserProfile);
        }
        
        // Setup subscriptions for logs, progress, reminders
        cleanupListeners = setupRealtimeData(u.uid);
      } else {
        setProfile(null);
        setDailyLogs([]);
        setProgressEntries([]);
        setReminders([]);
      }
      setLoading(false);
    });
    
    getGeneralHealthTips().then(setHealthTips);
    
    return () => {
      unsubAuth();
      if (cleanupListeners) cleanupListeners();
    };
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-brand-light">
      <div className="animate-pulse flex flex-col items-center">
        <Leaf className="w-12 h-12 text-brand mb-4" />
        <span className="text-brand font-serif italic text-lg">Gathering nature's secrets...</span>
      </div>
    </div>
  );

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  if (!profile && activeTab !== 'profile') return <Onboarding onComplete={(p) => setProfile(p)} uid={user.uid} />;

  return (
    <div className="min-h-screen pb-24 md:pb-0 md:pl-20">
      {/* Sidebar Nav (Desktop) */}
      <nav className="fixed bottom-0 left-0 w-full bg-white border-t-2 border-border-bold h-20 md:h-full md:w-20 md:border-t-0 md:border-r-2 flex md:flex-col justify-around md:justify-center items-center gap-2 px-4 z-50">
        <NavButton active={activeTab === 'daily'} onClick={() => setActiveTab('daily')} icon={<Footprints />} label="Daily" />
        <NavButton active={activeTab === 'consult'} onClick={() => setActiveTab('consult')} icon={<Search />} label="Heal" />
        <NavButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare />} label="Aura" />
        <NavButton active={activeTab === 'roadmap'} onClick={() => setActiveTab('roadmap')} icon={<Compass />} label="Path" />
        <NavButton active={activeTab === 'journal'} onClick={() => setActiveTab('journal')} icon={<Camera />} label="Log" />
        <NavButton active={activeTab === 'trends'} onClick={() => setActiveTab('trends')} icon={<LineChart />} label="Stats" />
        <NavButton active={activeTab === 'reminders'} onClick={() => setActiveTab('reminders')} icon={<Bell />} label="Alerts" />
        <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<User />} label="Me" />
      </nav>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto p-6 md:p-10">
        <header className="flex justify-between items-end pb-4 mb-8 border-b-2 border-border-bold">
          <div className="flex items-center gap-2">
            <Leaf className="w-8 h-8 text-brand" />
            <h1 className="text-2xl font-serif italic font-bold">NaturaWell</h1>
          </div>
          {profile && (
            <div className="hidden md:block text-[12px] text-text-sub">
              Profile: <strong className="text-text-main">{user?.displayName || 'Seeker'}</strong> &bull; 
              Skin: <strong className="text-text-main">{profile.skinType}</strong> &bull; 
              Hair: <strong className="text-text-main">{profile.hairType}</strong>
            </div>
          )}
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'daily' && <DailyView uid={user.uid} logs={dailyLogs}/>}
          {activeTab === 'consult' && (
            <ConsultView 
              uid={user.uid} 
              profile={profile} 
              remedies={remedies} 
              setRemedies={setRemedies}
              isConsulting={isConsulting}
              setIsConsulting={setIsConsulting}
            />
          )}
          {activeTab === 'chat' && <ChatView />}
          {activeTab === 'roadmap' && <RoadmapView uid={user.uid} />}
          {activeTab === 'journal' && <JournalView uid={user.uid} entries={progressEntries}/>}
          {activeTab === 'trends' && <TrendsView logs={dailyLogs} entries={progressEntries} />}
          {activeTab === 'reminders' && <ReminderView uid={user.uid} reminders={reminders}/>}
          {activeTab === 'profile' && <ProfileView user={user} profile={profile} onLogout={handleLogout} onUpdateProfile={setProfile} />}
        </AnimatePresence>

        {/* Global Health Tip */}
        {healthTips.length > 0 && activeTab === 'daily' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 bg-accent/20 border border-accent/40 rounded-[32px] p-6 flex flex-col items-center text-center gap-2"
          >
            <Sparkles className="text-brand w-6 h-6" />
            <p className="font-serif italic text-lg leading-relaxed text-stone-700">
              "{healthTips[Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % healthTips.length]}"
            </p>
            <span className="text-xs uppercase tracking-widest font-semibold opacity-50">Daily Wisdom</span>
          </motion.div>
        )}
      </main>
    </div>
  );
}

// --- Sub-Views ---

function LoginScreen({ onLogin }: any) {
  return (
    <div className="h-screen flex items-center justify-center bg-brand-light p-6 overflow-hidden">
      <div className="relative z-10 text-center max-w-sm">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-8"
        >
          <div className="w-24 h-24 bg-brand rounded-full mx-auto flex items-center justify-center text-white shadow-2xl shadow-brand/20 mb-6">
            <Leaf className="w-12 h-12" />
          </div>
          <h1 className="text-5xl mb-2">NaturaWell</h1>
          <p className="text-stone-500 font-serif italic text-lg">Your journey to natural radiance and holistic health.</p>
        </motion.div>
        
        <Button onClick={onLogin} className="w-full shadow-lg">
          Connect with Google
        </Button>
        <p className="mt-4 text-xs text-stone-400">Secure. Private. Powered by nature.</p>
      </div>
      
      {/* Decorative blobs */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/30 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand/10 rounded-full blur-[100px]" />
    </div>
  );
}

function Onboarding({ onComplete, uid }: { onComplete: (p: UserProfile) => void, uid: string }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Partial<UserProfile>>({
    skinType: 'Unknown',
    hairType: 'Unknown',
    concerns: [],
    stepGoal: 8000,
    waterGoal: 2000,
    age: 25,
    height: 170,
    weight: 65
  });

  const steps = [
    { 
      title: "Tell us about your skin", 
      desc: "Checking your skin type: Wash your face, wait an hour. Oily = shiny all over; Dry = tight/flaky; Combo = oily T-zone only.",
      field: 'skinType',
      options: ["Oily", "Dry", "Combination", "Normal", "Sensitive"]
    },
    { 
      title: "And your hair?", 
      desc: "Straight, Wavy, Curly, or Coily? This helps us suggest the best essential oils.",
      field: 'hairType',
      options: ["Straight", "Wavy", "Curly", "Coily"]
    },
    {
      title: "Personal Metrics",
      desc: "Your age, height (cm), and weight (kg) help us personalize your wellness facts.",
      metrics: true
    },
    {
      title: "Current Goals",
      desc: "What are your daily wellness targets?",
      custom: true
    }
  ];

  const handleNext = async () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      const final = data as UserProfile;
      await setDoc(doc(db, 'users', uid), final);
      onComplete(final);
    }
  };

  const cur = steps[step];

  return (
    <div className="min-h-screen bg-border flex items-center justify-center p-6 text-text-main">
      <Card className="max-w-md w-full p-10 bg-white">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-sub">Step {step + 1} of {steps.length}</span>
            <Leaf className="w-5 h-5 text-brand" />
          </div>
          <h2 className="text-3xl font-serif italic mb-2 leading-tight">{cur.title}</h2>
          <p className="text-text-sub text-sm leading-relaxed">{cur.desc}</p>
        </div>
        
        {cur.metrics ? (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-black uppercase tracking-tighter opacity-40 mb-2 block">Age</label>
                <input 
                  type="number" 
                  className="w-full bg-bg border-1.5 border-border rounded-xl p-3 font-bold"
                  value={data.age}
                  onChange={e => setData({...data, age: parseInt(e.target.value)})}
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-tighter opacity-40 mb-2 block">Height (cm)</label>
                <input 
                  type="number" 
                  className="w-full bg-bg border-1.5 border-border rounded-xl p-3 font-bold"
                  value={data.height}
                  onChange={e => setData({...data, height: parseInt(e.target.value)})}
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-tighter opacity-40 mb-2 block">Weight (kg)</label>
                <input 
                  type="number" 
                  className="w-full bg-bg border-1.5 border-border rounded-xl p-3 font-bold"
                  value={data.weight}
                  onChange={e => setData({...data, weight: parseInt(e.target.value)})}
                />
              </div>
            </div>
          </div>
        ) : cur.custom ? (
          <div className="space-y-6">
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold opacity-50 block mb-2">Step Goal</label>
              <input 
                type="range" min="2000" max="20000" step="500" 
                value={data.stepGoal} 
                onChange={e => setData({...data, stepGoal: parseInt(e.target.value)})}
                className="w-full accent-brand"
              />
              <div className="text-center font-bold font-serif italic">{data.stepGoal} steps</div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold opacity-50 block mb-2">Water Goal (ml)</label>
              <input 
                type="range" min="1000" max="5000" step="250" 
                value={data.waterGoal} 
                onChange={e => setData({...data, waterGoal: parseInt(e.target.value)})}
                className="w-full accent-brand"
              />
              <div className="text-center font-bold font-serif italic">{data.waterGoal} ml</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {cur.options?.map(opt => (
              <button
                key={opt}
                onClick={() => setData({...data, [cur.field!]: opt})}
                className={cn(
                  "p-4 rounded-2xl border-1.5 transition-all text-sm font-bold text-left",
                  data[cur.field as keyof UserProfile] === opt 
                    ? "bg-accent border-border-bold" 
                    : "bg-bg border-border hover:bg-border"
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
        
        <Button onClick={handleNext} className="w-full mt-10">
          {step === steps.length - 1 ? 'Finish' : (cur.metrics ? 'Continue' : 'Next')}
        </Button>
      </Card>
    </div>
  );
}

function DailyView({ uid, logs }: { uid: string, logs: DailyLog[] }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayData = (logs.find(l => l.date === todayStr) as DailyLog) || { 
    date: todayStr, 
    steps: 0, 
    water: 0, 
    exercises: false, 
    yoga: false,
    meditation: false
  };
  
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    getDoc(doc(db, 'users', uid)).then(d => setProfile(d.data() as UserProfile));
  }, []);

  const updateLogs = async (type: 'steps' | 'water' | 'exercises' | 'yoga' | 'meditation', change: any) => {
    const logRef = doc(db, `users/${uid}/logs`, todayStr);
    let newValue;
    if (typeof change === 'boolean') {
      newValue = change;
    } else {
      newValue = Math.max(0, ((todayData as any)[type] || 0) + change);
    }
    
    await setDoc(logRef, {
      ...todayData,
      [type]: newValue,
      date: todayStr
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Daily Header Summary */}
      <Card className="md:col-span-4 bg-border">
        <div className="card-title">Current Summary</div>
        <div className="flex gap-10 mt-2">
          <div className="flex flex-col">
            <span className="text-[11px] opacity-70 uppercase font-bold">Steps Rank</span>
            <span className="text-xl font-bold">{todayData.steps > (profile?.stepGoal || 0) ? 'Peak' : 'Rising'}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] opacity-70 uppercase font-bold">Hydration Status</span>
            <span className="text-xl font-bold">{todayData.water > 1500 ? 'Optimal' : 'Needs Water'}</span>
          </div>
        </div>
      </Card>

      {/* Water Tracker */}
      <Card className="md:col-span-2 relative overflow-hidden group min-h-[160px]">
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div>
            <h3 className="card-title">Water Intake</h3>
            <div className="text-2xl font-bold">{todayData.water / 1000} <span className="text-sm font-normal text-text-sub">/ {(profile?.waterGoal || 2000) / 1000}L</span></div>
          </div>
          <Droplets className="text-blue-500" />
        </div>
        
        <div className="flex gap-2 relative z-10 mt-auto">
          <Button variant="secondary" className="flex-1 py-2 px-0 text-[10px]" onClick={() => updateLogs('water', 250)}>+250ml</Button>
          <Button variant="secondary" className="flex-1 py-2 px-0 text-[10px]" onClick={() => updateLogs('water', 500)}>+500ml</Button>
        </div>
        
        <div className="mt-4 bg-border h-2.5 rounded-full relative overflow-hidden z-10">
          <div 
            className="h-full bg-blue-500 transition-all duration-700 ease-out"
            style={{ width: `${Math.min(100, (todayData.water / (profile?.waterGoal || 2000)) * 100)}%` }}
          />
        </div>
      </Card>

      {/* Steps Tracker */}
      <Card className="md:col-span-2 min-h-[160px]">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="card-title">Steps Goal</h3>
            <div className="text-3xl font-extrabold">{todayData.steps.toLocaleString()}</div>
          </div>
          <Footprints className="text-orange-500" />
        </div>

        <div className="mt-auto">
          <div className="flex justify-between text-[10px] font-bold text-text-sub mb-1">
            <span>Progress</span>
            <span>Target: {profile?.stepGoal || 8000}</span>
          </div>
          <div className="h-2.5 bg-border rounded-full overflow-hidden mb-4">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (todayData.steps / (profile?.stepGoal || 10000)) * 100)}%` }}
              className="h-full bg-border-bold"
            />
          </div>
          <input 
            type="number" 
            placeholder="Add steps..."
            className="w-full bg-bg border-1.5 border-border rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-0 focus:border-border-bold outline-none"
            onKeyDown={(e: any) => {
              if(e.key === 'Enter' && e.target.value) {
                updateLogs('steps', parseInt(e.target.value));
                e.target.value = '';
              }
            }}
          />
        </div>
      </Card>

      {/* Daily Activity Checklist & Resources */}
      <Card className="md:col-span-4 bg-[#F9F7F5] border-border-bold p-8">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-2xl font-serif italic text-brand">Daily Rituals</h2>
            <p className="text-[10px] uppercase font-black tracking-widest opacity-40">Consistency is the key to nature's healing</p>
          </div>
          <div className="flex gap-2">
            {[todayData.exercises, todayData.yoga, todayData.meditation].filter(Boolean).length === 3 && (
              <div className="bg-brand text-white text-[10px] px-3 py-1 rounded-full font-black uppercase flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Perfect Day
              </div>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Exercise Column */}
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-50 rounded-lg">
                  <Footprints className="w-4 h-4 text-orange-600" />
                </div>
                <h4 className="font-bold text-sm">Exercise</h4>
              </div>
              <button 
                onClick={() => updateLogs('exercises', !todayData.exercises)}
                className={cn(
                  "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all",
                  todayData.exercises ? "bg-brand border-brand text-white" : "border-border text-transparent hover:border-brand"
                )}
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </div>
            <a 
              href="https://www.youtube.com/watch?v=ml6cT4AZdqI" 
              target="_blank" 
              className="group block bg-white p-4 rounded-2xl border border-border hover:border-brand-dark transition-all"
            >
              <div className="text-[9px] uppercase font-black opacity-30 group-hover:text-brand transition-colors">Guided Workout</div>
              <div className="text-xs font-serif italic mt-1">20min Full Body Flow →</div>
            </a>
          </div>

          {/* Yoga Column */}
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-lg">
                  <Leaf className="w-4 h-4 text-green-600" />
                </div>
                <h4 className="font-bold text-sm">Yoga</h4>
              </div>
              <button 
                onClick={() => updateLogs('yoga', !todayData.yoga)}
                className={cn(
                  "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all",
                  todayData.yoga ? "bg-[#7B8E7E] border-[#7B8E7E] text-white" : "border-border text-transparent hover:border-[#7B8E7E]"
                )}
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </div>
            <a 
              href="https://www.youtube.com/watch?v=v7AYKMP6rOE" 
              target="_blank" 
              className="group block bg-white p-4 rounded-2xl border border-border hover:border-brand-dark transition-all"
            >
              <div className="text-[9px] uppercase font-black opacity-30 group-hover:text-[#7B8E7E] transition-colors">Guided Yoga</div>
              <div className="text-xs font-serif italic mt-1">Foundational Balance →</div>
            </a>
          </div>

          {/* Meditation Column */}
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                </div>
                <h4 className="font-bold text-sm">Meditation</h4>
              </div>
              <button 
                onClick={() => updateLogs('meditation', !todayData.meditation)}
                className={cn(
                  "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all",
                  todayData.meditation ? "bg-blue-500 border-blue-500 text-white" : "border-border text-transparent hover:border-blue-500"
                )}
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </div>
            <a 
              href="https://www.youtube.com/watch?v=inpok4MKVLM" 
              target="_blank" 
              className="group block bg-white p-4 rounded-2xl border border-border hover:border-blue-500 transition-all"
            >
              <div className="text-[9px] uppercase font-black opacity-30 group-hover:text-blue-500 transition-colors">Daily Calm</div>
              <div className="text-xs font-serif italic mt-1">10min Mindfulness →</div>
            </a>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function ConsultView({ uid, profile, remedies, setRemedies, isConsulting, setIsConsulting }: any) {
  const [problem, setProblem] = useState('');
  const [category, setCategory] = useState<'skin' | 'hair' | 'health'>('skin');
  const [scheduled, setScheduled] = useState<Record<string, boolean>>({});
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState('08:00');

  const onConsult = async () => {
    if(!problem) return;
    setIsConsulting(true);
    const results = await getNaturalRemedies(category, category === 'skin' ? profile.skinType : profile.hairType, problem);
    setRemedies(results);
    setScheduled({}); // Reset scheduled status for new results
    setIsConsulting(false);
  };

  const onConfirmSchedule = async (remedyTitle: string) => {
    await addDoc(collection(db, `users/${uid}/reminders`), {
      title: remedyTitle,
      time: selectedTime,
      type: 'remedy',
      enabled: true
    });
    setScheduled(prev => ({ ...prev, [remedyTitle]: true }));
    setScheduling(null);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      className="space-y-8"
    >
      <header>
        <h1 className="text-4xl mb-2">Natural Wellness</h1>
        <p className="text-stone-500 font-serif italic">What can nature heal for you today?</p>
      </header>

    <Card className="p-8">
        <label className="text-xs uppercase tracking-widest font-bold opacity-30 block mb-4">Focus Area</label>
        <div className="flex gap-2 mb-8 bg-border p-1.5 rounded-3xl">
          {(['skin', 'hair', 'health'] as const).map(c => {
            const colors = {
              skin: { active: "bg-white text-[#9C6D3E] shadow-sm", inactive: "text-text-sub hover:bg-black/5" },
              hair: { active: "bg-white text-[#5C4033] shadow-sm", inactive: "text-text-sub hover:bg-black/5" },
              health: { active: "bg-white text-[#4E5D50] shadow-sm", inactive: "text-text-sub hover:bg-black/5" }
            } as any;
            
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "flex-1 py-3 rounded-2xl capitalize font-bold transition-all text-sm",
                  category === c ? colors[c].active : colors[c].inactive
                )}
              >
                {c}
              </button>
            );
          })}
        </div>

        <label className="text-xs uppercase tracking-widest font-bold opacity-30 block mb-2">Describe the problem</label>
        <textarea
          value={problem}
          onChange={e => setProblem(e.target.value)}
          placeholder="e.g., Dry patches around nose, excessive hair fall, or trouble sleeping..."
          className="w-full bg-border/40 border border-border rounded-[24px] p-6 text-lg font-serif italic min-h-[120px] focus:ring-1 focus:ring-border-bold focus:border-border-bold transition-all outline-none"
        />
        
        <Button 
          onClick={onConsult} 
          className="w-full mt-6"
          disabled={isConsulting || !problem}
        >
          {isConsulting ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Wisdom incoming...
            </span>
          ) : 'Get Home Remedies'}
        </Button>
      </Card>

      <div className="space-y-4">
        {remedies.map((remedy: Remedy, idx: number) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className="bg-brand text-white border-border-bold p-8">
              <div className="flex justify-between items-start mb-4">
                <div className="card-title text-white/70">Recommended Remedy</div>
                {scheduled[remedy.title] ? (
                  <div className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/40 text-white">
                    <CheckCircle2 className="w-3 h-3" />
                    Scheduled
                  </div>
                ) : scheduling === remedy.title ? (
                  <div className="flex items-center gap-2 bg-white p-1 rounded-xl border-border-bold border-1.5">
                    <input 
                      type="time" 
                      className="text-text-main text-xs font-bold bg-transparent outline-none px-2"
                      value={selectedTime}
                      onChange={e => setSelectedTime(e.target.value)}
                    />
                    <button 
                      onClick={() => onConfirmSchedule(remedy.title)}
                      className="bg-brand text-white p-1.5 rounded-lg hover:opacity-90"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setScheduling(remedy.title)}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/10 transition-all"
                  >
                    <Calendar className="w-3 h-3" />
                    Schedule
                  </button>
                )}
              </div>
              <h3 className="text-4xl font-serif italic mb-4 leading-tight">{remedy.title}</h3>
              <p className="text-sm text-white/90 mb-6 leading-relaxed max-w-xl">{remedy.benefits}</p>
              
              <div className="flex flex-wrap gap-2 mb-8">
                {remedy.ingredients.map((ing, i) => (
                  <span key={i} className="bg-white/20 px-3 py-1.5 rounded-full text-xs font-bold border border-white/10">
                    {ing}
                  </span>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-8 border-t border-white/20 pt-8">
                <div>
                  <h4 className="text-[10px] uppercase font-black tracking-widest text-white/50 mb-4">Instructions</h4>
                  <ol className="space-y-3">
                    {remedy.instructions.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm text-white/90">
                        <span className="font-serif italic font-bold">0{i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="bg-white/10 p-5 rounded-xl border border-white/10">
                  <h4 className="text-[10px] uppercase font-black tracking-widest text-white/50 mb-4 flex items-center gap-2">
                    <Utensils className="w-3 h-3" />
                     Dietary Path
                  </h4>
                  <ul className="space-y-3">
                    {remedy.dietaryRecommendations.map((item, i) => (
                      <li key={i} className="text-xs leading-relaxed text-white/90 flex gap-2">
                        <span className="opacity-40 text-[8px] mt-1">●</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 pt-4 border-t border-white/10 uppercase font-black text-[9px] tracking-widest opacity-40">Safety Note</div>
                  <p className="text-[10px] leading-relaxed text-white/70 mt-2">{remedy.precautions}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function JournalView({ uid, entries }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [newEntry, setNewEntry] = useState({ note: '', area: '', imageUrl: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setNewEntry({...newEntry, imageUrl: ev.target?.result as string});
      reader.readAsDataURL(file);
    }
  };

  const onSave = async () => {
    if (!newEntry.note && !newEntry.imageUrl) return;
    await addDoc(collection(db, `users/${uid}/progress`), {
      ...newEntry,
      date: Timestamp.now()
    });
    setNewEntry({ note: '', area: '', imageUrl: '' });
    setIsAdding(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl">Healing Log</h1>
        <Button variant="secondary" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Cancel' : 'New Entry'}
        </Button>
      </div>

      {isAdding && (
        <Card className="border-brand/20 bg-brand-light/20">
          <div className="grid md:grid-cols-2 gap-8">
            <div 
              className="aspect-video bg-white rounded-3xl border-2 border-dashed border-stone-200 flex flex-col items-center justify-center cursor-pointer hover:border-brand/40 overflow-hidden relative"
              onClick={() => fileInputRef.current?.click()}
            >
              {newEntry.imageUrl ? (
                <img src={newEntry.imageUrl} className="w-full h-full object-cover" />
              ) : (
                <>
                  <Camera className="w-10 h-10 text-stone-300 mb-2" />
                  <span className="text-xs text-stone-400">Share a progress photo</span>
                </>
              )}
              <input type="file" hidden ref={fileInputRef} onChange={onFileChange} accept="image/*" />
            </div>
            <div className="space-y-4">
              <input 
                placeholder="Target Area (e.g. Forehead, Ends)" 
                className="w-full bg-white border-none rounded-2xl px-4 py-3 text-sm"
                value={newEntry.area}
                onChange={e => setNewEntry({...newEntry, area: e.target.value})}
              />
              <textarea 
                placeholder="How does it feel? Any changes?" 
                className="w-full bg-white border-none rounded-2xl px-4 py-3 text-sm min-h-[120px]"
                value={newEntry.note}
                onChange={e => setNewEntry({...newEntry, note: e.target.value})}
              />
              <Button onClick={onSave} className="w-full">Save Entry</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {entries.map((entry: ProgressEntry, idx: number) => (
          <motion.div 
            layout 
            key={entry.id} 
            className={cn(
              "md:col-span-2",
              idx % 3 === 0 ? "md:col-span-2 md:row-span-2" : "md:col-span-1"
            )}
          >
            <Card className="p-0 overflow-hidden group h-full">
              {entry.imageUrl && (
                <div className="relative h-48 overflow-hidden border-b-1.5 border-border-bold">
                  <img src={entry.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" />
                  <div className="absolute top-4 left-4 bg-white border-1.5 border-border-bold text-text-main text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest">
                    {formatDate(entry.date?.toDate?.() || new Date())}
                  </div>
                </div>
              )}
              <div className="p-5 flex flex-col h-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] uppercase font-black text-brand tracking-widest">{entry.area || 'General'}</span>
                  {!entry.imageUrl && <span className="text-[10px] text-text-sub font-bold uppercase">• {formatDate(entry.date?.toDate?.() || new Date())}</span>}
                </div>
                <p className="text-stone-700 leading-relaxed font-serif italic flex-grow">{entry.note}</p>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => deleteDoc(doc(db, `users/${uid}/progress`, entry.id))} className="text-red-200 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function TrendsView({ logs, entries }: { logs: DailyLog[], entries: ProgressEntry[] }) {
  const chartData = [...logs].reverse().map(l => ({
    date: l.date.split('-').slice(1).join('/'),
    steps: l.steps,
    water: (l.water || 0) / 100, // Scale water to match steps visually
    activity: ((Number(l.exercises || 0) + Number(l.yoga || 0) + Number(l.meditation || 0))) * 1000 // Scale activity for visibility
  }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header>
        <h1 className="text-4xl mb-2">Journey Visualized</h1>
        <p className="text-stone-500 font-serif italic">Watching your consistency grow.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title="Activity Trends" subtitle="Daily movement overview" className="md:col-span-3">
          <div className="h-80 w-full pt-8">
            <ResponsiveContainer width="100%" height="100%">
              <ReChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E0E4E1" />
                <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} fontBold="bold" />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1.5px solid #1A1C19', boxShadow: 'none' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="water" 
                  stroke="#3B82F6" 
                  strokeWidth={2} 
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="activity"
                  fill="#D4A373"
                  fillOpacity={0.1}
                  stroke="#D4A373"
                  strokeWidth={2}
                />
                <Line 
                  type="stepAfter" 
                  dataKey="steps" 
                  stroke="#7B8E7E" 
                  strokeWidth={4} 
                  dot={{ r: 4, fill: '#7B8E7E', strokeWidth: 0 }} 
                  activeDot={{ r: 6, stroke: '#1A1C19', strokeWidth: 2 }} 
                />
              </ReChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Progress" className="bg-brand text-white border-border-bold flex items-center justify-center text-center">
            <h4 className="text-6xl font-serif italic mb-2 leading-none">{entries.length}</h4>
            <p className="text-[10px] text-white/50 uppercase tracking-widest font-black">Entries Logged</p>
        </Card>

        <Card title="Wellness Habits" className="md:col-span-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {['Consistency', 'Hydration', 'Sunlight', 'Sleep'].map((habit, i) => (
              <div key={habit}>
                <label className="block mb-2">{habit}</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[...Array(7)].map((_, j) => (
                    <div key={j} className={cn("w-3 h-3 rounded-sm border", j < (7 - i) ? "bg-accent border-border-bold" : "bg-border border-border")} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

function ReminderView({ uid, reminders }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [newRem, setNewRem] = useState<Partial<Reminder>>({ title: '', time: '09:00', type: 'medicine' });

  const onSave = async () => {
    await addDoc(collection(db, `users/${uid}/reminders`), { ...newRem, enabled: true });
    setIsAdding(false);
  };

  const toggle = async (id: string, state: boolean) => {
    await updateDoc(doc(db, `users/${uid}/reminders`, id), { enabled: !state });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl">Reminders</h1>
        <Button variant="secondary" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Close' : 'Add Schedule'}
        </Button>
      </div>

      {isAdding && (
        <Card className="border-accent bg-accent/5">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 space-y-4 w-full">
              <input 
                placeholder="Medicine / Remedy name..." 
                className="w-full bg-border/30 border-1.5 border-border rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-border-bold outline-none"
                value={newRem.title} 
                onChange={e => setNewRem({...newRem, title: e.target.value})}
              />
              <div className="flex gap-4">
                <input 
                   type="time" 
                   className="flex-1 bg-border/30 border-1.5 border-border rounded-xl px-4 py-3 text-sm outline-none"
                   value={newRem.time}
                   onChange={e => setNewRem({...newRem, time: e.target.value})}
                />
                <select 
                  className="flex-1 bg-border/30 border-1.5 border-border rounded-xl px-4 py-3 text-sm outline-none"
                  value={newRem.type}
                  onChange={e => setNewRem({...newRem, type: e.target.value as any})}
                >
                  <option value="medicine">Medicine</option>
                  <option value="remedy">Remedy</option>
                  <option value="water">Water</option>
                </select>
              </div>
            </div>
            <Button onClick={onSave} className="shrink-0">Create</Button>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {reminders.map((rem: Reminder) => (
          <Card 
            key={rem.id} 
            className={cn(
              "flex items-center justify-between transition-all px-8",
              !rem.enabled && "opacity-50 grayscale"
            )}
          >
            <div className="flex items-center gap-6">
              <span className="text-3xl font-serif italic text-brand w-24">{rem.time}</span>
              <div>
                <h4 className="text-xl leading-none mb-1">{rem.title}</h4>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    rem.type === 'medicine' ? "bg-red-400" : (rem.type === 'remedy' ? "bg-brand" : "bg-blue-400")
                  )} />
                  <span className="text-[10px] uppercase font-bold tracking-widest opacity-40">{rem.type}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => toggle(rem.id, rem.enabled)}
                className={cn(
                  "w-12 h-6 rounded-full relative transition-all duration-300",
                  rem.enabled ? "bg-brand" : "bg-stone-200"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                  rem.enabled ? "left-7" : "left-1"
                )} />
              </button>
              <button onClick={() => deleteDoc(doc(db, `users/${uid}/reminders`, rem.id))} className="text-stone-300 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}

const EXERCISE_ROADMAP = [
  { id: 'ex_1', title: "Jumping Jacks", difficulty: 'Basic', seed: 'jumping-jacks', desc: 'Jump with legs spread and hands touching.' },
  { id: 'ex_2', title: "Wall Sit", difficulty: 'Basic', seed: 'sit-wall', desc: 'Hold a sitting position against a wall.' },
  { id: 'ex_3', title: "Push-ups", difficulty: 'Basic', seed: 'push-up', desc: 'Lower and raise your body using your arms.' },
  { id: 'ex_4', title: "Plank", difficulty: 'Intermediate', seed: 'plank-exercise', desc: 'Hold a push-up position on your elbows.' },
  { id: 'ex_5', title: "Burpees", difficulty: 'Intermediate', seed: 'burpee', desc: 'Squat, jump back, push up, and jump up.' },
  { id: 'ex_6', title: "Squat Jumps", difficulty: 'Intermediate', seed: 'squat-jump', desc: 'Perform a squat then jump explosively.' }
];

const YOGA_ROADMAP = [
  { id: 'yo_1', title: "Mountain Pose", difficulty: 'Basic', seed: 'yoga-mountain', desc: 'Stand tall with feet together and arms at sides.' },
  { id: 'yo_2', title: "Tree Pose", difficulty: 'Basic', seed: 'yoga-tree', desc: 'Balance on one leg with other foot on inner thigh.' },
  { id: 'yo_3', title: "Cobra Pose", difficulty: 'Basic', seed: 'yoga-cobra', desc: 'Lie prone and lift chest with arms.' },
  { id: 'yo_4', title: "Downward Dog", difficulty: 'Intermediate', seed: 'yoga-dog', desc: 'Create an inverted V-shape with your body.' },
  { id: 'yo_5', title: "Warrior II", difficulty: 'Intermediate', seed: 'yoga-warrior', desc: 'Wide stance with one knee bent and arms extended.' },
  { id: 'yo_6', title: "Crow Pose", difficulty: 'Intermediate', seed: 'yoga-crow', desc: 'Balance your body on your hands.' }
];

function RoadmapView({ uid }: { uid: string }) {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsub = onSnapshot(doc(db, `users/${uid}/roadmap`, 'progress'), (snap) => {
      if (snap.exists()) {
        setCompleted(snap.data().completed || {});
      }
    });
    return unsub;
  }, [uid]);

  const toggle = async (id: string) => {
    const newStatus = !completed[id];
    await setDoc(doc(db, `users/${uid}/roadmap`, 'progress'), {
      completed: { ...completed, [id]: newStatus }
    }, { merge: true });
  };

  const renderSection = (title: string, items: typeof EXERCISE_ROADMAP, icon: React.ReactNode) => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-brand text-white rounded-2xl">
          {icon}
        </div>
        <div>
          <h2 className="text-2xl font-serif italic">{title} Path</h2>
          <p className="text-[10px] uppercase font-black tracking-widest opacity-40">Basic to Intermediate</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {items.map((item, idx) => (
          <Card key={item.id} className={cn(
            "p-0 overflow-hidden group transition-all duration-500",
            completed[item.id] && "opacity-60 grayscale-[0.5]"
          )}>
            <div className="flex flex-col md:flex-row h-full">
              <div className="w-full md:w-32 h-32 md:h-auto overflow-hidden relative border-b md:border-b-0 md:border-r border-border-bold">
                <img 
                  src={`https://picsum.photos/seed/${item.seed}/400/400`} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm border border-border-bold text-[8px] font-black uppercase px-2 py-0.5 rounded-full">
                  STEP 0{idx + 1}
                </div>
              </div>
              <div className="flex-1 p-5 flex flex-col justify-center">
                 <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className={cn(
                        "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-border-bold",
                        item.difficulty === 'Basic' ? 'bg-accent/40' : 'bg-brand/10'
                      )}>
                        {item.difficulty}
                      </span>
                      <h3 className="text-lg font-bold mt-1 leading-tight">{item.title}</h3>
                    </div>
                    <button 
                      onClick={() => toggle(item.id)}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all",
                        completed[item.id] 
                          ? "bg-brand border-brand text-white shadow-lg shadow-brand/20" 
                          : "border-border-bold text-transparent hover:border-brand"
                      )}
                    >
                      <CircleCheckBig className="w-4 h-4" />
                    </button>
                 </div>
                 <p className="text-xs text-text-sub font-serif italic line-clamp-2">{item.desc}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const totalEx = EXERCISE_ROADMAP.filter(i => completed[i.id]).length;
  const totalYo = YOGA_ROADMAP.filter(i => completed[i.id]).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12 pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-border p-8 rounded-[40px] border-2 border-border-bold">
        <div>
          <h1 className="text-4xl mb-2">Consistency Path</h1>
          <p className="text-stone-500 font-serif italic">Your journey from foundational wellness to intermediate strength.</p>
        </div>
        <div className="flex gap-4">
          <div className="text-center px-4 py-2 bg-white rounded-2xl border-1.5 border-border-bold">
             <div className="text-[9px] uppercase font-black opacity-30">Exercises</div>
             <div className="text-xl font-serif italic font-bold">{totalEx}/{EXERCISE_ROADMAP.length}</div>
          </div>
          <div className="text-center px-4 py-2 bg-white rounded-2xl border-1.5 border-border-bold">
             <div className="text-[9px] uppercase font-black opacity-30">Yoga</div>
             <div className="text-xl font-serif italic font-bold">{totalYo}/{YOGA_ROADMAP.length}</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {renderSection("Strength", EXERCISE_ROADMAP, <Footprints className="w-6 h-6" />)}
        {renderSection("Flow", YOGA_ROADMAP, <Leaf className="w-6 h-6" />)}
      </div>
    </motion.div>
  );
}

function ChatView() {
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const CALMING_QUOTES = [
    "The soul always knows what to do to heal itself. The challenge is to silence the mind.",
    "Within you, there is a stillness and a sanctuary to which you can retreat at any time and be yourself.",
    "Joy is the simplest form of gratitude. Let's find a reason to smile today.",
    "Your heart is the size of an ocean. Go find yourself in its hidden depths.",
    "Peace is the result of retraining your mind to process life as it is, rather than as you think it should be.",
    "Blessed are the ones who can see beauty in simple things.",
    "The quieter you become, the more you are able to hear."
  ];

  useEffect(() => {
    if (messages.length === 0) {
      const quote = CALMING_QUOTES[Math.floor(Math.random() * CALMING_QUOTES.length)];
      setIsTyping(true);
      setTimeout(() => {
        setMessages([{ role: 'model', text: `Welcome, dear seeker. I was just reflecting on this: "${quote}" How are you feeling in this moment?` }]);
        setIsTyping(false);
      }, 1000);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      const history: ChatMessage[] = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));
      const response = await sendMessageToAura(history, userMsg);
      setMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: "I'm here for you. Sometimes silence is okay too. Let's breathe together." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="max-w-4xl mx-auto h-[80vh] flex flex-col bg-white border-1.5 border-border-bold rounded-3xl overflow-hidden shadow-2xl relative"
    >
      {/* Visual Atmosphere Background */}
      <div className="absolute inset-0 pointer-events-none opacity-5 animate-pulse">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,#7B8E7E_0%,transparent_70%)]" />
      </div>

      <header className="p-6 border-b border-border bg-white/80 backdrop-blur-md flex items-center justify-between relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center border-1.5 border-border-bold">
            <Sparkles className="w-5 h-5 text-brand" />
          </div>
          <div>
            <h1 className="text-xl leading-none font-serif italic font-bold">Aura</h1>
            <p className="text-[10px] uppercase font-black tracking-widest text-[#7B8E7E] mt-1">Calming Presence</p>
          </div>
        </div>
        <div className="text-[10px] text-text-sub font-bold uppercase flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
           Holistic Harmony
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide relative z-10">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
            <Leaf className="w-12 h-12 text-brand" />
            <p className="font-serif italic text-lg max-w-xs">"Nature does not hurry, yet everything is accomplished."</p>
            <p className="text-xs uppercase font-black tracking-widest">Share whatever weighs on your heart.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={i} 
            className={cn(
              "flex flex-col max-w-[85%]",
              m.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
            )}
          >
            <div className={cn(
              "p-5 rounded-2xl text-sm leading-relaxed",
              m.role === 'user' 
                ? "bg-border-bold text-white shadow-lg" 
                : "bg-accent border-1.5 border-border-bold text-text-main font-serif italic"
            )}>
              {m.text}
            </div>
            <span className="text-[8px] uppercase font-black tracking-widest mt-2 opacity-30">
              {m.role === 'user' ? 'You' : 'Aura'}
            </span>
          </motion.div>
        ))}
        {isTyping && (
           <div className="flex items-center gap-1 opacity-40 ml-2">
             <div className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce" />
             <div className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce [animation-delay:0.2s]" />
             <div className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce [animation-delay:0.4s]" />
           </div>
        )}
        <div ref={scrollRef} />
      </div>

      <div className="p-6 bg-white border-t border-border relative z-10">
        <div className="flex gap-4 p-2 bg-bg border-1.5 border-border-bold rounded-2xl items-center">
          <input 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSend()}
            placeholder="Exhale your thoughts here..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium px-4 py-2"
          />
          <button 
            onClick={onSend}
            disabled={!input.trim()}
            className="w-10 h-10 bg-brand text-white rounded-xl flex items-center justify-center border-1.5 border-border-bold hover:bg-brand-dark transition-all disabled:grayscale disabled:opacity-20"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[9px] text-center mt-4 text-text-sub uppercase tracking-wider opacity-30 italic">
          Aura is an AI companion for wellness support. Not a replacement for professional clinical care.
        </p>
      </div>
    </motion.div>
  );
}

function ProfileView({ user, profile, onLogout, onUpdateProfile }: any) {
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState({
    age: profile.age || 25,
    height: profile.height || 170,
    weight: profile.weight || 65,
    skinType: profile.skinType || 'Unknown',
    hairType: profile.hairType || 'Unknown',
    concerns: profile.concerns || []
  });
  const [advice, setAdvice] = useState<BodyAdvice | null>(null);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);

  const bmi = profile.weight / ((profile.height / 100) ** 2);

  useEffect(() => {
    if (profile.age && profile.height && profile.weight) {
      loadAdvice();
    }
  }, [profile]);

  const loadAdvice = async () => {
    setIsAdviceLoading(true);
    const result = await getBodyAdvice(profile.age, profile.height, profile.weight, bmi, profile.concerns || []);
    setAdvice(result);
    setIsAdviceLoading(false);
  };

  const save = async () => {
    await setDoc(doc(db, 'users', user.uid), data);
    onUpdateProfile(data);
    setEditing(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <header className="flex flex-col items-center text-center p-8 bg-white border-1.5 border-border-bold rounded-xl mb-4">
        <div className="relative group">
          <div className="w-24 h-24 rounded-xl border-1.5 border-border-bold shadow-sm mb-4 overflow-hidden bg-accent flex items-center justify-center transform group-hover:rotate-3 transition-transform">
            {user.photoURL ? (
              <img src={user.photoURL} className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-text-main" />
            )}
          </div>
        </div>
        <h1 className="text-3xl mb-1">{user.displayName || 'Nature Seeker'}</h1>
        <p className="text-text-sub font-serif italic text-sm">{user.email}</p>
        <div className="mt-4 flex gap-4">
           <div className="text-center">
             <div className="text-[10px] uppercase font-black tracking-widest opacity-40">Age</div>
             <div className="font-bold">{profile.age}y</div>
           </div>
           <div className="border-r border-border h-8 mx-2" />
           <div className="text-center">
             <div className="text-[10px] uppercase font-black tracking-widest opacity-40">Height</div>
             <div className="font-bold">{profile.height}cm</div>
           </div>
           <div className="border-r border-border h-8 mx-2" />
           <div className="text-center">
             <div className="text-[10px] uppercase font-black tracking-widest opacity-40">Weight</div>
             <div className="font-bold">{profile.weight}kg</div>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Core Metrics Bento Card */}
        <Card title="Body Metrics" className="md:col-span-2">
          {editing ? (
            <div className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-[10px] font-black opacity-30 uppercase mb-1 block">Age</label>
                    <input type="number" className="w-full p-3 rounded-xl bg-bg border border-border font-bold text-sm" value={data.age} onChange={e => setData({...data, age: parseInt(e.target.value)})}/>
                 </div>
                 <div>
                    <label className="text-[10px] font-black opacity-30 uppercase mb-1 block">BMI</label>
                    <div className="w-full p-3 rounded-xl bg-border/20 border border-border font-bold text-sm">{bmi.toFixed(1)}</div>
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-[10px] font-black opacity-30 uppercase mb-1 block">Height (cm)</label>
                    <input type="number" className="w-full p-3 rounded-xl bg-bg border border-border font-bold text-sm" value={data.height} onChange={e => setData({...data, height: parseInt(e.target.value)})}/>
                 </div>
                 <div>
                    <label className="text-[10px] font-black opacity-30 uppercase mb-1 block">Weight (kg)</label>
                    <input type="number" className="w-full p-3 rounded-xl bg-bg border border-border font-bold text-sm" value={data.weight} onChange={e => setData({...data, weight: parseInt(e.target.value)})}/>
                 </div>
               </div>
               <div className="flex gap-2 pt-2">
                 <Button onClick={save} className="flex-1">Save</Button>
                 <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
               </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-grow space-y-4">
                 <div className="flex justify-between items-end border-b border-border pb-3">
                   <div>
                     <div className="text-[10px] font-black opacity-40 uppercase">Your Body Mass Index</div>
                     <div className="text-3xl font-serif italic text-brand font-bold">{bmi.toFixed(1)}</div>
                   </div>
                   <div className="text-xs font-bold uppercase tracking-wider bg-accent px-3 py-1 rounded-full border-1.5 border-border-bold">
                     {advice?.bmiCategory || 'Calculating...'}
                   </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4 pt-2">
                   <div className="bg-bg p-3 rounded-xl">
                      <div className="text-[10px] font-black opacity-40 uppercase mb-1">Skin</div>
                      <div className="font-bold text-xs">{profile.skinType}</div>
                   </div>
                   <div className="bg-bg p-3 rounded-xl">
                      <div className="text-[10px] font-black opacity-40 uppercase mb-1">Hair</div>
                      <div className="font-bold text-xs">{profile.hairType}</div>
                   </div>
                 </div>
              </div>
              <Button variant="secondary" className="w-full mt-6" onClick={() => setEditing(true)}>Edit Stats</Button>
            </div>
          )}
        </Card>

        {/* AI Health Advice Card */}
        <Card title="Body Wisdom" className="md:col-span-2 bg-[#F0F2EF]">
           {isAdviceLoading ? (
             <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <Sparkles className="w-8 h-8 text-brand animate-spin" />
                <p className="text-xs font-black uppercase tracking-widest text-text-sub animate-pulse">Personalizing Insight...</p>
             </div>
           ) : advice ? (
             <div className="space-y-4">
                <div>
                   <h4 className="text-[10px] font-black uppercase tracking-tighter text-brand mb-2">Facts About You</h4>
                   <ul className="space-y-2">
                      {advice.bodyFacts.map((f, i) => (
                        <li key={i} className="text-xs leading-relaxed font-serif italic border-l-2 border-brand pl-3">{f}</li>
                      ))}
                   </ul>
                </div>
                <div className="pt-2">
                   <h4 className="text-[10px] font-black uppercase tracking-tighter text-text-main mb-1">Actionable Growth</h4>
                   <p className="text-[11px] leading-relaxed opacity-70 underline decoration-accent underline-offset-4">{advice.weightAdvice}</p>
                   <p className="text-[11px] mt-2 leading-relaxed opacity-70 underline decoration-accent underline-offset-4">{advice.heightAdvice}</p>
                </div>
             </div>
           ) : (
             <div className="text-center py-10">
                <Button variant="secondary" size="sm" onClick={loadAdvice}>Generate Advice</Button>
             </div>
           )}
        </Card>

        {/* Personality & Confidence */}
        <Card title="Personality & Aura" className="md:col-span-3 bg-brand text-white border-border-bold">
           {advice && (
             <div className="grid md:grid-cols-3 gap-6">
                {advice.personalityHealthTips.map((tip, i) => (
                  <div key={i} className="bg-white/10 p-4 rounded-xl border border-white/10 group hover:bg-white/20 transition-all">
                     <div className="text-2xl font-serif italic mb-2 opacity-50">0{i+1}</div>
                     <p className="text-xs leading-relaxed font-medium">{tip}</p>
                  </div>
                ))}
             </div>
           )}
        </Card>

        {/* Quick Sign Out */}
        <Card className="flex flex-col justify-center items-center text-center p-4">
          <Button variant="danger" className="w-full py-6 text-xs" onClick={onLogout}>Sign Out</Button>
          <div className="mt-4 flex items-center gap-2 opacity-20 group hover:opacity-100 transition-opacity">
            <AlertCircle className="w-3 h-3" />
            <span className="text-[8px] font-black uppercase tracking-widest">Natural Path First</span>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

function NavButton({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 group transition-all w-16",
        active ? "text-text-main" : "text-text-sub hover:text-text-main"
      )}
    >
      <div className={cn(
        "p-3 rounded-xl transition-all border-1.5",
        active ? "bg-accent border-border-bold" : "bg-transparent border-transparent group-hover:bg-border"
      )}>
        {React.cloneElement(icon, { size: active ? 24 : 22, strokeWidth: active ? 2.5 : 2.5 })}
      </div>
      <span className={cn(
        "text-[10px] font-black uppercase tracking-widest hidden md:block mt-1",
        active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}>
        {label}
      </span>
    </button>
  );
}
