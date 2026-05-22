import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

const API_BASE =
  import.meta.env.DEV ? "http://localhost:3000/api" : "/api";
const REFRESH_INTERVAL = 5000;

/* ══════════════════════════════════════════════════════════════════════
   Utility Helpers
   ══════════════════════════════════════════════════════════════════════ */

function aqiLabel(val) {
  if (val <= 50) return { text: "Good", color: "#10b981" };
  if (val <= 100) return { text: "Moderate", color: "#f59e0b" };
  if (val <= 150) return { text: "Unhealthy (SG)", color: "#f97316" };
  if (val <= 200) return { text: "Unhealthy", color: "#ef4444" };
  if (val <= 300) return { text: "Very Unhealthy", color: "#8b5cf6" };
  return { text: "Hazardous", color: "#be123c" };
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* ══════════════════════════════════════════════════════════════════════
   StatCard Component
   ══════════════════════════════════════════════════════════════════════ */
function StatCard({ title, value, unit, icon, accent }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-surface-800 border border-border p-5 transition-all duration-300 hover:border-surface-600 hover:shadow-lg hover:shadow-black/20 group">
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-1">
            {title}
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold" style={{ color: accent }}>
              {value}
            </span>
            {unit && (
              <span className="text-text-muted text-sm font-medium">
                {unit}
              </span>
            )}
          </div>
        </div>
        <div
          className="text-2xl w-10 h-10 flex items-center justify-center rounded-xl"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   ChartTooltip Component
   ══════════════════════════════════════════════════════════════════════ */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-700 border border-border rounded-lg p-3 shadow-xl text-xs">
      <p className="text-text-secondary mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Main App Component
   ══════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [latestData, setLatestData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [selectedSensor, setSelectedSensor] = useState("JKT-AQI-001");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const sensorIds = [
    "JKT-AQI-001",
    "JKT-AQI-002",
    "JKT-AQI-003",
    "JKT-AQI-004",
    "JKT-AQI-005",
  ];

  // ── Fetch latest readings for all sensors ──────────────────────────
  const fetchLatest = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/sensors/latest`);
      setLatestData(res.data.data || []);
      setError(null);
    } catch (err) {
      setError("Failed to connect to server");
    }
  }, []);

  // ── Fetch history for selected sensor ──────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const res = await axios.get(
        `${API_BASE}/sensors/${selectedSensor}/history?limit=50`
      );
      const rows = (res.data.data || [])
        .reverse()
        .map((r) => ({
          time: formatTime(r.recorded_at),
          temperature_c: r.temperature_c,
          aqi_value: r.aqi_value,
          humidity_percent: r.humidity_percent,
          pm25_level: r.pm25_level,
        }));
      setHistoryData(rows);
    } catch {
      /* ignore */
    }
  }, [selectedSensor]);

  // ── Auto-refresh loop ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchLatest(), fetchHistory()]);
      setLoading(false);
      setLastUpdate(new Date());
    };
    load();
    const interval = setInterval(() => {
      fetchLatest();
      fetchHistory();
      setLastUpdate(new Date());
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLatest, fetchHistory]);

  // ── Computed stats ─────────────────────────────────────────────────
  const avgAqi =
    latestData.length > 0
      ? Math.round(
        latestData.reduce((sum, s) => sum + (s.aqi_value || 0), 0) /
        latestData.length
      )
      : 0;

  const avgTemp =
    latestData.length > 0
      ? (
        latestData.reduce((sum, s) => sum + (s.temperature_c || 0), 0) /
        latestData.length
      ).toFixed(1)
      : "0.0";

  const avgHumidity =
    latestData.length > 0
      ? Math.round(
        latestData.reduce((sum, s) => sum + (s.humidity_percent || 0), 0) /
        latestData.length
      )
      : 0;

  const aqiStatus = aqiLabel(avgAqi);

  return (
    <div className="min-h-screen bg-surface-900">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-cyan to-accent-green flex items-center justify-center text-white font-bold text-sm">
              EP
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary tracking-tight">
                EcoPulse
              </h1>
              <p className="text-xs text-text-muted">
                Environmental Sensor Network
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-800 border border-border text-xs">
              <span className="w-2 h-2 rounded-full bg-accent-green pulse-live" />
              <span className="text-text-secondary">
                {latestData.length} sensors active
              </span>
            </div>
            {lastUpdate && (
              <span className="text-xs text-text-muted">
                Updated {formatTime(lastUpdate)}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* ── Error Banner ──────────────────────────────────────────── */}
        {error && (
          <div className="bg-accent-rose/10 border border-accent-rose/30 text-accent-rose rounded-xl px-5 py-3 text-sm flex items-center gap-2">
            <span>⚠</span> {error} — make sure the backend is running on port
            3000.
          </div>
        )}

        {/* ── Overview Cards ────────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Avg Air Quality"
            value={avgAqi}
            unit={`· ${aqiStatus.text}`}
            icon="🌫"
            accent={aqiStatus.color}
          />
          <StatCard
            title="Avg Temperature"
            value={avgTemp}
            unit="°C"
            icon="🌡"
            accent="#06b6d4"
          />
          <StatCard
            title="Avg Humidity"
            value={avgHumidity}
            unit="%"
            icon="💧"
            accent="#8b5cf6"
          />
          <StatCard
            title="Active Sensors"
            value={latestData.length}
            unit={`/ ${sensorIds.length}`}
            icon="📡"
            accent="#10b981"
          />
        </section>

        {/* ── Sensor Selector ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Sensor Details
          </h2>
          <div className="flex gap-2 flex-wrap">
            {sensorIds.map((id) => (
              <button
                key={id}
                onClick={() => setSelectedSensor(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 cursor-pointer ${selectedSensor === id
                  ? "bg-accent-cyan/15 border-accent-cyan text-accent-cyan shadow-md shadow-accent-cyan/10"
                  : "bg-surface-800 border-border text-text-muted hover:border-surface-600 hover:text-text-secondary"
                  }`}
              >
                {id}
              </button>
            ))}
          </div>
        </div>

        {/* ── Charts ────────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Temperature Chart */}
          <div className="rounded-2xl bg-surface-800 border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">
                🌡 Temperature
              </h3>
              <span className="text-xs text-text-muted">Last 50 readings</span>
            </div>
            <div className="h-64">
              {historyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData}>
                    <defs>
                      <linearGradient
                        id="tempGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#06b6d4"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#06b6d4"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1e293b"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="temperature_c"
                      name="Temp (°C)"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      fill="url(#tempGradient)"
                      dot={false}
                      activeDot={{ r: 4, fill: "#06b6d4" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-text-muted text-sm">
                  {loading ? "Loading…" : "No data available"}
                </div>
              )}
            </div>
          </div>

          {/* AQI Chart */}
          <div className="rounded-2xl bg-surface-800 border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">
                🌫 Air Quality Index
              </h3>
              <span className="text-xs text-text-muted">Last 50 readings</span>
            </div>
            <div className="h-64">
              {historyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData}>
                    <defs>
                      <linearGradient
                        id="aqiGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#f59e0b"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#f59e0b"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1e293b"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 300]}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="aqi_value"
                      name="AQI"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="url(#aqiGradient)"
                      dot={false}
                      activeDot={{ r: 4, fill: "#f59e0b" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-text-muted text-sm">
                  {loading ? "Loading…" : "No data available"}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Data Table ────────────────────────────────────────────── */}
        <section className="rounded-2xl bg-surface-800 border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">
              📊 Live Sensor Readings
            </h3>
            <span className="text-xs text-text-muted">
              All sensors · latest readings
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-700/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Sensor ID
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Time
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Temp (°C)
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Humidity
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    AQI
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    PM2.5
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Battery
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {latestData.length > 0 ? (
                  latestData.map((row, idx) => {
                    const aqi = aqiLabel(row.aqi_value);
                    return (
                      <tr
                        key={idx}
                        className="hover:bg-surface-700/30 transition-colors"
                      >
                        <td className="px-5 py-3 font-mono text-accent-cyan text-xs">
                          {row.sensor_id}
                        </td>
                        <td className="px-5 py-3 text-text-muted text-xs">
                          {formatTime(row.recorded_at)}
                        </td>
                        <td className="px-5 py-3 text-right font-medium">
                          {row.temperature_c?.toFixed(1)}
                        </td>
                        <td className="px-5 py-3 text-right text-text-secondary">
                          {row.humidity_percent}%
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{
                              background: `${aqi.color}18`,
                              color: aqi.color,
                            }}
                          >
                            {row.aqi_value}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-text-secondary">
                          {row.pm25_level?.toFixed(1)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={`font-medium ${row.battery_status > 70
                              ? "text-accent-green"
                              : row.battery_status > 30
                                ? "text-accent-amber"
                                : "text-accent-rose"
                              }`}
                          >
                            {row.battery_status}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-10 text-center text-text-muted text-sm"
                    >
                      {loading
                        ? "Loading sensor data…"
                        : "No sensor data available. Start the simulator to see data."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <footer className="text-center py-6 text-xs text-text-muted">
          EcoPulse · Smart City Environmental Sensor Network · Data refreshes
          every {REFRESH_INTERVAL / 1000}s
        </footer>
      </main>
    </div>
  );
}
