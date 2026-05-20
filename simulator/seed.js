const cassandra = require("cassandra-driver");

// ── Cassandra Connection ─────────────────────────────────────────────
const client = new cassandra.Client({
    contactPoints: [process.env.CASSANDRA_HOST || "127.0.0.1"],
    localDataCenter: "dc1",
    keyspace: "ecopulse",
});

// ── Sensor Configuration ─────────────────────────────────────────────
const SENSORS = [
    "JKT-AQI-001",
    "JKT-AQI-002",
    "JKT-AQI-003",
    "JKT-AQI-004",
    "JKT-AQI-005",
];

// ── Helper: Random number in range ───────────────────────────────────
function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
}

// ── Generate a realistic sensor reading ──────────────────────────────
function generateReading(sensorId) {
    return {
        sensor_id: sensorId,
        recorded_at: new Date(),
        temperature_c: parseFloat(rand(24, 33).toFixed(1)),
        humidity_percent: randInt(60, 90),
        aqi_value: randInt(0, 300),
        pm25_level: parseFloat(rand(0, 150).toFixed(1)),
        battery_status: randInt(50, 100),
    };
}

// ── Insert a reading into Cassandra ──────────────────────────────────
const INSERT_CQL = `
  INSERT INTO sensor_readings 
    (sensor_id, recorded_at, temperature_c, humidity_percent, aqi_value, pm25_level, battery_status)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

async function insertReading(reading) {
    const params = [
        reading.sensor_id,
        reading.recorded_at,
        reading.temperature_c,
        reading.humidity_percent,
        reading.aqi_value,
        reading.pm25_level,
        reading.battery_status,
    ];

    await client.execute(INSERT_CQL, params, { prepare: true });
}

// ── Main simulation loop ─────────────────────────────────────────────
async function simulate() {
    console.log("EcoPulse Simulator starting...");
    await client.connect();
    console.log("Connected to Cassandra");

    const tick = async () => {
        // Pick a random sensor for this tick
        const sensorId = SENSORS[Math.floor(Math.random() * SENSORS.length)];
        const reading = generateReading(sensorId);

        try {
            await insertReading(reading);
            console.log(
                `📡 [${reading.recorded_at.toISOString()}] ${sensorId} → ` +
                `Temp: ${reading.temperature_c}°C | ` +
                `Humidity: ${reading.humidity_percent}% | ` +
                `AQI: ${reading.aqi_value} | ` +
                `PM2.5: ${reading.pm25_level} | ` +
                `Battery: ${reading.battery_status}%`
            );
        } catch (err) {
            console.error(`Error inserting for ${sensorId}:`, err.message);
        }

        // Schedule next tick in 2-5 seconds
        const delay = randInt(2000, 5000);
        setTimeout(tick, delay);
    };

    tick();
}

// ── Start ────────────────────────────────────────────────────────────
simulate().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
