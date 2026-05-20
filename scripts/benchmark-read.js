const {
  buildSensorIds,
  createCassandraClient,
  envInt,
  envString,
  parseConsistencyLevel,
  printSummary,
  runWithConcurrency,
  saveBenchmarkResult,
  summarizeLatencies,
  toMs,
} = require("./benchmark-utils");

const READ_HISTORY_CQL = `
  SELECT sensor_id, recorded_at, temperature_c, humidity_percent, aqi_value, pm25_level, battery_status
  FROM sensor_readings
  WHERE sensor_id = ?
  LIMIT ?
`;

async function main() {
  const totalQueries = envInt("BENCHMARK_QUERIES", 2000);
  const concurrency = envInt("BENCHMARK_CONCURRENCY", 50);
  const sensorCount = envInt("BENCHMARK_SENSOR_COUNT", 100);
  const historyLimit = envInt("BENCHMARK_HISTORY_LIMIT", 50);
  const errorSampleLimit = envInt("BENCHMARK_ERROR_SAMPLE_LIMIT", 10);
  const consistency = parseConsistencyLevel();

  const client = createCassandraClient();
  const sensorIds = buildSensorIds(sensorCount);
  const latenciesMs = [];
  const errorSamples = [];

  let successCount = 0;
  let errorCount = 0;
  let rowsReturned = 0;

  console.log("🌿 EcoPulse Cassandra read benchmark starting...");
  console.log(`Host: ${envString("CASSANDRA_HOST", "127.0.0.1")}`);
  console.log(`Keyspace: ${envString("CASSANDRA_KEYSPACE", "ecopulse")}`);
  console.log(`Consistency: ${consistency.name}`);

  await client.connect();

  console.log(`Running measured read benchmark: ${totalQueries} queries`);
  const benchmarkStart = process.hrtime.bigint();

  await runWithConcurrency(totalQueries, concurrency, async (index) => {
    const sensorId = sensorIds[index % sensorIds.length];
    const queryStart = process.hrtime.bigint();

    try {
      const result = await client.execute(
        READ_HISTORY_CQL,
        [sensorId, historyLimit],
        {
          prepare: true,
          consistency: consistency.value,
        },
      );
      latenciesMs.push(toMs(queryStart));
      rowsReturned += result.rowLength;
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
    benchmark: "cassandra_read_history_latency",
    created_at: new Date().toISOString(),
    config: {
      database: "Apache Cassandra",
      host: envString("CASSANDRA_HOST", "127.0.0.1"),
      datacenter: envString("CASSANDRA_DATACENTER", "dc1"),
      keyspace: envString("CASSANDRA_KEYSPACE", "ecopulse"),
      consistency: consistency.name,
      total_queries: totalQueries,
      concurrency,
      sensor_count: sensorCount,
      history_limit: historyLimit,
    },
    summary: {
      success_count: successCount,
      error_count: errorCount,
      rows_returned: rowsReturned,
      avg_rows_per_query: Number(
        (rowsReturned / Math.max(successCount, 1)).toFixed(2),
      ),
      total_duration_ms: Number(totalDurationMs.toFixed(3)),
      throughput_reads_per_second: Number(throughput.toFixed(2)),
      error_rate_percent: Number(
        ((errorCount / totalQueries) * 100).toFixed(3),
      ),
    },
    latency: summarizeLatencies(latenciesMs),
    error_samples: errorSamples,
    interpretation: {
      query_pattern:
        "Read benchmark ini menguji pola query utama Cassandra: mencari history berdasarkan partition key sensor_id.",
      partition_key:
        "Query cepat terjadi karena WHERE sensor_id = ? memakai partition key, bukan scan seluruh tabel.",
      limitation:
        "Cassandra tidak fleksibel seperti SQL untuk query ad-hoc. Query harus mengikuti desain primary key dan query pattern sejak awal.",
    },
  };

  printSummary("Cassandra Read Benchmark Result", result);

  const paths = saveBenchmarkResult("read-benchmark", result);
  console.log(`\nSaved JSON result: ${paths.jsonPath}`);
  console.log(`Saved CSV result: ${paths.csvPath}`);

  await client.shutdown();
}

main().catch((error) => {
  console.error("❌ Read benchmark failed:", error);
  process.exit(1);
});
