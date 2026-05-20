import { useState, useEffect } from "react";
import axios from "axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

const API = "/api";

const SENSORS = [
  "JKT-AQI-001",
  "JKT-AQI-002",
  "JKT-AQI-003",
  "JKT-AQI-004",
  "JKT-AQI-005",
];

// --- MOCK DATA GENERATOR ---
const generateMockLatest = () => {
  return SENSORS.map((sensor_id) => ({
    sensor_id,
    temperature_c: 28 + Math.random() * 4,
    humidity_percent: 65 + Math.random() * 15,
    aqi_value: Math.floor(40 + Math.random() * 140),
    pm25_level: 20 + Math.random() * 30,
    battery_status: Math.floor(75 + Math.random() * 25),
  }));
};

const generateMockHistory = () => {
  return Array.from({ length: 10 }).map((_, i) => ({
    recorded_at: new Date(Date.now() - (9 - i) * 5000).toISOString(),
    temperature_c: 28 + Math.random() * 4,
    humidity_percent: 65 + Math.random() * 15,
    aqi_value: Math.floor(40 + Math.random() * 120),
  }));
};
// ---------------------------

function avg(arr, key) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((s, r) => s + (r[key] || 0), 0) / arr.length);
}

// Ikon SVG Sederhana agar tidak perlu install package tambahan
const Icons = {
  Dashboard: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>,
  Task: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>,
  Map: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>,
  ArrowUp: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
};

export default function App() {
  const [latest, setLatest] = useState([]);
  const [history, setHistory] = useState({});

  const fetchLatest = async () => {
    try {
      const res = await axios.get(`${API}/sensors/latest`);
      setLatest(res.data.data);
    } catch (e) {
      console.error("Failed to fetch latest:", e);
    }
  };

  const fetchHistory = async (sensorId) => {
    try {
      const res = await axios.get(`${API}/sensors/${sensorId}/history`);
      setHistory((prev) => ({ ...prev, [sensorId]: res.data.data }));
    } catch (e) {
      console.error("Failed to fetch history:", e);
    }
  };

  useEffect(() => {
    fetchLatest();
    SENSORS.forEach(fetchHistory);
    const interval = setInterval(() => {
      fetchLatest();
      SENSORS.forEach(fetchHistory);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const avgTemp = latest.length ? (latest.reduce((s, r) => s + (r.temperature_c || 0), 0) / latest.length).toFixed(1) : "0";
  const avgHum = avg(latest, "humidity_percent");
  const avgAqi = avg(latest, "aqi_value");

  // Format data for chart (using the first sensor for overview)
  const chartData = (history[SENSORS[0]] || []).map((r) => ({
    time: new Date(r.recorded_at).toLocaleTimeString("id-ID", { minute: "2-digit", second: "2-digit" }),
    aqi: r.aqi_value,
    temp: r.temperature_c
  }));

  // Donut chart logic for overall AQI status
  const donutData = [
    { name: 'AQI', value: avgAqi },
    { name: 'Remainder', value: 300 - avgAqi }
  ];
  const COLORS = ['#165d3b', '#e5e7eb'];

  return (
    <div className="flex h-screen bg-[#f4f7f6] font-sans text-gray-800">

      {/* --- SIDEBAR --- */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col px-6 py-8">
        <div className="flex items-center gap-2 mb-10 text-2xl font-bold text-[#165d3b]">
          <div className="w-8 h-8 rounded-full bg-[#165d3b] text-white flex items-center justify-center">E</div>
          EcoPulse
        </div>

        <div className="text-xs font-semibold text-gray-400 mb-4 tracking-wider">MENU</div>
        <nav className="flex flex-col gap-2 flex-grow">
          <a href="#" className="flex items-center gap-3 px-4 py-3 bg-[#e8f1ec] text-[#165d3b] rounded-xl font-medium border-l-4 border-[#165d3b]">
            {Icons.Dashboard} Dashboard
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 text-gray-500 hover:bg-gray-50 rounded-xl font-medium transition-colors">
            {Icons.Task} Sensors <span className="ml-auto bg-[#165d3b] text-white text-[10px] px-2 py-0.5 rounded-full">5</span>
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 text-gray-500 hover:bg-gray-50 rounded-xl font-medium transition-colors">
            {Icons.Map} City Map
          </a>
        </nav>

        {/* Promo / App Download Card (Mimicking the dark card in the reference) */}
        <div className="bg-[#0f241a] text-white p-5 rounded-2xl relative overflow-hidden mt-auto">
          <div className="relative z-10">
            <h4 className="font-bold mb-1 text-sm">Download our<br />Mobile App</h4>
            <p className="text-[10px] text-gray-300 mb-4">Monitor sensors anywhere</p>
            <button className="bg-[#165d3b] text-white text-xs px-4 py-2 rounded-lg font-medium w-full">Download</button>
          </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex flex-col overflow-y-auto">

        {/* HEADER */}
        <header className="flex justify-between items-center px-10 py-6 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="relative w-96">
            <input
              type="text"
              placeholder="Search sensor ID..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#165d3b]/20"
            />
            <span className="absolute left-4 top-3 text-gray-400">🔍</span>
            <span className="absolute right-4 top-2.5 border border-gray-200 rounded text-xs px-1.5 py-0.5 text-gray-400">⌘F</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gray-200 border-2 border-white shadow-sm overflow-hidden">
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Felix" alt="User" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold">Admin Team</div>
              <div className="text-xs text-gray-500">city@ecopulse.gov</div>
            </div>
          </div>
        </header>

        {/* DASHBOARD CONTENT */}
        <div className="p-10 max-w-7xl mx-auto w-full flex flex-col gap-6">

          {/* Title Row */}
          <div className="flex justify-between items-end mb-2">
            <div>
              <h1 className="text-3xl font-bold mb-1">Overview Dashboard</h1>
              <p className="text-gray-500 text-sm">Monitor, analyze, and manage smart city environment.</p>
            </div>
            <div className="flex gap-3">
              <button className="px-5 py-2.5 bg-white text-[#165d3b] border border-[#165d3b] rounded-full text-sm font-medium hover:bg-green-50 transition-colors">
                Export Data
              </button>
              <button className="px-5 py-2.5 bg-[#165d3b] text-white rounded-full text-sm font-medium flex items-center gap-2 shadow-md hover:bg-[#114a2f] transition-colors">
                + Add Sensor
              </button>
            </div>
          </div>

          {/* STAT CARDS ROW */}
          <div className="grid grid-cols-4 gap-6">
            {/* Main Green Card */}
            <div className="bg-[#165d3b] rounded-3xl p-6 text-white shadow-lg relative overflow-hidden group">
              <div className="absolute top-6 right-6 w-8 h-8 rounded-full border border-white/30 flex items-center justify-center transform group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform cursor-pointer">↗</div>
              <div className="text-sm font-medium text-white/80 mb-2">Average AQI</div>
              <div className="text-5xl font-bold mb-4">{avgAqi}</div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-md text-xs font-medium backdrop-blur-md border border-white/10">
                {Icons.ArrowUp} Moderate level
              </div>
            </div>

            {/* White Cards */}
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative group">
              <div className="absolute top-6 right-6 w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 group-hover:text-gray-800 transition-colors cursor-pointer">↗</div>
              <div className="text-sm font-medium text-gray-500 mb-2">Average Temp</div>
              <div className="text-5xl font-bold mb-4 text-gray-800">{avgTemp}<span className="text-2xl text-gray-400">°C</span></div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-md text-xs font-medium border border-gray-100 text-gray-500">
                Normal range
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative group">
              <div className="absolute top-6 right-6 w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 group-hover:text-gray-800 transition-colors cursor-pointer">↗</div>
              <div className="text-sm font-medium text-gray-500 mb-2">Humidity</div>
              <div className="text-5xl font-bold mb-4 text-gray-800">{avgHum}<span className="text-2xl text-gray-400">%</span></div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-md text-xs font-medium border border-gray-100 text-gray-500">
                Slightly humid
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative group">
              <div className="absolute top-6 right-6 w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 group-hover:text-gray-800 transition-colors cursor-pointer">↗</div>
              <div className="text-sm font-medium text-gray-500 mb-2">Active Sensors</div>
              <div className="text-5xl font-bold mb-4 text-gray-800">5<span className="text-2xl text-gray-400">/5</span></div>
              <div className="text-xs font-medium text-[#165d3b]">All nodes online</div>
            </div>
          </div>

          {/* MIDDLE ROW */}
          <div className="grid grid-cols-3 gap-6">
            {/* Chart Area (Spans 2 columns) */}
            <div className="col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg">Sensor Analytics (AQI Trend)</h3>
                <select className="text-xs border border-gray-200 rounded-full px-3 py-1.5 bg-gray-50 font-medium text-gray-600 outline-none">
                  <option>Today</option>
                  <option>This Week</option>
                </select>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} dy={10} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      cursor={{ stroke: '#f3f4f6', strokeWidth: 2 }}
                    />
                    <Line type="monotone" dataKey="aqi" stroke="#165d3b" strokeWidth={4} dot={{ r: 4, fill: '#165d3b', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quick Action / Status Area */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-lg mb-1">System Status</h3>
                <p className="text-sm text-gray-500 mb-6">Monitoring Cassandra DB</p>

                <div className="bg-green-50 p-4 rounded-2xl mb-4 border border-green-100">
                  <div className="font-bold text-[#165d3b] mb-1">Database Sync</div>
                  <div className="text-xs text-[#165d3b]/80">Connected: Localhost 8080</div>
                </div>
              </div>
              <button className="w-full py-3 bg-[#165d3b] text-white rounded-xl font-medium flex justify-center items-center gap-2 hover:bg-[#114a2f] transition-colors">
                Refresh Connection
              </button>
            </div>
          </div>

          {/* BOTTOM ROW */}
          <div className="grid grid-cols-3 gap-6">

            {/* Sensor List (Mimicking Team Collaboration) */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg">Sensor Health</h3>
                <button className="text-xs border border-gray-200 rounded-full px-3 py-1 font-medium text-gray-600 hover:bg-gray-50">Manage</button>
              </div>
              <div className="flex flex-col gap-4">
                {latest.slice(0, 4).map((sensor, idx) => (
                  <div key={sensor.sensor_id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" style={{ backgroundColor: ['#fee2e2', '#dcfce7', '#e0e7ff', '#fef3c7'][idx % 4], color: ['#991b1b', '#166534', '#3730a3', '#92400e'][idx % 4] }}>
                      S{idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold">{sensor.sensor_id}</div>
                      <div className="text-[11px] text-gray-500">Batt: {sensor.battery_status}% · PM2.5: {sensor.pm25_level?.toFixed(0)}</div>
                    </div>
                    <div className={`text-[10px] px-2 py-1 rounded border font-medium ${sensor.aqi_value > 120 ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                      {sensor.aqi_value > 120 ? 'Warning' : 'Good'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Donut Chart (Mimicking Project Progress) */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center relative">
              <h3 className="font-bold text-lg self-start absolute top-6 left-6">City AQI Status</h3>
              <div className="w-48 h-48 mt-8">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="100%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={70}
                      outerRadius={90}
                      paddingAngle={0}
                      dataKey="value"
                      stroke="none"
                      cornerRadius={40}
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-4 text-center mt-2">
                  <div className="text-4xl font-bold text-gray-800">{avgAqi}</div>
                  <div className="text-xs text-gray-500 font-medium">Index Value</div>
                </div>
              </div>
              <div className="flex gap-4 text-xs font-medium mt-6">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#165d3b]"></div> Safe</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-gray-200"></div> Unhealthy</div>
              </div>
            </div>

            {/* Recent Readings (Mimicking Project List) */}
            <div className="bg-[#165d3b] p-6 rounded-3xl shadow-sm relative overflow-hidden text-white flex flex-col">
              <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at top right, #4ade80, transparent 40%)' }}></div>
              <h3 className="font-bold text-lg mb-1 relative z-10">System Uptime</h3>
              <p className="text-xs text-white/70 mb-auto relative z-10">Last database write operation</p>

              <div className="relative z-10 flex flex-col items-center justify-center flex-1">
                <div className="text-5xl font-light font-mono tracking-wider mb-2">
                  {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div className="flex gap-2 mt-4">
                  <button className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">⏸</button>
                  <button className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors">⏹</button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}