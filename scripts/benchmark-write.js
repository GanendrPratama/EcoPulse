const {
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
} = require("./benchmark-utils");

const INSERT_CQL = `
  INSERT INTO sensor_readings
    (sensor_id, recorded_at, temperature_c, humidity_percent, aqi_value, pm25_level, battery_status)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

async function main() {
  const totalRecords = envInt("BENCHMARK_RECORDS", 10000);
  const concurrency = envInt("BENCHMARK_CONCURRENCY", 100);
  const sensorCount = envInt("BENCHMARK_SENSOR_COUNT", 100);
  const warmupRecords = envInt("BENCHMARK_WARMUP_RECORDS", 200);
  const errorSampleLimit = envInt("BENCHMARK_ERROR_SAMPLE_LIMIT", 10);
  const targetAqiMultiplier = envFloat("BENCHMARK_AQI_MULTIPLIER", 1);
  const consistency = parseConsistencyLevel();

  const client = createCassandraClient();
  const sensorIds = buildSensorIds(sensorCount);
  const latenciesMs = [];
  const errorSamples = [];

  let successCount = 0;
  let errorCount = 0;

  console.log("🌿 EcoPulse Cassandra write benchmark starting...");
  console.log(`Host: ${envString("CASSANDRA_HOST", "127.0.0.1")}`);
  console.log(`Keyspace: ${envString("CASSANDRA_KEYSPACE", "ecopulse")}`);
  console.log(`Consistency: ${consistency.name}`);

  await client.connect();

  console.log(`Running warmup insertions: ${warmupRecords}`);
  await runWithConcurrency(
    warmupRecords,
    Math.min(concurrency, 25),
    async (index) => {
      const sensorId = sensorIds[index % sensorIds.length];
      const reading = generateReading(sensorId, -warmupRecords + index);
      await client.execute(
        toParamsQuery(),
        toParams(reading, targetAqiMultiplier),
        {
          prepare: true,
          consistency: consistency.value,
        },
      );
    },
  );

  console.log(`\nRunning measured write benchmark: ${totalRecords} records`);
  const benchmarkStart = process.hrtime.bigint();

  await runWithConcurrency(totalRecords, concurrency, async (index) => {
    const sensorId = sensorIds[index % sensorIds.length];
    const reading = generateReading(sensorId, index);
    const queryStart = process.hrtime.bigint();

    try {
      await client.execute(
        toParamsQuery(),
        toParams(reading, targetAqiMultiplier),
        {
          prepare: true,
          consistency: consistency.value,
        },
      );
      latenciesMs.push(toMs(queryStart));
      successCount += 1;
    } catch (error) {
      errorCount += 1;
      if (errorSamples.length < errorSampleLimit) {
        errorSamples.push(error.message);
      }
    }
  });

  const totalDurationMs = toMs(benchmarkStart);
  const throughput = successCount / (totalDurationMs / 1000);

  const result = {
    benchmark: "cassandra_write_throughput",
    created_at: new Date().toISOString(),
    config: {
      database: "Apache Cassandra",
      host: envString("CASSANDRA_HOST", "127.0.0.1"),
      datacenter: envString("CASSANDRA_DATACENTER", "dc1"),
      keyspace: envString("CASSANDRA_KEYSPACE", "ecopulse"),
      consistency: consistency.name,
      total_records: totalRecords,
      concurrency,
      sensor_count: sensorCount,
      warmup_records: warmupRecords,
    },
    summary: {
      success_count: successCount,
      error_count: errorCount,
      total_duration_ms: Number(totalDurationMs.toFixed(3)),
      throughput_writes_per_second: Number(throughput.toFixed(2)),
      error_rate_percent: Number(
        ((errorCount / totalRecords) * 100).toFixed(3),
      ),
    },
    latency: summarizeLatencies(latenciesMs),
    error_samples: errorSamples,
    interpretation: {
      write_heavy_workload:
        "Semakin tinggi throughput writes/second dengan error rate rendah, semakin baik database menangani beban sensor IoT yang terus menulis data.",
      consistency_tradeoff:
        "Coba bandingkan CASSANDRA_CONSISTENCY=LOCAL_ONE, ONE, LOCAL_QUORUM, QUORUM, dan ALL. Consistency yang lebih kuat biasanya menambah latency.",
      nosql_relevance:
        "Cassandra cocok untuk time-series write-heavy karena data bisa dipartisi berdasarkan sensor_id dan ditulis secara paralel tanpa JOIN.",
    },
  };

  printSummary("Cassandra Write Benchmark Result", result);

  const paths = saveBenchmarkResult("write-benchmark", result);
  console.log(`\nSaved JSON result: ${paths.jsonPath}`);
  console.log(`Saved CSV result: ${paths.csvPath}`);

  await client.shutdown();
}

function toParamsQuery() {
  return INSERT_CQL;
}

function toParams(reading, targetAqiMultiplier) {
  return [
    reading.sensor_id,
    reading.recorded_at,
    reading.temperature_c,
    reading.humidity_percent,
    Math.round(reading.aqi_value * targetAqiMultiplier),
    reading.pm25_level,
    reading.battery_status,
  ];
}

main().catch(async (error) => {
  console.error("❌ Write benchmark failed:", error);
  process.exit(1);
});
