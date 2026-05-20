const fs = require("fs");
const path = require("path");

const RESULT_DIR = path.join(process.cwd(), "benchmark-results");
const REPORT_PATH = path.join(RESULT_DIR, "benchmark-report.md");

function main() {
  fs.mkdirSync(RESULT_DIR, { recursive: true });

  const files = fs
    .readdirSync(RESULT_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.log("No benchmark JSON files found in benchmark-results/.");
    console.log("Run npm run benchmark:write or npm run benchmark:read first.");
    return;
  }

  const results = files.map((file) => {
    const fullPath = path.join(RESULT_DIR, file);
    return {
      file,
      data: JSON.parse(fs.readFileSync(fullPath, "utf8")),
    };
  });

  const lines = [];
  lines.push("# EcoPulse Benchmark Report");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary Table");
  lines.push("");
  lines.push(
    "| File | Benchmark | Consistency | Workload | Success | Errors | Throughput | Avg Latency | P95 Latency |",
  );
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|");

  for (const result of results) {
    const data = result.data;
    const throughput =
      data.summary.throughput_writes_per_second ??
      data.summary.throughput_reads_per_second ??
      "-";
    const workload =
      data.config.total_records ?? data.config.total_queries ?? "-";

    lines.push(
      `| ${result.file} | ${data.benchmark} | ${data.config.consistency} | ${workload} | ${data.summary.success_count} | ${data.summary.error_count} | ${throughput} ops/s | ${data.latency.avg_ms} ms | ${data.latency.p95_ms} ms |`,
    );
  }

  lines.push("");
  lines.push("## Interpretation for NoSQL Database Mini Project");
  lines.push("");
  lines.push(
    "Benchmark ini membantu menunjukkan karakteristik Cassandra sebagai wide-column NoSQL database. Nilai throughput write yang tinggi mendukung argumen bahwa Cassandra cocok untuk workload IoT/time-series yang terus menerima data sensor.",
  );
  lines.push("");
  lines.push(
    "Bagian latency dan consistency level dapat digunakan untuk menjelaskan trade-off CAP theorem: consistency yang lebih kuat seperti QUORUM atau ALL biasanya menambah latency, sedangkan ONE atau LOCAL_ONE cenderung lebih cepat dan lebih available.",
  );
  lines.push("");
  lines.push(
    "Read benchmark hanya menguji query yang sesuai dengan partition key, yaitu sensor_id. Ini penting karena Cassandra bukan database untuk query ad-hoc fleksibel seperti SQL; data model harus dirancang berdasarkan query pattern.",
  );
  lines.push("");

  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  console.log(`Report generated: ${REPORT_PATH}`);
}

main();
