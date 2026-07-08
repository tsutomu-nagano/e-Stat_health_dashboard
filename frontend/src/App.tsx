import { useEffect, useState } from 'react';
import { Activity, RefreshCcw, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Eye, EyeOff, GripVertical } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface CheckResult {
  target: string;
  status: 'up' | 'down';
  statusCode?: number;
  responseTimeMs?: number;
  createdAt?: string;
  lastChecked?: string;
  error?: string;
}

interface HistoryLog {
  id: number;
  target: string;
  status: string;
  statusCode: number;
  responseTimeMs: number;
  error: string | null;
  createdAt: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const HIDDEN_CHART_TARGETS_KEY = 'estat-dashboard.hidden-chart-targets';
const CARD_ORDER_KEY_PREFIX = 'estat-dashboard.card-order';

const loadHiddenChartTargets = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();

  try {
    const stored = window.localStorage.getItem(HIDDEN_CHART_TARGETS_KEY);
    const targets: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(targets)
      ? new Set(targets.filter((target): target is string => typeof target === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
};
const TARGET_COLORS: Record<string, string> = {
  'e-Stat Web': '#3b82f6',
  'e-Stat API': '#10b981',
  'miripo': '#f59e0b',
  'e-Micro Login': '#a855f7',
  'jSTAT MAP': '#ec4899',
  'e-survey': '#06b6d4'
};

const colorForTarget = (target: string) => TARGET_COLORS[target] ?? '#06b6d4';

const sanitizeStorageKeyPart = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_');

const loadCardOrder = (userId: string): string[] => {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(`${CARD_ORDER_KEY_PREFIX}.${sanitizeStorageKeyPart(userId)}`);
    const targets: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(targets)
      ? targets.filter((target): target is string => typeof target === 'string')
      : [];
  } catch {
    return [];
  }
};

const applyCardOrder = (items: CheckResult[], order: string[]) => {
  const orderIndex = new Map(order.map((target, index) => [target, index]));
  return [...items].sort((a, b) => {
    const aIndex = orderIndex.get(a.target);
    const bIndex = orderIndex.get(b.target);

    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
    if (aIndex !== undefined) return -1;
    if (bIndex !== undefined) return 1;
    return a.target.localeCompare(b.target);
  });
};

function StatusDot({ cx, cy, payload, target, color }: any) {
  const statusCode = payload?.[`${target}StatusCode`];
  if (statusCode !== undefined && statusCode !== 200) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="#ef4444" stroke="#fee2e2" strokeWidth={1} />
        <path d={`M ${cx - 3} ${cy - 3} L ${cx + 3} ${cy + 3} M ${cx + 3} ${cy - 3} L ${cx - 3} ${cy + 3}`} stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" />
      </g>
    );
  }

  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#ffffff" strokeWidth={1} />;
}
const todayInJapan = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

function App() {
  const today = todayInJapan();
  const [results, setResults] = useState<CheckResult[]>([]);
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(new Set());
  const [hiddenChartTargets, setHiddenChartTargets] = useState<Set<string>>(loadHiddenChartTargets);
  const [userId, setUserId] = useState('anonymous');
  const [cardOrder, setCardOrder] = useState<string[]>([]);
  const [cardOrderUserId, setCardOrderUserId] = useState('anonymous');
  const [draggingTarget, setDraggingTarget] = useState<string | null>(null);

  const historyUrl = () => {
    const params = new URLSearchParams({ startDate: selectedDate, endDate: selectedDate });
    return `${API_BASE_URL}/api/history?${params.toString()}`;
  };

  const fetchData = async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/status`),
        fetch(historyUrl())
      ]);
      const statusJson = await statusRes.json();
      const historyJson = await historyRes.json();

      if (statusJson.success) setResults(statusJson.data);
      if (historyJson.success) setHistory(historyJson.data);
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/check-now`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setResults(json.data);
        const historyRes = await fetch(historyUrl());
        const historyJson = await historyRes.json();
        if (historyJson.success) setHistory(historyJson.data);
      }
    } catch (err) {
      console.error('Failed to refresh', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 600000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/me`);
        const json = await res.json();
        if (json.success && typeof json.data?.userId === 'string') {
          setUserId(json.data.userId);
        }
      } catch (err) {
        console.error('Failed to fetch user', err);
      }
    };

    fetchUser();
  }, []);

  useEffect(() => {
    setCardOrder(loadCardOrder(userId));
    setCardOrderUserId(userId);
  }, [userId]);

  useEffect(() => {
    window.localStorage.setItem(HIDDEN_CHART_TARGETS_KEY, JSON.stringify([...hiddenChartTargets]));
  }, [hiddenChartTargets]);

  useEffect(() => {
    const targets = new Set(results.map((result) => result.target));
    const nextOrder = [
      ...cardOrder.filter((target) => targets.has(target)),
      ...results.map((result) => result.target).filter((target) => !cardOrder.includes(target))
    ];

    if (nextOrder.join('\u0000') !== cardOrder.join('\u0000')) {
      setCardOrder(nextOrder);
    }
  }, [results, cardOrder]);

  useEffect(() => {
    if (typeof window === 'undefined' || cardOrder.length === 0 || cardOrderUserId !== userId) return;
    window.localStorage.setItem(
      `${CARD_ORDER_KEY_PREFIX}.${sanitizeStorageKeyPart(userId)}`,
      JSON.stringify(cardOrder)
    );
  }, [cardOrder, cardOrderUserId, userId]);

  const chartDataMap = new Map<string, Record<string, string | number | null>>();
  const timeInJapan = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return `${value('hour')}:${value('minute')}`;
  };
  const filteredHistory = history.filter((log) => {
    const time = timeInJapan(new Date(log.createdAt + 'Z'));
    return time >= startTime && time <= endTime;
  });

  [...filteredHistory].reverse().forEach(log => {
    const logDate = new Date(log.createdAt + 'Z');
    const coeff = 1000 * 60 * 10;
    const roundedDate = new Date(Math.round(logDate.getTime() / coeff) * coeff);
    const time = roundedDate.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });

    if (!chartDataMap.has(time)) {
      chartDataMap.set(time, { time });
    }
    const entry = chartDataMap.get(time)!;
    entry[log.target] = log.responseTimeMs ?? null;
    entry[`${log.target}StatusCode`] = log.statusCode;
  });

  const chartData = Array.from(chartDataMap.values());
  const chartTargets = Array.from(
    new Set(filteredHistory.filter((log) => !hiddenChartTargets.has(log.target)).map((log) => log.target))
  );

  const toggleTargetDetails = (target: string) => {
    setExpandedTargets((current) => {
      const next = new Set(current);
      if (next.has(target)) {
        next.delete(target);
      } else {
        next.add(target);
      }
      return next;
    });
  };

  const toggleChartTarget = (target: string) => {
    setHiddenChartTargets((current) => {
      const next = new Set(current);
      if (next.has(target)) {
        next.delete(target);
      } else {
        next.add(target);
      }
      return next;
    });
  };

  const moveCard = (sourceTarget: string, destinationTarget: string) => {
    if (sourceTarget === destinationTarget) return;

    setCardOrder((current) => {
      const sourceIndex = current.indexOf(sourceTarget);
      const destinationIndex = current.indexOf(destinationTarget);
      if (sourceIndex === -1 || destinationIndex === -1) return current;

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(destinationIndex, 0, moved);
      return next;
    });
  };

  const orderedResults = applyCardOrder(results, cardOrder);

  const updateStartTime = (value: string) => {
    setStartTime(value);
    if (value > endTime) setEndTime(value);
  };

  const updateEndTime = (value: string) => {
    setEndTime(value);
    if (value < startTime) setStartTime(value);
  };

  return (
    <div className="container">
      <div className="background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>

      <header className="header">
        <div className="logo">
          <Activity className="logo-icon" />
          <h1>e-Stat Health Dashboard</h1>
        </div>
        <button
          className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCcw size={18} />
          <span>Refresh</span>
        </button>
      </header>

      <main className="dashboard">
        {loading ? (
          <div className="loading">Loading status...</div>
        ) : (
          <>
            <div className="card-grid">
              {orderedResults.map((result) => {
                const checkedAt = result.createdAt ?? result.lastChecked;
                const isDetailsOpen = expandedTargets.has(result.target);
                const isChartVisible = !hiddenChartTargets.has(result.target);
                return (
                  <div
                    key={result.target}
                    className={`status-card ${result.status} ${isDetailsOpen ? 'expanded' : 'compact'} ${draggingTarget === result.target ? 'dragging' : ''}`}
                    draggable
                    onDragStart={(event) => {
                      setDraggingTarget(result.target);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', result.target);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceTarget = event.dataTransfer.getData('text/plain');
                      moveCard(sourceTarget, result.target);
                      setDraggingTarget(null);
                    }}
                    onDragEnd={() => setDraggingTarget(null)}
                  >
                    <div className="card-header">
                      <div className="card-title">
                        <GripVertical className="drag-handle" size={18} aria-hidden="true" />
                        <h2>{result.target}</h2>
                      </div>
                      <div className={`status-badge ${result.status}`}>
                        {result.status === 'up' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                        <span>{result.status.toUpperCase()}</span>
                      </div>
                    </div>

                    <div className="card-actions">
                      <button
                        type="button"
                        className={`chart-toggle ${isChartVisible ? 'active' : ''}`}
                        aria-label={isChartVisible ? `${result.target}をグラフから非表示にする` : `${result.target}をグラフに表示する`}
                        aria-pressed={isChartVisible}
                        title={isChartVisible ? 'グラフに表示中' : 'グラフから非表示'}
                        onClick={() => toggleChartTarget(result.target)}
                      >
                        {isChartVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button
                        type="button"
                        className={`details-btn ${isDetailsOpen ? 'open' : ''}`}
                        aria-label={isDetailsOpen ? `${result.target}の詳細を閉じる` : `${result.target}の詳細を表示する`}
                        aria-expanded={isDetailsOpen}
                        title={isDetailsOpen ? '詳細を閉じる' : '詳細を表示'}
                        onClick={() => toggleTargetDetails(result.target)}
                      >
                        {isDetailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    {isDetailsOpen && (
                      <>
                        <div className="card-body">
                          <div className="info-row">
                            <span className="label">Status Code</span>
                            <span className="value">{result.statusCode ?? 'N/A'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Response Time</span>
                            <span className="value">{result.responseTimeMs != null ? `${result.responseTimeMs}ms` : 'N/A'}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Last Checked</span>
                            <span className="value">
                              {checkedAt ? new Date(checkedAt.replace(' ', 'T') + (checkedAt.endsWith('Z') ? '' : 'Z')).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' }) : 'N/A'}
                            </span>
                          </div>
                        </div>

                        {result.error && result.error !== 'Not checked yet' && (
                          <div className="error-message">
                            <AlertCircle size={14} />
                            <span>{result.error}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="chart-container">
              <div className="chart-header">
                <h2>Response Time History</h2>
                <div className="date-range-selector">
                  <label>
                    日付
                    <input type="date" value={selectedDate} max={today} onChange={(event) => setSelectedDate(event.target.value)} />
                  </label>
                  <label>
                    開始時刻
                    <input type="time" value={startTime} max={endTime} step="60" onChange={(event) => updateStartTime(event.target.value)} />
                  </label>
                  <span>〜</span>
                  <label>
                    終了時刻
                    <input type="time" value={endTime} min={startTime} step="60" onChange={(event) => updateEndTime(event.target.value)} />
                  </label>
                </div>
              </div>
              {chartData.length > 0 ? (
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="time" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                      <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} unit="ms" />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                        itemStyle={{ color: '#f8fafc' }}
                      />
                      <Legend />
                      {chartTargets.map((target, index) => (
                        <Line
                          key={target}
                          type="monotone"
                          dataKey={target}
                          name={target}
                          stroke={colorForTarget(target)}
                          strokeWidth={3}
                          dot={(props) => <StatusDot {...props} target={target} color={colorForTarget(target)} />}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="empty-history">選択した期間の履歴データはありません。</div>
              )}
            </div>
          </>
        )}
        <p className="disclaimer">このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。</p>
      </main>
    </div>
  );
}

export default App;
