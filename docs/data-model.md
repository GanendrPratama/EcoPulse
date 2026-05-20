# EcoPulse Detailed Data Model Diagram

## High-Level Architecture & Data Flow

![Architecture & Data Flow](https://hackmd.io/_uploads/SJBGnuokfe.png)

## Cassandra Keyspace & Table Schema

![Schema](https://hackmd.io/_uploads/SJwzaOsJGg.png)

## Primary Key Structure

The primary key design is the most critical aspect of Cassandra data modeling. EcoPulse uses a compound primary key with two parts:

```txt
PRIMARY KEY ((sensor_id), recorded_at)
                  │                │
                  │                └── Clustering Key — sorts rows WITHIN a partition
                  │                    (ordered DESC = newest first)
                  │
                  └── Partition Key — determines WHICH node stores the data
                      (one partition per sensor)
```

| Key Component | Column | Role | Effect |
| :--- | :--- | :--- | :--- |
| **Partition Key** | `sensor_id` | Determines data placement across cluster nodes | All readings from sensor `JKT-AQI-001` live on the same node/partition |
| **Clustering Key** | `recorded_at` | Sorts rows within a partition | Readings are physically sorted by timestamp descending $\rightarrow$ latest first |

## On-Disk Partition Layout (Wide-Column View)

This is how Cassandra physically stores the data. Each partition key value creates a "wide row" where clustering columns extend horizontally. For example,

### PARTITION: sensor_id = "JKT-AQI-001"

| recorded_at (DESC) | temp_c | humidity | aqi | pm25 | battery |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-04-30 08:00:10 | 30.1 | 72 | 130 | 48.5 | 86 |
| 2026-04-30 08:00:05 | 29.7 | 71 | 124 | 46.8 | 87 |
| 2026-04-30 08:00:00 | 29.5 | 70 | 120 | 45.2 | 88 |
| ... | ... | ... | ... | ... | ... |

### PARTITION: sensor_id = "JKT-AQI-002"

| recorded_at (DESC) | temp_c | humidity | aqi | pm25 | battery |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-04-30 08:00:00 | 30.2 | 68 | 95 | 31.4 | 91 |
| ... | ... | ... | ... | ... | ... |



## Query Patterns Supported by This Model

The schema is designed query-first — the table structure was derived from the access patterns, not the other way around:

| # | Query Pattern | CQL | Why It's Efficient |
| :--- | :--- | :--- | :--- |
| 1 | Get latest reading for a sensor | `SELECT * FROM sensor_readings WHERE sensor_id = ? LIMIT 1` | Hits exactly one partition; `DESC` clustering returns newest row first |
| 2 | Get last N readings for a sensor | `SELECT * FROM sensor_readings WHERE sensor_id = ? LIMIT ?` | Single-partition scan, data pre-sorted on disk |
| 3 | Get readings in a time range | `SELECT * FROM sensor_readings WHERE sensor_id = ? AND recorded_at >= ? AND recorded_at <= ?` | Clustering key enables efficient range scan within a partition |
| 4 | Insert a new reading | `INSERT INTO sensor_readings (...) VALUES (...)` | Append-only write to the partition — extremely fast in Cassandra |