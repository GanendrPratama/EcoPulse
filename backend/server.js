const express = require("express");
const cors = require("cors");
const cassandra = require("cassandra-driver");

// ── Cassandra Connection ─────────────────────────────────────────────
const client = new cassandra.Client({
    contactPoints: [process.env.CASSANDRA_HOST || "127.0.0.1"],
    localDataCenter: "dc1",
    keyspace: "ecopulse",
});

// Known sensor IDs (matches the simulator)
const SENSOR_IDS = [
    "JKT-AQI-001",
    "JKT-AQI-002",
    "JKT-AQI-003",
    "JKT-AQI-004",
    "JKT-AQI-005",
];

// ── Express Server ───────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── POST /api/sensors/data ───────────────────────────────────────────
// Receives payload from sensors and writes to Cassandra
app.post("/api/sensors/data", async (req, res) => {
    try {
        const {
            sensor_id,
            temperature_c,
            humidity_percent,
            aqi_value,
            pm25_level,
            battery_status,
        } = req.body;

        if (!sensor_id) {
            return res.status(400).json({ error: "sensor_id is required" });
        }

        const recorded_at = new Date();

        const query = `
      INSERT INTO sensor_readings 
        (sensor_id, recorded_at, temperature_c, humidity_percent, aqi_value, pm25_level, battery_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

        await client.execute(
            query,
            [
                sensor_id,
                recorded_at,
                temperature_c,
                humidity_percent,
                aqi_value,
                pm25_level,
                battery_status,
            ],
            { prepare: true }
        );

        res.status(201).json({
            success: true,
            message: "Sensor data recorded",
            data: { sensor_id, recorded_at },
        });
    } catch (err) {
        console.error("POST /api/sensors/data error:", err.message);
        res.status(500).json({ error: "Failed to write sensor data" });
    }
});

// ── GET /api/sensors/:sensor_id/history ──────────────────────────────
// Returns historical readings for a specific sensor
app.get("/api/sensors/:sensor_id/history", async (req, res) => {
    try {
        const { sensor_id } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const { start_time, end_time } = req.query;

        let query;
        let params;

        if (start_time && end_time) {
            query = `
        SELECT * FROM sensor_readings 
        WHERE sensor_id = ? AND recorded_at >= ? AND recorded_at <= ? 
        LIMIT ?
      `;
            params = [sensor_id, new Date(start_time), new Date(end_time), limit];
        } else if (start_time) {
            query = `
        SELECT * FROM sensor_readings 
        WHERE sensor_id = ? AND recorded_at >= ? 
        LIMIT ?
      `;
            params = [sensor_id, new Date(start_time), limit];
        } else if (end_time) {
            query = `
        SELECT * FROM sensor_readings 
        WHERE sensor_id = ? AND recorded_at <= ? 
        LIMIT ?
      `;
            params = [sensor_id, new Date(end_time), limit];
        } else {
            query = `
        SELECT * FROM sensor_readings 
        WHERE sensor_id = ? 
        LIMIT ?
      `;
            params = [sensor_id, limit];
        }

        const result = await client.execute(query, params, { prepare: true });

        res.json({
            success: true,
            sensor_id,
            count: result.rows.length,
            data: result.rows,
        });
    } catch (err) {
        console.error("GET /api/sensors/:sensor_id/history error:", err.message);
        res.status(500).json({ error: "Failed to fetch sensor history" });
    }
});

// ── GET /api/sensors/latest ──────────────────────────────────────────
// Fetches the most recent reading for all known sensors
app.get("/api/sensors/latest", async (req, res) => {
    try {
        const query = `
      SELECT * FROM sensor_readings 
      WHERE sensor_id = ? 
      LIMIT 1
    `;

        const promises = SENSOR_IDS.map((id) =>
            client.execute(query, [id], { prepare: true })
        );

        const results = await Promise.all(promises);
        const latestReadings = results
            .map((r) => r.rows[0])
            .filter((row) => row !== undefined);

        res.json({
            success: true,
            count: latestReadings.length,
            data: latestReadings,
        });
    } catch (err) {
        console.error("GET /api/sensors/latest error:", err.message);
        res.status(500).json({ error: "Failed to fetch latest readings" });
    }
});

// ── Health Check ─────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
    try {
        await client.execute("SELECT now() FROM system.local");
        res.json({ status: "healthy", cassandra: "connected" });
    } catch (err) {
        res.status(503).json({ status: "unhealthy", cassandra: "disconnected" });
    }
});

// ── Start Server ─────────────────────────────────────────────────────
async function start() {
    try {
        await client.connect();
        console.log("✅ Connected to Cassandra");

        app.listen(PORT, () => {
            console.log(`🚀 EcoPulse API running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("❌ Failed to start server:", err.message);
        process.exit(1);
    }
}

start();
