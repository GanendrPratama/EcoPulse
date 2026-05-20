const fs = require("fs");
const path = require("path");
const cassandra = require("cassandra-driver");

const DEFAULT_SENSOR_PREFIXES = ["JKT", "BDG", "SBY", "DPS", "MDN", "MKS"];

function envInt(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "")
    return defaultValue;

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer. Received: ${value}`);
  }

  return parsed;
}

function envFloat(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "")
    return defaultValue;

  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number. Received: ${value}`);
  }

  return parsed;
}

function envString(name, defaultValue) {
  const value = process.env[name];
  return value === undefined || value === null || value === ""
    ? defaultValue
    : value;
}

function createCassandraClient() {
  return new cassandra.Client({
    contactPoints: [envString("CASSANDRA_HOST", "127.0.0.1")],
    localDataCenter: envString("CASSANDRA_DATACENTER", "dc1"),
    keyspace: envString("CASSANDRA_KEYSPACE", "ecopulse"),
    pooling: {
      coreConnectionsPerHost: {
        [cassandra.types.distance.local]: envInt(
          "CASSANDRA_CORE_CONNECTIONS",
          2,
        ),
      },
    },
  });
}

function parseConsistencyLevel() {
  const raw = envString("CASSANDRA_CONSISTENCY", "LOCAL_ONE").toUpperCase();
  const map = {
    ANY: cassandra.types.consistencies.any,
    ONE: cassandra.types.consistencies.one,
    TWO: cassandra.types.consistencies.two,
    THREE: cassandra.types.consistencies.three,
    QUORUM: cassandra.types.consistencies.quorum,
    ALL: cassandra.types.consistencies.all,
    LOCAL_QUORUM: cassandra.types.consistencies.localQuorum,
    EACH_QUORUM: cassandra.types.consistencies.eachQuorum,
    LOCAL_ONE: cassandra.types.consistencies.localOne,
  };

  if (!map[raw]) {
    throw new Error(
      `Unsupported CASSANDRA_CONSISTENCY=${raw}. Use ONE, LOCAL_ONE, QUORUM, LOCAL_QUORUM, or ALL.`,
    );
  }

  return { name: raw, value: map[raw] };
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function buildSensorIds(sensorCount) {
  const sensors = [];

  for (let i = 1; i <= sensorCount; i += 1) {
    const prefix =
      DEFAULT_SENSOR_PREFIXES[(i - 1) % DEFAULT_SENSOR_PREFIXES.length];
    sensors.push(`${prefix}-AQI-${String(i).padStart(4, "0")}`);
  }

  return sensors;
}

function generateReading(sensorId, sequenceNumber) {
  const baseTimestamp = Date.now();

  return {
    sensor_id: sensorId,
    recorded_at: new Date(baseTimestamp + sequenceNumber),
    temperature_c: Number(rand(24, 38).toFixed(1)),
    humidity_percent: randInt(45, 95),
    aqi_value: randInt(0, 300),
    pm25_level: Number(rand(0, 180).toFixed(1)),
    battery_status: randInt(20, 100),
  };
}

function toMs(startHrtime) {
  return Number(process.hrtime.bigint() - startHrtime) / 1_000_000;
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function summarizeLatencies(latenciesMs) {
  if (latenciesMs.length === 0) {
    return {
      min_ms: 0,
      avg_ms: 0,
      p50_ms: 0,
      p90_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
      max_ms: 0,
    };
  }

  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);

  return {
    min_ms: Number(sorted[0].toFixed(3)),
    avg_ms: Number((sum / sorted.length).toFixed(3)),
    p50_ms: Number(percentile(sorted, 50).toFixed(3)),
    p90_ms: Number(percentile(sorted, 90).toFixed(3)),
    p95_ms: Number(percentile(sorted, 95).toFixed(3)),
    p99_ms: Number(percentile(sorted, 99).toFixed(3)),
    max_ms: Number(sorted[sorted.length - 1].toFixed(3)),
  };
}

async function runWithConcurrency(totalJobs, concurrency, worker) {
  let currentIndex = 0;
  let completedJobs = 0;

  async function runner() {
    while (currentIndex < totalJobs) {
      const jobIndex = currentIndex;
      currentIndex += 1;
      await worker(jobIndex);
      completedJobs += 1;

      const progressStep = Math.max(1, Math.floor(totalJobs / 10));
      if (completedJobs % progressStep === 0 || completedJobs === totalJobs) {
        const percentage = ((completedJobs / totalJobs) * 100).toFixed(0);
        console.log(`Progress: ${completedJobs}/${totalJobs} (${percentage}%)`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, totalJobs) }, () =>
    runner(),
  );

  await Promise.all(workers);
}

function saveBenchmarkResult(filePrefix, result) {
  const outputDir = path.join(process.cwd(), "benchmark-results");
  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `${filePrefix}-${timestamp}.json`);
  const csvPath = path.join(outputDir, `${filePrefix}-${timestamp}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  const csvRows = [
    ["metric", "value"],
    ...flattenObject(result).map(([key, value]) => [key, value]),
  ];

  fs.writeFileSync(
    csvPath,
    csvRows.map((row) => row.map(escapeCsv).join(",")).join("\n"),
  );

  return { jsonPath, csvPath };
}

function flattenObject(object, prefix = "") {
  const rows = [];

  for (const [key, value] of Object.entries(object)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      rows.push(...flattenObject(value, nextKey));
    } else {
      rows.push([nextKey, value]);
    }
  }

  return rows;
}

function escapeCsv(value) {
  const stringValue = String(value);
  if (
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes('"')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function printSummary(title, result) {
  console.log("\n========================================");
  console.log(title);
  console.log("========================================");
  console.table(result.summary);
  console.log("Latency distribution:");
  console.table(result.latency);
  console.log("Configuration:");
  console.table(result.config);
}

module.exports = {
  buildSensorIds,
  createCassandraClient,
  envFloat,
  envInt,
  envString,
  generateReading,
  parseConsistencyLevel,
  printSummary,
  runWithConcurrency,
  saveBenchmarkResult,
  summarizeLatencies,
  toMs,
};
