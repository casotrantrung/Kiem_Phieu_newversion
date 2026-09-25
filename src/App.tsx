import React, { useState, useEffect, useMemo } from 'react';
import {
  Vote,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Plus,
  Minus,
  RotateCcw,
  Printer,
  BarChart3,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Trash2,
  Award,
  Info,
  Percent,
  Wifi,
  WifiOff,
  Settings,
  Check,
  CheckSquare,
  Smartphone,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  ReferenceLine,
} from 'recharts';

// Import Firebase SDK (Modular v9/v10/v11)
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  onValue,
  set,
  Database,
} from 'firebase/database';

// --- ĐỊNH NGHĨA KIỂU DỮ LIỆU ---
interface Candidate {
  id: string;
  name: string;
}

interface ElectionData {
  totalCollectedBallots: number;
  candidates: Candidate[];
  candidateVotes: Record<string, number>; // candidateId -> số phiếu
  invalidVotes: number;
  isFinalized: boolean;
  finalizedTime: string | null;
  lastUpdated?: number;
}

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Bảng màu sắc cho các ứng viên
const BAR_COLORS = [
  '#2563EB', // Xanh dương
  '#0D9488', // Xanh mòng két
  '#D97706', // Hổ phách
  '#7C3AED', // Tím hoa cà
  '#0284C7', // Xanh da trời
  '#EA580C', // Cam đất
  '#4F46E5', // Chàm
  '#16A34A', // Xanh lá
  '#C026D3', // Hồng fuchsia
  '#475569', // Xám chì
];
const INVALID_BAR_COLOR = '#EF4444'; // Đỏ cảnh báo

// Dữ liệu ứng viên mặc định ban đầu
const DEFAULT_CANDIDATES: Candidate[] = [
  { id: 'cand_1', name: 'Nguyễn Văn An' },
  { id: 'cand_2', name: 'Trần Thị Mai' },
  { id: 'cand_3', name: 'Lê Hoàng Long' },
  { id: 'cand_4', name: 'Phạm Minh Đức' },
];

const INITIAL_ELECTION_STATE: ElectionData = {
  totalCollectedBallots: 44,
  candidates: DEFAULT_CANDIDATES,
  candidateVotes: {
    cand_1: 0,
    cand_2: 0,
    cand_3: 0,
    cand_4: 0,
  },
  invalidVotes: 0,
  isFinalized: false,
  finalizedTime: null,
};

// Cấu hình Firebase
const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: 'AIzaSyCirEx-RQ0zCzHqLJn4lC68NeRg-k1xBlk',
  authDomain: 'kiemphieu48.firebaseapp.com',
  databaseURL: 'https://kiemphieu48-default-rtdb.firebaseio.com',
  projectId: 'kiemphieu48',
  storageBucket: 'kiemphieu48.firebasestorage.app',
  messagingSenderId: '653307231033',
  appId: '1:653307231033:web:58659b8956624fadaec6e8',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'counting' | 'dashboard'>('counting');

  // --- CẤU HÌNH FIREBASE VÀ KẾT NỐI REALTIME ---
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseConfig>(() => {
    try {
      const saved = localStorage.getItem('kiemphieu_firebase_config');
      return saved ? JSON.parse(saved) : DEFAULT_FIREBASE_CONFIG;
    } catch {
      return DEFAULT_FIREBASE_CONFIG;
    }
  });

  const [dbInstance, setDbInstance] = useState<Database | null>(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);

  // --- DỮ LIỆU CUỘC BẦU CỬ ĐƯỢC ĐỒNG BỘ REALTIME ---
  const [electionData, setElectionData] = useState<ElectionData>(() => {
    try {
      const saved = localStorage.getItem('kiemphieu_local_backup');
      return saved ? JSON.parse(saved) : INITIAL_ELECTION_STATE;
    } catch {
      return INITIAL_ELECTION_STATE;
    }
  });

  const [newCandidateName, setNewCandidateName] = useState<string>('');
  const [isSettingsExpanded, setIsSettingsExpanded] = useState<boolean>(false); // Thu gọn mặc định trên mobile để dễ nhìn bàn đếm
  const [sortByVotes, setSortByVotes] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showFinalizeModal, setShowFinalizeModal] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Chưa kết nối');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Khởi tạo Firebase App và thiết lập Realtime Listener
  useEffect(() => {
    if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) {
      setIsFirebaseConnected(false);
      setFirebaseError('Chưa cấu hình Firebase Realtime Database.');
      return;
    }

    try {
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      const db = getDatabase(app);
      setDbInstance(db);
      setFirebaseError(null);

      // Lắng nghe dữ liệu theo thời gian thực (Realtime Listener)
      const electionRef = ref(db, 'election_session_live_v2');
      const unsubscribe = onValue(
        electionRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val() as any;

            let candidateVotes: Record<string, number> = {};
            if (data.candidateVotes) {
              candidateVotes = data.candidateVotes;
            } else if (data.zones && Array.isArray(data.zones)) {
              data.zones.forEach((z: any) => {
                if (z.candidateVotes) {
                  Object.entries(z.candidateVotes).forEach(([cid, v]) => {
                    candidateVotes[cid] = (candidateVotes[cid] || 0) + Number(v || 0);
                  });
                }
              });
            }

            const safeData: ElectionData = {
              totalCollectedBallots: data.totalCollectedBallots || 44,
              candidates: data.candidates || DEFAULT_CANDIDATES,
              candidateVotes: candidateVotes,
              invalidVotes: data.invalidVotes || 0,
              isFinalized: !!data.isFinalized,
              finalizedTime: data.finalizedTime || null,
              lastUpdated: data.lastUpdated || Date.now(),
            };
            setElectionData(safeData);
            setIsFirebaseConnected(true);
            setLastSyncTime(new Date().toLocaleTimeString('vi-VN'));
            localStorage.setItem('kiemphieu_local_backup', JSON.stringify(safeData));
          } else {
            // Chưa có dữ liệu trên node, đưa dữ liệu khởi tạo lên
            set(electionRef, {
              ...INITIAL_ELECTION_STATE,
              lastUpdated: Date.now(),
            });
            setIsFirebaseConnected(true);
          }
        },
        (error) => {
          console.error('Firebase error:', error);
          setFirebaseError('Lỗi kết nối Firebase: ' + error.message);
          setIsFirebaseConnected(false);
        }
      );

      return () => unsubscribe();
    } catch (err: any) {
      console.error('Init error:', err);
      setFirebaseError('Khởi tạo Firebase thất bại: ' + err.message);
      setIsFirebaseConnected(false);
    }
  }, [firebaseConfig]);

  // HÀM GHI DỮ LIỆU ĐỒNG BỘ LÊN FIREBASE
  const syncElectionUpdate = (updater: (prev: ElectionData) => ElectionData) => {
    const updated = updater(electionData);
    updated.lastUpdated = Date.now();

    if (dbInstance && isFirebaseConnected) {
      const electionRef = ref(dbInstance, 'election_session_live_v2');
      set(electionRef, updated).catch((err) => {
        showToast('Lỗi ghi dữ liệu lên Firebase: ' + err.message);
      });
    } else {
      setElectionData(updated);
      localStorage.setItem('kiemphieu_local_backup', JSON.stringify(updated));
    }
  };

  // --- CÁC HÀM XỬ LÝ SỰ KIỆN KIỂM PHIẾU ---
  const handleTotalCollectedChange = (newVal: number) => {
    const val = Math.max(1, newVal);
    syncElectionUpdate((prev) => ({
      ...prev,
      totalCollectedBallots: val,
    }));
  };

  const handleAddCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCandidateName.trim();
    if (!name) return;
    if (electionData.candidates.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      showToast('Người được bầu này đã có trong danh sách!');
      return;
    }

    const newId = `cand_${Date.now()}`;
    const newCand: Candidate = { id: newId, name };

    syncElectionUpdate((prev) => ({
      ...prev,
      candidates: [...prev.candidates, newCand],
      candidateVotes: {
        ...(prev.candidateVotes || {}),
        [newId]: 0,
      },
    }));

    setNewCandidateName('');
    showToast(`Đã thêm ứng viên: ${name}`);
  };

  const handleRemoveCandidate = (candidateId: string) => {
    if (electionData.candidates.length <= 1) {
      showToast('Danh sách phải có ít nhất 1 người được bầu!');
      return;
    }
    const cand = electionData.candidates.find((c) => c.id === candidateId);
    if (!cand) return;

    if (
      window.confirm(
        `Xác nhận xóa "${cand.name}"? Dữ liệu của người này sẽ bị xóa trên tất cả các máy đang kết nối.`
      )
    ) {
      syncElectionUpdate((prev) => {
        const updatedVotes = { ...(prev.candidateVotes || {}) };
        delete updatedVotes[candidateId];
        return {
          ...prev,
          candidates: prev.candidates.filter((c) => c.id !== candidateId),
          candidateVotes: updatedVotes,
        };
      });
      showToast(`Đã xóa: ${cand.name}`);
    }
  };

  // CỘNG 1 PHIẾU CHO ỨNG VIÊN
  const handleAddVote = (candidateId: string) => {
    if (electionData.isFinalized) {
      showToast('Kiểm phiếu đã hoàn thành và được khóa!');
      return;
    }

    syncElectionUpdate((prev) => {
      const current = (prev.candidateVotes && prev.candidateVotes[candidateId]) || 0;
      return {
        ...prev,
        candidateVotes: {
          ...(prev.candidateVotes || {}),
          [candidateId]: current + 1,
        },
      };
    });
  };

  // GIẢM 1 PHIẾU CHO ỨNG VIÊN (HOÀN TÁC)
  const handleSubtractVote = (candidateId: string) => {
    if (electionData.isFinalized) {
      showToast('Kiểm phiếu đã hoàn thành và được khóa!');
      return;
    }

    syncElectionUpdate((prev) => {
      const current = (prev.candidateVotes && prev.candidateVotes[candidateId]) || 0;
      if (current <= 0) return prev;
      return {
        ...prev,
        candidateVotes: {
          ...(prev.candidateVotes || {}),
          [candidateId]: current - 1,
        },
      };
    });
  };

  // CỘNG 1 PHIẾU KHÔNG HỢP LỆ
  const handleAddInvalidVote = () => {
    if (electionData.isFinalized) {
      showToast('Kiểm phiếu đã hoàn thành và được khóa!');
      return;
    }

    syncElectionUpdate((prev) => ({
      ...prev,
      invalidVotes: (prev.invalidVotes || 0) + 1,
    }));
  };

  // GIẢM 1 PHIẾU KHÔNG HỢP LỆ
  const handleSubtractInvalidVote = () => {
    if (electionData.isFinalized) {
      showToast('Kiểm phiếu đã hoàn thành và được khóa!');
      return;
    }

    syncElectionUpdate((prev) => {
      const current = prev.invalidVotes || 0;
      if (current <= 0) return prev;
      return {
        ...prev,
        invalidVotes: current - 1,
      };
    });
  };

  // HOÀN THÀNH KIỂM PHIẾU
  const handleCompleteCounting = () => {
    const timeStr = new Date().toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    syncElectionUpdate((prev) => ({
      ...prev,
      isFinalized: true,
      finalizedTime: timeStr,
    }));
    setShowFinalizeModal(true);
  };

  // MỞ KHÓA KIỂM PHIẾU
  const handleUnlockCounting = () => {
    syncElectionUpdate((prev) => ({
      ...prev,
      isFinalized: false,
    }));
    showToast('Đã mở khóa kiểm phiếu!');
  };

  // ĐẶT LẠI TOÀN BỘ PHIẾU VỀ 0
  const handleResetVotes = () => {
    if (
      window.confirm(
        'Bạn có chắc chắn muốn đặt lại toàn bộ số phiếu về 0 trên TẤT CẢ các thiết bị đang kết nối?'
      )
    ) {
      syncElectionUpdate((prev) => {
        const resetVotes: Record<string, number> = {};
        prev.candidates.forEach((c) => {
          resetVotes[c.id] = 0;
        });
        return {
          ...prev,
          candidateVotes: resetVotes,
          invalidVotes: 0,
          isFinalized: false,
          finalizedTime: null,
        };
      });
      showToast('Đã đặt lại toàn bộ số phiếu về 0!');
    }
  };

  // NẠP DỮ LIỆU MẪU NHANH
  const handleLoadSampleData = () => {
    const sampleCandidates: Candidate[] = [
      { id: 'cand_1', name: 'Nguyễn Văn An' },
      { id: 'cand_2', name: 'Trần Thị Mai' },
      { id: 'cand_3', name: 'Lê Hoàng Long' },
      { id: 'cand_4', name: 'Phạm Minh Đức' },
    ];

    syncElectionUpdate(() => ({
      totalCollectedBallots: 44,
      candidates: sampleCandidates,
      candidateVotes: {
        cand_1: 40,
        cand_2: 33,
        cand_3: 24,
        cand_4: 15,
      },
      invalidVotes: 2,
      isFinalized: false,
      finalizedTime: null,
    }));
    showToast('Đã nạp dữ liệu mẫu: Nguyễn Văn An 40/44 phiếu (90.91%)!');
  };

  // --- TÍNH TOÁN DỮ LIỆU THỐNG KÊ (REACTIVE CHO TAB 2) ---
  const stats = useMemo(() => {
    const { candidates, candidateVotes, totalCollectedBallots, invalidVotes } = electionData;

    const totalInvalidBallots = invalidVotes || 0;

    // CÔNG THỨC: Số phiếu hợp lệ = Tổng số phiếu thu được - Số phiếu không hợp lệ
    const totalValidBallots = Math.max(0, totalCollectedBallots - totalInvalidBallots);

    // CÔNG THỨC MỚI: Tỉ lệ % = (Số phiếu bầu của ứng cử viên đó / Số phiếu hợp lệ) * 100
    const candidateRows = candidates.map((c) => {
      const votes = (candidateVotes && candidateVotes[c.id]) || 0;
      const percentageNum =
        totalValidBallots > 0 ? (votes / totalValidBallots) * 100 : 0;
      const percentageStr = percentageNum.toFixed(2);
      return {
        id: c.id,
        name: c.name,
        votes,
        percentageNum,
        percentageStr,
        isOverFifty: percentageNum > 50,
      };
    });

    if (sortByVotes) {
      candidateRows.sort((a, b) => b.votes - a.votes);
    }

    const invalidPercentageNum =
      totalCollectedBallots > 0
        ? (totalInvalidBallots / totalCollectedBallots) * 100
        : 0;
    const invalidPercentageStr = invalidPercentageNum.toFixed(2);

    // DỮ LIỆU BIỂU ĐỒ CỘT (RECHARTS BAR CHART): CHỈ HIỂN THỊ CÁC ỨNG CỬ VIÊN (ĐÃ BỎ PHIẾU KHÔNG HỢP LỆ)
    const barChartData = candidateRows.map((c, idx) => ({
      name: c.name,
      // Tên ngắn gọn cho trục X trên mobile (2 từ cuối của họ tên)
      shortName: c.name.split(' ').slice(-2).join(' '),
      votes: c.votes,
      percentage: Number(c.percentageStr),
      fillColor: BAR_COLORS[idx % BAR_COLORS.length],
      type: 'candidate',
    }));

    return {
      totalValidBallots,
      totalInvalidBallots,
      candidateRows,
      invalidPercentageStr,
      barChartData,
    };
  }, [electionData, sortByVotes]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-28 sm:pb-16 font-sans antialiased">
      {/* Toast thông báo nổi bật */}
      {toastMessage && (
        <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 z-50 bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-medium flex items-center gap-2.5 border border-slate-700 animate-in fade-in duration-200">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="flex-1">{toastMessage}</span>
        </div>
      )}

      {/* --- HEADER CHÍNH: TỐI ƯU CẢ MOBILE & DESKTOP --- */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
          <div className="h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
            {/* Logo & Tiêu đề */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <Vote className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight truncate">
                    Quản Lý Kiểm Phiếu
                  </h1>

                  {/* Đèn báo Realtime */}
                  {isFirebaseConnected ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="hidden xs:inline">Live</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      <span className="hidden xs:inline">Offline</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                  <span>Mẫu số: <strong className="text-blue-700 font-mono">{electionData.totalCollectedBallots}</strong> phiếu</span>
                  {electionData.isFinalized && (
                    <span className="text-emerald-700 font-bold ml-1 flex items-center">
                      · <Lock className="w-2.5 h-2.5 ml-0.5 mr-0.5" /> Đã chốt
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* TAB CHUYỂN ĐỔI TRÊN MÀN HÌNH MÁY TÍNH / IPAD (ẨN TRÊN MOBILE, DÙNG BOTTOM BAR) */}
            <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                onClick={() => setActiveTab('counting')}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'counting'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Tab 1: Kiểm phiếu</span>
              </button>
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <span>Tab 2: Giám sát</span>
                <span className="ml-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md font-mono">
                  Live
                </span>
              </button>
            </div>

            {/* Cài đặt Firebase & Tiện ích */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setShowConfigModal(true)}
                className={`p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 border ${
                  isFirebaseConnected
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                }`}
                title="Cấu hình Firebase Realtime"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden lg:inline">
                  {isFirebaseConnected ? 'Firebase Live' : 'Cấu hình Live'}
                </span>
              </button>

              <button
                onClick={handleLoadSampleData}
                title="Nạp dữ liệu mẫu nhanh (44 phiếu thu)"
                className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 border border-slate-200"
              >
                <RotateCcw className="w-4 h-4 text-slate-500" />
                <span className="hidden sm:inline">Mẫu</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* --- BANNER THÔNG TIN MẪU SỐ & CÔNG THỨC (GỌN GÀNG TRÊN MOBILE) --- */}
      <div className="bg-blue-50/90 border-b border-blue-200 px-3.5 py-2 text-[11px] sm:text-xs text-blue-900">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 truncate">
            <Percent className="w-3.5 h-3.5 text-blue-700 shrink-0" />
            <span className="truncate">
              <strong>Phiếu hợp lệ:</strong> {stats.totalValidBallots} = {electionData.totalCollectedBallots} (thu) - {electionData.invalidVotes || 0} (hỏng). Mẫu số tính % ứng viên:{' '}
              <strong className="font-mono">{stats.totalValidBallots}</strong>
            </span>
          </div>
          <button
            onClick={() => setActiveTab(activeTab === 'counting' ? 'dashboard' : 'counting')}
            className="text-[11px] font-bold text-blue-700 hover:underline shrink-0 hidden sm:block"
          >
            {activeTab === 'counting' ? 'Xem Dashboard →' : '← Về Bàn đếm'}
          </button>
        </div>
      </div>

      {/* --- NỘI DUNG CHÍNH --- */}
      <main className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-6 space-y-4 sm:space-y-6">
        {/* =========================================================================
            TAB 1: GIAO DIỆN KIỂM PHIẾU (GIAO DIỆN TỐI ƯU CẢM ỨNG TRÊN ĐIỆN THOẠI)
        ========================================================================= */}
        {activeTab === 'counting' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Header kiểm phiếu */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Bàn Đếm Phiếu Live
                  </h2>
                  {electionData.isFinalized ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                      <Lock className="w-3 h-3" /> Đã khóa
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800">
                      Sẵn sàng đếm
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chạm nút <strong>+1</strong> to rõ bên cạnh tên từng người hoặc phiếu không hợp lệ để ghi nhận.
                </p>
              </div>

              {/* Nút hành động */}
              <div className="flex items-center gap-2">
                {electionData.isFinalized ? (
                  <button
                    onClick={handleUnlockCounting}
                    className="flex-1 sm:flex-initial px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5 border border-slate-300 active:scale-98"
                  >
                    <Unlock className="w-3.5 h-3.5 text-slate-600" />
                    <span>Mở khóa đếm</span>
                  </button>
                ) : (
                  <button
                    onClick={handleCompleteCounting}
                    className="flex-1 sm:flex-initial px-4 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-98 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Chốt Kết Quả</span>
                  </button>
                )}

                <button
                  onClick={handleResetVotes}
                  className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-slate-200 transition-colors shrink-0"
                  title="Đặt lại toàn bộ số phiếu về 0"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 1. THIẾT LẬP THÔNG SỐ (CÓ THỂ THU GỌN ĐỂ TRÁNH CHIẾM MÀN HÌNH ĐIỆN THOẠI) */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div
                className="px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition-colors"
                onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs border border-blue-200 shrink-0">
                    ⚙️
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Cài đặt thông số bầu cử ({electionData.candidates.length} ứng viên · {electionData.totalCollectedBallots} phiếu)
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <span>{isSettingsExpanded ? 'Thu gọn' : 'Chỉnh sửa'}</span>
                  {isSettingsExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {isSettingsExpanded && (
                <div className="p-4 sm:p-5 space-y-4">
                  {/* Ô nhập Tổng số phiếu thu được */}
                  <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200">
                    <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-1">
                      Tổng số phiếu thu được (Mẫu số cố định):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        value={electionData.totalCollectedBallots}
                        onChange={(e) => handleTotalCollectedChange(parseInt(e.target.value) || 1)}
                        className="w-full pl-3 pr-16 py-2 bg-white border border-blue-300 rounded-lg text-base font-bold font-mono text-blue-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="absolute right-3 top-2.5 text-xs font-semibold text-blue-600">
                        phiếu
                      </span>
                    </div>
                  </div>

                  {/* Quản lý danh sách ứng viên */}
                  <div className="border-t border-slate-200 pt-4">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Thêm người được bầu:
                    </label>

                    <form onSubmit={handleAddCandidate} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nhập họ tên ứng viên..."
                        value={newCandidateName}
                        onChange={(e) => setNewCandidateName(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Thêm</span>
                      </button>
                    </form>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                      {electionData.candidates.map((c, index) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-200"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: BAR_COLORS[index % BAR_COLORS.length] }}
                            />
                            <span className="text-xs font-semibold text-slate-800 truncate">
                              {c.name}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCandidate(c.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* 2. BÀN ĐẾM PHIẾU TẬP TRUNG (GIAO DIỆN MOBILE TOUCH DỄ BẤM VỚI NGÓN TAY CÁI) */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-blue-600" />
                  <span>Danh Sách Đếm Phiếu Bầu</span>
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  {electionData.candidates.length} người được bầu
                </span>
              </div>

              {/* Danh sách thẻ ứng viên: Thẻ lớn, nút bấm to rộng cho điện thoại */}
              <div className="space-y-2.5">
                {electionData.candidates.map((c, cIndex) => {
                  const votes = (electionData.candidateVotes && electionData.candidateVotes[c.id]) || 0;
                  const pct =
                    stats.totalValidBallots > 0
                      ? ((votes / stats.totalValidBallots) * 100).toFixed(2)
                      : '0.00';
                  const isOverFifty = Number(pct) > 50;

                  return (
                    <div
                      key={c.id}
                      className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      {/* Thông tin ứng viên */}
                      <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: BAR_COLORS[cIndex % BAR_COLORS.length] }}
                          />
                          <div className="min-w-0">
                            <span className="text-sm sm:text-base font-bold text-slate-900 truncate block">
                              {c.name}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-500 mt-0.5">
                              <span>
                                Tỉ lệ:{' '}
                                <strong className="text-blue-700 font-mono font-bold">
                                  {pct}%
                                </strong>
                              </span>
                              {isOverFifty && (
                                <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded text-[10px]">
                                  Quá bán
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Điểm số hiển thị to trên mobile */}
                        <div className="text-right sm:hidden bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100">
                          <div className="text-lg font-extrabold font-mono text-slate-900 leading-none">
                            {votes}
                          </div>
                          <div className="text-[10px] text-slate-400">phiếu</div>
                        </div>
                      </div>

                      {/* Bộ nút đếm: Thiết kế nút to, bấm cực nhạy trên màn hình cảm ứng */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="hidden sm:block text-right mr-3">
                          <div className="text-base font-extrabold font-mono text-slate-900">
                            {votes} <span className="text-xs font-normal text-slate-400">phiếu</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          {/* Nút giảm -1 (Hoàn tác) */}
                          <button
                            type="button"
                            onClick={() => handleSubtractVote(c.id)}
                            disabled={votes <= 0 || electionData.isFinalized}
                            title="Giảm 1 phiếu (hoàn tác nếu ấn nhầm)"
                            className="h-11 sm:h-10 w-12 sm:w-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 active:scale-95 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-all shrink-0"
                          >
                            <Minus className="w-5 h-5 sm:w-4 sm:h-4" />
                          </button>

                          {/* Nút cộng +1 to rõ, chiếm phần lớn không gian trên mobile */}
                          <button
                            type="button"
                            onClick={() => handleAddVote(c.id)}
                            disabled={electionData.isFinalized}
                            className="flex-1 sm:flex-initial h-11 sm:h-10 px-5 sm:px-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                          >
                            <Plus className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
                            <span>Cộng 1 phiếu</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* THẺ ĐẾM PHIẾU KHÔNG HỢP LỆ (MÀU ĐỎ NỔI BẬT DƯỚI CÙNG) */}
                <div className="bg-rose-50/90 rounded-2xl border border-rose-200 p-3 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm sm:text-base font-bold text-rose-900 truncate block">
                          Phiếu không hợp lệ
                        </span>
                        <div className="text-[11px] sm:text-xs text-rose-700 mt-0.5">
                          Tỉ lệ:{' '}
                          <strong className="font-mono font-bold">
                            {electionData.totalCollectedBallots > 0
                              ? (((electionData.invalidVotes || 0) / electionData.totalCollectedBallots) * 100).toFixed(2)
                              : '0.00'}%
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="text-right sm:hidden bg-white/80 px-2.5 py-1 rounded-xl border border-rose-200">
                      <div className="text-lg font-extrabold font-mono text-rose-950 leading-none">
                        {electionData.invalidVotes || 0}
                      </div>
                      <div className="text-[10px] text-rose-500">phiếu</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-rose-200/60">
                    <div className="hidden sm:block text-right mr-3">
                      <div className="text-base font-extrabold font-mono text-rose-950">
                        {electionData.invalidVotes || 0} <span className="text-xs font-normal text-rose-600">phiếu</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleSubtractInvalidVote}
                        disabled={!electionData.invalidVotes || electionData.invalidVotes <= 0 || electionData.isFinalized}
                        title="Giảm 1 phiếu không hợp lệ"
                        className="h-11 sm:h-10 w-12 sm:w-10 rounded-xl border border-rose-300 bg-white text-rose-600 hover:bg-rose-100 active:scale-95 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-all shrink-0"
                      >
                        <Minus className="w-5 h-5 sm:w-4 sm:h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={handleAddInvalidVote}
                        disabled={electionData.isFinalized}
                        className="flex-1 sm:flex-initial h-11 sm:h-10 px-5 sm:px-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-sm font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                      >
                        <Plus className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
                        <span>Cộng 1 phiếu hỏng</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* =========================================================================
            TAB 2: GIAO DIỆN GIÁM SÁT (DASHBOARD TỐI ƯU CHO ĐIỆN THOẠI)
        ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Header Dashboard */}
            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Bảng Giám Sát Kết Quả Bầu Cử
                  </h2>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tự động đồng bộ số liệu Live từ các thành viên ban kiểm phiếu.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPrintModal(true)}
                  className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Printer className="w-4 h-4 text-slate-600" />
                  <span>In Biên bản</span>
                </button>
              </div>
            </div>

            {/* 1. THỐNG KÊ TỔNG QUAN: HIỂN THỊ DẠNG THẺ GỌN TRÊN MOBILE */}
            <section className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
              {/* Thẻ 1: Tổng số phiếu thu được */}
              <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-slate-500 text-[11px] sm:text-xs font-bold uppercase tracking-wider">
                  <span>Phiếu thu được</span>
                  <Vote className="w-4 h-4 text-blue-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-extrabold text-blue-900 font-mono">
                    {electionData.totalCollectedBallots}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">phiếu</span>
                </div>
                <div className="mt-1.5 text-[10px] sm:text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium truncate">
                  Mẫu số cố định tính %
                </div>
              </div>

              {/* Thẻ 2: Tổng số phiếu hợp lệ */}
              <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 text-[11px] sm:text-xs font-bold uppercase tracking-wider">
                  <span>Phiếu hợp lệ</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-extrabold text-emerald-700 font-mono">
                    {stats.totalValidBallots}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">phiếu</span>
                </div>
                <div className="mt-1.5 text-[10px] sm:text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium truncate">
                  = {electionData.totalCollectedBallots} - {electionData.invalidVotes || 0}
                </div>
              </div>

              {/* Thẻ 3: Tổng số phiếu không hợp lệ */}
              <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 text-[11px] sm:text-xs font-bold uppercase tracking-wider">
                  <span>Phiếu hỏng</span>
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-extrabold text-rose-700 font-mono">
                    {stats.totalInvalidBallots}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">phiếu</span>
                </div>
                <div className="mt-1.5 text-[10px] sm:text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded font-medium">
                  {stats.invalidPercentageStr}%
                </div>
              </div>
            </section>

            {/* 2. BIỂU ĐỒ CỘT (BAR CHART - RECHARTS) TỐI ƯU HIỂN THỊ MÀN HÌNH NHỎ */}
            <section className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                    <span>Biểu Đồ Tỉ Lệ Phần Trăm (%)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Trục Y: % trên số phiếu hợp lệ ({stats.totalValidBallots} phiếu) · Đường xanh: Mốc quá bán 50%
                  </p>
                </div>
              </div>

              <div className="h-64 sm:h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.barChartData}
                    margin={{ top: 25, right: 10, left: -20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis
                      dataKey="shortName"
                      tick={{ fill: '#334155', fontSize: 11, fontWeight: 500 }}
                      interval={0}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(val) => `${val}%`}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value: any, name: any, item: any) => [
                        `${value}% (${item.payload.votes} phiếu)`,
                        'Tỉ lệ đạt được',
                      ]}
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderRadius: '12px',
                        border: 'none',
                        color: '#FFF',
                        fontSize: '12px',
                      }}
                    />
                    <ReferenceLine
                      y={50}
                      stroke="#10B981"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: '50%',
                        position: 'right',
                        fill: '#059669',
                        fontSize: 10,
                        fontWeight: 'bold',
                      }}
                    />
                    <Bar dataKey="percentage" radius={[6, 6, 0, 0]} animationDuration={400}>
                      {stats.barChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fillColor} />
                      ))}
                      <LabelList
                        dataKey="percentage"
                        position="top"
                        formatter={(val: any) => `${val}%`}
                        style={{ fill: '#1E293B', fontSize: '11px', fontWeight: 'bold' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* 3. BẢNG CHI TIẾT: CÓ CHẾ ĐỘ THẺ THÔNG MINH TRÊN MOBILE & BẢNG TRÊN MÁY TÍNH */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-3.5 sm:p-5 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-base font-bold text-slate-900">
                    Bảng Thống Kê Chi Tiết
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    (Số phiếu đạt / {stats.totalValidBallots} phiếu hợp lệ) × 100%
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSortByVotes(!sortByVotes)}
                  className="px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  {sortByVotes ? '↓ Phiếu cao' : '↕ Mặc định'}
                </button>
              </div>

              {/* GIAO DIỆN DẠNG THẺ (DÀNH CHO ĐIỆN THOẠI - KHÔNG PHẢI CUỘN NGANG) */}
              <div className="block sm:hidden divide-y divide-slate-100 p-2">
                {stats.candidateRows.map((candidate, idx) => (
                  <div key={candidate.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 text-center font-mono text-xs text-slate-400 font-bold shrink-0">
                        {idx + 1}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: BAR_COLORS[idx % BAR_COLORS.length] }}
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900 block truncate">
                          {candidate.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({candidate.votes}/{stats.totalValidBallots}) × 100
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-extrabold font-mono text-blue-700">
                        {candidate.percentageStr}%
                      </div>
                      <div className="text-[11px] text-slate-600 font-mono">
                        {candidate.votes} phiếu
                        {candidate.isOverFifty && (
                          <span className="ml-1 text-[10px] text-emerald-600 font-bold">✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Hàng phiếu không hợp lệ trên mobile */}
                <div className="p-3 bg-rose-50/70 rounded-xl mt-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-rose-900 block">
                        Phiếu không hợp lệ
                      </span>
                      <span className="text-[10px] text-rose-600/80 font-mono">
                        ({stats.totalInvalidBallots}/{electionData.totalCollectedBallots}) × 100
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-extrabold font-mono text-rose-700">
                      {stats.invalidPercentageStr}%
                    </div>
                    <div className="text-[11px] text-rose-800 font-mono font-bold">
                      {stats.totalInvalidBallots} phiếu
                    </div>
                  </div>
                </div>
              </div>

              {/* BẢNG ĐẦY ĐỦ CHO TABLET VÀ MÁY TÍNH */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase">
                      <th className="py-3 px-4 w-14 text-center">STT</th>
                      <th className="py-3 px-4">Tên ứng viên</th>
                      <th className="py-3 px-4 text-center">Số phiếu đạt</th>
                      <th className="py-3 px-4 text-center">Công thức</th>
                      <th className="py-3 px-4 text-right">Tỉ lệ (% hợp lệ)</th>
                      <th className="py-3 px-4 text-center w-28">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.candidateRows.map((candidate, idx) => (
                      <tr key={candidate.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 text-center font-mono text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: BAR_COLORS[idx % BAR_COLORS.length] }}
                            />
                            <span>{candidate.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                          {candidate.votes}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs text-slate-400">
                          ({candidate.votes} / {stats.totalValidBallots}) × 100
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">
                          {candidate.percentageStr}%
                        </td>
                        <td className="py-3 px-4 text-center">
                          {candidate.isOverFifty ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                              <Check className="w-3 h-3" /> Quá bán
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                              Chưa quá bán
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}

                    <tr className="bg-rose-50/80 font-semibold border-t border-rose-200 text-rose-900">
                      <td className="py-3 px-4 text-center font-mono text-rose-400">•</td>
                      <td className="py-3 px-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>Phiếu không hợp lệ</span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-rose-950">
                        {stats.totalInvalidBallots}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-xs text-rose-600">
                        ({stats.totalInvalidBallots} / {electionData.totalCollectedBallots}) × 100
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">
                        {stats.invalidPercentageStr}%
                      </td>
                      <td className="py-3 px-4 text-center text-xs text-rose-600 italic">
                        Không hợp lệ
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* =========================================================================
          THANH ĐIỀU HƯỚNG DƯỚI CÙNG (BOTTOM NAVIGATION CHO ĐIỆN THOẠI)
      ========================================================================= */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2 flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActiveTab('counting')}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all ${
            activeTab === 'counting'
              ? 'text-blue-600 font-bold bg-blue-50'
              : 'text-slate-500 font-medium'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[11px]">Bàn Kiểm Phiếu</span>
        </button>

        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all relative ${
            activeTab === 'dashboard'
              ? 'text-indigo-600 font-bold bg-indigo-50'
              : 'text-slate-500 font-medium'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[11px]">Giám Sát Live</span>
          <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
        </button>
      </nav>

      {/* =========================================================================
          MODAL: CẤU HÌNH FIREBASE
      ========================================================================= */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-600" />
                Cấu Hình Firebase Realtime
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <p className="text-slate-600">
                Dữ liệu hiện đang kết nối trực tiếp vào dự án Firebase của bạn.
              </p>

              <div>
                <label className="block text-slate-700 font-bold mb-1">API Key:</label>
                <input
                  type="text"
                  value={firebaseConfig.apiKey}
                  onChange={(e) => setFirebaseConfig({ ...firebaseConfig, apiKey: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Database URL:</label>
                <input
                  type="text"
                  value={firebaseConfig.databaseURL}
                  onChange={(e) =>
                    setFirebaseConfig({ ...firebaseConfig, databaseURL: e.target.value })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Project ID:</label>
                <input
                  type="text"
                  value={firebaseConfig.projectId}
                  onChange={(e) =>
                    setFirebaseConfig({ ...firebaseConfig, projectId: e.target.value })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => {
                  localStorage.setItem(
                    'kiemphieu_firebase_config',
                    JSON.stringify(firebaseConfig)
                  );
                  setShowConfigModal(false);
                  showToast('Đã lưu cấu hình Firebase!');
                }}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Lưu & Kết Nối
              </button>
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: BIÊN BẢN IN ẤN KẾT QUẢ
      ========================================================================= */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Printer className="w-4 h-4 text-slate-600" />
                Biên Bản Kiểm Phiếu Bầu Cử
              </h3>
              <button
                onClick={() => setShowPrintModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="py-4 text-slate-900 space-y-3 text-xs font-serif leading-relaxed">
              <div className="text-center space-y-1">
                <h4 className="font-bold uppercase tracking-wider text-xs sm:text-sm">
                  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                </h4>
                <p className="italic text-[11px]">Độc lập - Tự do - Hạnh phúc</p>
                <div className="w-20 border-b border-slate-400 mx-auto my-2"></div>
                <h3 className="font-bold text-sm sm:text-base uppercase pt-1">
                  BIÊN BẢN KIỂM PHIẾU BẦU CỬ
                </h3>
              </div>

              <div className="space-y-1 pt-2">
                <p>1. Tổng số phiếu thu được: <strong>{electionData.totalCollectedBallots}</strong> phiếu.</p>
                <p>2. Tổng số phiếu hợp lệ: <strong>{stats.totalValidBallots}</strong> phiếu.</p>
                <p>3. Tổng số phiếu không hợp lệ: <strong>{stats.totalInvalidBallots}</strong> phiếu (chiếm {stats.invalidPercentageStr}%).</p>
              </div>

              <div className="pt-2">
                <table className="w-full border-collapse border border-slate-300 text-[11px]">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 p-1.5 text-center w-8">STT</th>
                      <th className="border border-slate-300 p-1.5 text-left">Họ và tên</th>
                      <th className="border border-slate-300 p-1.5 text-center">Số phiếu</th>
                      <th className="border border-slate-300 p-1.5 text-right">Tỉ lệ (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.candidateRows.map((c, i) => (
                      <tr key={c.id}>
                        <td className="border border-slate-300 p-1.5 text-center">{i + 1}</td>
                        <td className="border border-slate-300 p-1.5 font-medium">{c.name}</td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">{c.votes}</td>
                        <td className="border border-slate-300 p-1.5 text-right font-bold">{c.percentageStr}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>In ngay</span>
              </button>
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: HOÀN TẤT KIỂM PHIẾU
      ========================================================================= */}
      {showFinalizeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Đã Hoàn Thành Kiểm Phiếu!
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Số liệu đã được khóa niêm phong trên tất cả các thiết bị.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowFinalizeModal(false);
                  setActiveTab('dashboard');
                }}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs"
              >
                Mở Giám Sát
              </button>
              <button
                onClick={() => setShowFinalizeModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
