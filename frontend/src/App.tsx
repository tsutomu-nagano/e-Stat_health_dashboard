import { useEffect, useState } from 'react';
import { Activity, RefreshCcw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface CheckResult {
  target: string;
  status: 'up' | 'down';
  statusCode?: number;
  responseTimeMs?: number;
  lastChecked: string;
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

function App() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<number>(24); // hours

  console.log(API_BASE_URL)

  const fetchData = async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/status`),
        fetch(`${API_BASE_URL}/api/history`)
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
        // Refresh history too
        const historyRes = await fetch(`${API_BASE_URL}/api/history`);
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
    const interval = setInterval(fetchData, 600000); // 10 minutes
    return () => clearInterval(interval);
  }, []);

  // Prepare chart data
  const chartDataMap = new Map<string, any>();
  const cutoffTime = Date.now() - timeRange * 60 * 60 * 1000;

  [...history].reverse().forEach(log => {
    // SQLite CURRENT_TIMESTAMP is in UTC 'YYYY-MM-DD HH:MM:SS'. Append 'Z' to parse as UTC.
    const logDate = new Date(log.createdAt + 'Z');
    if (logDate.getTime() < cutoffTime) return;

    // 丸め処理: 10分単位でグループ化することで、WebとAPIのログが別々の時間として扱われるのを防ぐ
    const coeff = 1000 * 60 * 10;
    const roundedDate = new Date(Math.round(logDate.getTime() / coeff) * coeff);
    const time = roundedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (!chartDataMap.has(time)) {
      chartDataMap.set(time, { time });
    }
    const entry = chartDataMap.get(time);
    if (log.target === 'e-Stat Web') {
      entry.web = log.responseTimeMs ?? null;
    } else if (log.target === 'e-Stat API') {
      entry.api = log.responseTimeMs ?? null;
    }
  });

  const chartData = Array.from(chartDataMap.values());

  const resultMap = Object.fromEntries(
    results.map(r => [r.target, r])
  );

  const webResult = resultMap["e-Stat Web"];
  const apiResult = resultMap["e-Stat API"];

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
              {[webResult, apiResult].filter(Boolean).map((result) => (
                <div key={result.target} className={`status-card ${result.status}`}>
                  <div className="card-header">
                    <h2>{result.target}</h2>

                    <div className={`status-badge ${result.status}`}>
                      {result.status === 'up'
                        ? <CheckCircle2 size={16} />
                        : <XCircle size={16} />
                      }

                      <span>{result.status.toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="card-body">
                    <div className="info-row">
                      <span className="label">Status Code</span>
                      <span className="value">
                        {result.statusCode || 'N/A'}
                      </span>
                    </div>

                    <div className="info-row">
                      <span className="label">Response Time</span>
                      <span className="value">
                        {result.responseTimeMs
                          ? `${result.responseTimeMs}ms`
                          : 'N/A'}
                      </span>
                    </div>

                    <div className="info-row">
                      <span className="label">Last Checked</span>
                      <span className="value">
                        {new Date(result.lastChecked).toLocaleTimeString()}
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
              ))}
            </div>
            {chartData.length > 0 && (
              <div className="chart-container">
                <div className="chart-header">
                  <h2>Response Time History</h2>
                  <div className="range-selector">
                    {[1, 6, 12, 24].map((hours) => (
                      <button
                        key={hours}
                        className={`range-btn ${timeRange === hours ? 'active' : ''}`}
                        onClick={() => setTimeRange(hours)}
                      >
                        {hours}H
                      </button>
                    ))}
                  </div>
                </div>
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
                      <Line type="monotone" dataKey="web" name="Web (ms)" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={true} />
                      <Line type="monotone" dataKey="api" name="API (ms)" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={true} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
