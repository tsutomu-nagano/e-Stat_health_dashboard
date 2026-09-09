import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, RefreshCcw, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Eye, EyeOff, ArrowLeft, ArrowRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceArea, ReferenceLine } from 'recharts';

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
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
  createdAt: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const HIDDEN_CHART_TARGETS_KEY = 'estat-dashboard.hidden-chart-targets';
const CARD_ORDER_KEY_PREFIX = 'estat-dashboard.card-order';
const CHART_FILTERS_KEY = 'estat-dashboard.chart-filters';

type ChartFilters = {
  selectedDate: string;
  startTime: string;
  endTime: string;
};

const isValidDate = (value: unknown, today: string): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isValidTime = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

const loadChartFilters = (today: string): ChartFilters => {
  const defaults = { selectedDate: today, startTime: '00:00', endTime: '23:59' };
  if (typeof window === 'undefined') return defaults;

  try {
    const stored = window.localStorage.getItem(CHART_FILTERS_KEY);
    if (!stored) return defaults;

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const filters = parsed as Partial<ChartFilters> & { savedOn?: string };
    if (
      filters.savedOn !== today ||
      !isValidDate(filters.selectedDate, today) ||
      !isValidTime(filters.startTime) ||
      !isValidTime(filters.endTime) ||
      filters.startTime > filters.endTime
    ) return defaults;

    return {
      selectedDate: filters.selectedDate,
      startTime: filters.startTime,
      endTime: filters.endTime
    };
  } catch {
    return defaults;
  }
};

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
  if (payload?.[target] == null || typeof cx !== 'number' || typeof cy !== 'number') {
    return null;
  }

  const status = payload?.[`${target}Status`];
  if (status === 'down') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="#ef4444" stroke="#fee2e2" strokeWidth={1} />
        <path d={`M ${cx - 3} ${cy - 3} L ${cx + 3} ${cy + 3} M ${cx + 3} ${cy - 3} L ${cx - 3} ${cy + 3}`} stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" />
      </g>
    );
  }

  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#ffffff" strokeWidth={1} />;
}

function ChartTooltip({ active, payload, label, targets, coordinate, isMobile }: any) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const point = payload?.[0]?.payload;

  useLayoutEffect(() => {
    if (!isMobile || !active || !point) return;
    const updatePosition = () => {
      const chart = anchorRef.current?.closest('.recharts-wrapper');
      const tooltip = tooltipRef.current;
      if (!chart || !tooltip) return;
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + 8;
      const top = (viewport?.offsetTop ?? 0) + 8;
      const width = Math.max(0, (viewport?.width ?? window.innerWidth) - 16);
      const height = Math.max(0, (viewport?.height ?? window.innerHeight) - 16);
      tooltip.style.maxHeight = `${height}px`;
      tooltip.style.width = `${Math.min(280, width)}px`;
      const bounds = chart.getBoundingClientRect();
      const anchorY = bounds.top + (coordinate?.y ?? 0);
      const tooltipHeight = tooltip.getBoundingClientRect().height;
      // 下側に収まらなければ上側へ移動し、最後に表示領域内へ収める。
      const preferredY = anchorY + 12 + tooltipHeight <= top + height
        ? anchorY + 12
        : anchorY - 12 - tooltipHeight;
      tooltip.style.top = `${Math.max(top, Math.min(preferredY, top + height - tooltipHeight))}px`;
      tooltip.style.left = `${Math.max(left, Math.min(bounds.left, left + width - tooltip.offsetWidth))}px`;
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (tooltipRef.current) observer.observe(tooltipRef.current);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [isMobile, active, point, coordinate?.y]);

  if (!active || !point) return null;

  const failedTargets = Object.keys(point)
    .filter((key) => key.endsWith('Status') && String(point[key]).toLowerCase() === 'down')
    .map((key) => key.slice(0, -'Status'.length));
  const items = Array.from(new Set<string>([...(targets ?? []), ...failedTargets]));

  const content = (
    <div ref={tooltipRef} className={`chart-tooltip${isMobile ? ' chart-tooltip-mobile' : ''}`}>
      <div className="chart-tooltip-time">{label}</div>
      {items.map((target: string) => {
        const hasData = Object.prototype.hasOwnProperty.call(point, `${target}Status`);
        const failed = String(point[`${target}Status`]).toLowerCase() === 'down';
        const statusCode = point[`${target}StatusCode`];
        const error = point[`${target}Error`];

        return (
          <div key={target} className={`chart-tooltip-item${failed ? ' failed' : ''}`}>
            <div className="chart-tooltip-service">
              <span className="chart-tooltip-color" style={{ backgroundColor: failed ? '#ef4444' : colorForTarget(target) }} />
              <span>{target}</span>
              {failed && <span className="chart-tooltip-failure">応答エラー</span>}
              {!hasData && <span className="chart-tooltip-no-data">データなし</span>}
            </div>
            {hasData && (
              <div className="chart-tooltip-details">
                <span>応答時間: {point[target] != null ? `${point[target]} ms` : 'N/A'}</span>
                {statusCode != null && <span>HTTP: {statusCode}</span>}
              </div>
            )}
            {failed && error && <div className="chart-tooltip-error">{error}</div>}
          </div>
        );
      })}
    </div>
  );
  return isMobile
    ? <><span ref={anchorRef} />{createPortal(content, document.body)}</>
    : content;
}
const todayInJapan = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

// 画面幅の変更に合わせてグラフの向きを切り替える。
function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return isMobile;
}

function App() {
  const isMobile = useMobileLayout();
  const today = todayInJapan();
  const [initialChartFilters] = useState(() => loadChartFilters(today));
  const [results, setResults] = useState<CheckResult[]>([]);
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(initialChartFilters.selectedDate);
  const [startTime, setStartTime] = useState(initialChartFilters.startTime);
  const [endTime, setEndTime] = useState(initialChartFilters.endTime);
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(new Set());
  const [hiddenChartTargets, setHiddenChartTargets] = useState<Set<string>>(loadHiddenChartTargets);
  const [userId, setUserId] = useState('anonymous');
  const [cardOrder, setCardOrder] = useState<string[]>([]);
  const [cardOrderUserId, setCardOrderUserId] = useState('anonymous');

  const historyUrl = () => {
    const params = new URLSearchParams({ startDate: selectedDate, endDate: selectedDate });
    return `${API_BASE_URL}/api/history/by-date?${params.toString()}`;
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
    window.localStorage.setItem(CHART_FILTERS_KEY, JSON.stringify({
      selectedDate, startTime, endTime, savedOn: todayInJapan()
    }));
  }, [selectedDate, startTime, endTime]);

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
    const roundedDate = new Date((isMobile ? Math.floor(logDate.getTime() / coeff) : Math.round(logDate.getTime() / coeff)) * coeff);
    const time = roundedDate.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });

    if (!chartDataMap.has(time)) {
      chartDataMap.set(time, { time });
    }
    const entry = chartDataMap.get(time)!;
    // 応答エラー時のタイムアウト値などを応答時間としてプロットしない。
    // ステータス情報は残し、同時刻にある他サービスのツールチップで表示する。
    entry[log.target] = log.status === 'up' ? (log.responseTimeMs ?? null) : null;
    entry[`${log.target}StatusCode`] = log.statusCode;
    entry[`${log.target}Status`] = log.status;
    entry[`${log.target}Error`] = log.error;
  });

  const chartData = Array.from(chartDataMap.values());
  const displayChartData = isMobile
    ? [...chartData].sort((a, b) => String(b.time).localeCompare(String(a.time)))
    : chartData;
  const downTimes = new Set(
    chartData
      .filter((point) => Object.keys(point).some(
        (key) => key.endsWith('Status') && String(point[key]).toLowerCase() === 'down'
      ))
      .map((point) => String(point.time))
  );
  const chartTargets = Array.from(
    new Set(filteredHistory.filter((log) => !hiddenChartTargets.has(log.target)).map((log) => log.target))
  );
  const tooltipTargets = Array.from(
    new Set([...results.map((result) => result.target), ...chartTargets])
  ).filter((target) => !hiddenChartTargets.has(target));

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

  const moveCardByOffset = (target: string, offset: -1 | 1) => {
    setCardOrder((current) => {
      const sourceIndex = current.indexOf(target);
      const destinationIndex = sourceIndex + offset;
      if (sourceIndex === -1 || destinationIndex < 0 || destinationIndex >= current.length) return current;

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(destinationIndex, 0, moved);
      return next;
    });
  };

  const orderedResults = applyCardOrder(results, cardOrder);

  const updateSelectedDate = (value: string) => {
    setSelectedDate(value);
    setStartTime('00:00');
    setEndTime('23:59');
  };

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
              {orderedResults.map((result, index) => {
                const checkedAt = result.createdAt ?? result.lastChecked;
                const isDetailsOpen = expandedTargets.has(result.target);
                const isChartVisible = !hiddenChartTargets.has(result.target);
                const isFirstCard = index === 0;
                const isLastCard = index === orderedResults.length - 1;
                return (
                  <div key={result.target} className={`status-card ${result.status} ${isDetailsOpen ? 'expanded' : 'compact'}`}>
                    <div className="card-header">
                      <h2>{result.target}</h2>
                      <div className={`status-badge ${result.status}`}>
                        {result.status === 'up' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                        <span>{result.status.toUpperCase()}</span>
                      </div>
                    </div>

                    <div className="card-actions">
                      <div className="move-controls" aria-label={`${result.target}の表示位置を変更`}>
                        <button
                          type="button"
                          className="move-btn"
                          aria-label={`${result.target}を左へ移動`}
                          title="左へ移動"
                          disabled={isFirstCard}
                          onClick={() => moveCardByOffset(result.target, -1)}
                        >
                          <ArrowLeft size={16} />
                        </button>
                        <button
                          type="button"
                          className="move-btn"
                          aria-label={`${result.target}を右へ移動`}
                          title="右へ移動"
                          disabled={isLastCard}
                          onClick={() => moveCardByOffset(result.target, 1)}
                        >
                          <ArrowRight size={16} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className={`chart-toggle ${isChartVisible ? 'active' : ''}`}
                        aria-label={isChartVisible ? `${result.target}を履歴から非表示にする` : `${result.target}を履歴に表示する`}
                        aria-pressed={isChartVisible}
                        title={isChartVisible ? '履歴に表示中' : '履歴から非表示'}
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
                    <input type="date" value={selectedDate} max={today} onChange={(event) => updateSelectedDate(event.target.value)} />
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
                <>
                <div className={`chart-wrapper${isMobile ? ' vertical-chart' : ''}`} style={isMobile ? { height: Math.max(480, displayChartData.length * 48 + 140) } : undefined}>
                  <div className="chart-failure-key"><span />応答エラーあり</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayChartData} layout={isMobile ? 'vertical' : 'horizontal'} margin={isMobile ? { top: 30, right: 20, left: 0, bottom: 16 } : { top: 20, right: 30, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis type={isMobile ? 'number' : 'category'} dataKey={isMobile ? undefined : 'time'} orientation={isMobile ? 'top' : 'bottom'} stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: isMobile ? 11 : 12 }} tickCount={isMobile ? 3 : undefined} />
                      <YAxis type={isMobile ? 'category' : 'number'} dataKey={isMobile ? 'time' : undefined} interval={isMobile ? 0 : undefined} width={isMobile ? 52 : 88} stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} unit={isMobile ? undefined : 'ms'} />
                      {displayChartData.map((point, index) => {
                        const time = String(point.time);
                        if (!downTimes.has(time)) return null;

                        const nextTime = displayChartData[index + 1]?.time;
                        return nextTime != null ? (
                          <ReferenceArea
                            key={`down-${time}`}
                            {...(isMobile ? { y1: time, y2: String(nextTime) } : { x1: time, x2: String(nextTime) })}
                            fill="#ef4444"
                            fillOpacity={0.24}
                            strokeOpacity={0}
                          />
                        ) : (
                          <ReferenceLine
                            key={`down-${time}`}
                            {...(isMobile ? { y: time } : { x: time })}
                            stroke="#ef4444"
                            strokeOpacity={0.36}
                            strokeWidth={16}
                          />
                        );
                      })}
                      <Tooltip position={isMobile ? { x: 0 } : undefined} content={<ChartTooltip targets={tooltipTargets} isMobile={isMobile} />} />
                      <Legend verticalAlign={isMobile ? "top" : "bottom"} wrapperStyle={isMobile ? { paddingBottom: 16, fontSize: 12 } : undefined} />
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
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                </>
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
