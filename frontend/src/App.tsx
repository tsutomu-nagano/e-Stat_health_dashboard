import { useEffect, useState } from 'react';
import { Activity, RefreshCcw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
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
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4'];
const currentDateTimeInJapan = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
};

function App() {
  const now = currentDateTimeInJapan();
  const [results, setResults] = useState<CheckResult[]>([]);
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startDateTime, setStartDateTime] = useState(now);
  const [endDateTime, setEndDateTime] = useState(now);

  const historyUrl = () => {
    const params = new URLSearchParams({ startDateTime, endDateTime });
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
  }, [startDateTime, endDateTime]);

  const chartDataMap = new Map<string, Record<string, string | number | null>>();
  const isMultiDay = startDateTime.slice(0, 10) !== endDateTime.slice(0, 10);

  [...history].reverse().forEach(log => {
    const logDate = new Date(log.createdAt + 'Z');
    const coeff = 1000 * 60 * 10;
    const roundedDate = new Date(Math.round(logDate.getTime() / coeff) * coeff);
    const time = isMultiDay
      ? roundedDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : roundedDate.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });

    if (!chartDataMap.has(time)) {
      chartDataMap.set(time, { time });
    }
    chartDataMap.get(time)![log.target] = log.responseTimeMs ?? null;
  });

  const chartData = Array.from(chartDataMap.values());
  const chartTargets = Array.from(new Set(history.map(log => log.target)));

  const updateStartDateTime = (value: string) => {
    setStartDateTime(value);
    if (value > endDateTime) setEndDateTime(value);
  };

  const updateEndDateTime = (value: string) => {
    setEndDateTime(value);
    if (value < startDateTime) setStartDateTime(value);
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
          <h1>e-Stat Status Dashboard</h1>
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
              {results.map((result) => {
                const checkedAt = result.createdAt ?? result.lastChecked;
                return (
                  <div key={result.target} className={`status-card ${result.status}`}>
                    <div className="card-header">
                      <h2>{result.target}</h2>
                      <div className={`status-badge ${result.status}`}>
                        {result.status === 'up' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                        <span>{result.status.toUpperCase()}</span>
                      </div>
                    </div>

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
                  </div>
                );
              })}
            </div>

            <div className="chart-container">
              <div className="chart-header">
                <h2>Response Time History</h2>
                <div className="date-range-selector">
                  <label>
                    開始日時
                    <input type="datetime-local" value={startDateTime} max={endDateTime} onChange={(event) => updateStartDateTime(event.target.value)} />
                  </label>
                  <span>〜</span>
                  <label>
                    終了日時
                    <input type="datetime-local" value={endDateTime} min={startDateTime} max={now} onChange={(event) => updateEndDateTime(event.target.value)} />
                  </label>
                </div>
              </div>
              {chartData.length > 0 ? (
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height={300}>
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
                        <Line key={target} type="monotone" dataKey={target} name={target} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
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
        <span>このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。</span>
      </main>
    </div>
  );
}

export default App;
