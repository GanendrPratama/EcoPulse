# Case Study Summary and Implementation in EcoPulse

## 1. Background

Discord is a community-based instant messaging platform in the **Social Networking** domain, focused on efficient text interaction. It provides a pure messaging experience where users build their own communication ecosystems through private and public servers/channels. Discord was designed to address the **feature bloat** challenge common in other platforms — by keeping the infrastructure minimal yet robust, it ensures optimal real-time text coordination without distractions.

## 2. The Data Challenge

Discord must handle **billions of messages** with:
- **Extremely high write throughput** — messages are generated continuously across millions of channels
- **Low latency reads** — users expect instant message loading when opening a channel
- **Horizontal scalability** — the system must scale as the platform grows exponentially
- **Query-pattern-driven access** — the primary operation is "fetch the N most recent messages in channel X"

Traditional databases like MongoDB hit scalability ceilings at the trillion-row scale. Discord adopted **wide-column databases** (Apache Cassandra / ScyllaDB) to overcome these limitations.

## 3. Key Architectural Decisions

### Decision 1: Partition by Channel Identity (`channel_id`)

All messages for a channel are grouped into the same partition. This ensures that fetching messages for a specific channel is a **single-partition read** — the fastest possible operation in Cassandra.

### Decision 2: Time-Bucketed Partitions (`channel_id` + `bucket`)

To prevent unbounded partition growth in very active channels, Discord splits each channel's data into **time-based buckets**. The partition key becomes a compound of `(channel_id, bucket)`, where each bucket covers a time interval.

```
Partition Key = (channel_id, bucket)
Clustering Key = message_id (Snowflake — monotonically increasing, encodes timestamp)
```

This means:
- To show recent messages, the system only reads the **latest bucket**
- Scrolling back in history requests the **previous bucket** on demand
- No single partition grows unbounded, even for extremely active channels

### Decision 3: Clustering by `message_id` (Snowflake IDs)

Within each partition, messages are sorted by `message_id` — a Snowflake-style ID that is monotonically increasing and encodes the creation timestamp. This gives time-ordered retrieval without needing a separate timestamp column for sorting.

### Decision 4: Bookmark-Based Navigation

The partition key acts as a **bookmark**. The system uses it to locate messages from a specific time interval, enabling efficient pagination:
- Load the latest bucket first
- If the user scrolls up, request the previous bucket
- No full-table scan is ever needed

## 4. Discord's Data Model (from the Case Study)

| Partition Key (`channel_id` + `bucket`) | Clustering Key (`message_id`) | `author_id` | `content` | `nonce` |
| :--- | :--- | :--- | :--- | :--- |
| **Channel_A : Bucket_1** | 123456789 (Oldest) | 555 | "Hello!" | 9876 |
| | 123456790 | 666 | "How are you?" | 5432 |
| | 123456795 (Newest) | 555 | "Did you see that?" | 1122 |
| **Channel_A : Bucket_2** | 223456801 | 777 | "New week, new chat" | 3344 |
| **Channel_B : Bucket_1** | 123456999 | 111 | "Testing this channel" | 0000 |

## 5. Key Takeaways from the Case Study

| # | Lesson | Description |
| :--- | :--- | :--- |
| **L1** | **Query-first data modeling** | Design the table schema based on how you will query the data, not based on entity relationships |
| **L2** | **Partition key = access unit** | The partition key determines what data is co-located; choose it to match your most frequent query filter |
| **L3** | **Clustering key = sort order** | The clustering key defines the physical sort order within a partition — optimize for the most common retrieval order |
| **L4** | **Time-series data fits wide-column** | Continuously generated, append-heavy data (messages, sensor readings, logs) is a natural fit for Cassandra |
| **L5** | **Horizontal scalability** | Data distributes evenly across cluster nodes via the partition key hash, enabling linear scale-out |
| **L6** | **Partition-level read isolation** | Reads are scoped to a single partition, so performance stays constant regardless of total data volume |
| **L7** | **Bucket strategy for bounded partitions** | Time-bucketing prevents any single partition from growing too large, maintaining consistent performance |
| **L8** | **High write throughput** | Cassandra's append-only, log-structured storage makes writes extremely fast — critical for high-ingestion workloads |

---

## 6. How Case Study Lessons Are Implemented in EcoPulse

### 6.1 Detailed Implementation Mapping

#### L1: Query-First Data Modeling

| Aspect | Discord | EcoPulse |
| :--- | :--- | :--- |
| **Primary query** | "Get the 50 most recent messages in channel X" | "Get the 50 most recent readings for sensor X" |
| **Table design driver** | The `messages` table is shaped around this query | The `sensor_readings` table is shaped around this query |
| **Implementation** | Schema optimized for `WHERE channel_id = ?` | Schema optimized for `WHERE sensor_id = ?` |

In the code — the backend's history endpoint executes exactly this query:

```sql
SELECT * FROM sensor_readings WHERE sensor_id = ? LIMIT ?
```

#### L2: Partition Key = Access Unit

| Aspect | Discord | EcoPulse |
| :--- | :--- | :--- |
| **Partition Key** | `(channel_id, bucket)` | `(sensor_id)` |
| **Data co-location** | All messages for a channel+bucket on one node | All readings for a sensor on one node |
| **Query efficiency** | Single-partition read per channel view | Single-partition read per sensor view |

In the code — defined in `init.cql`:

```sql
PRIMARY KEY ((sensor_id), recorded_at)
```

> **Note:** EcoPulse uses a simpler single-column partition key (`sensor_id`) instead of Discord's compound partition key (`channel_id + bucket`). This is appropriate because EcoPulse has only 5 sensors with moderate data volume. In a production IoT system with thousands of sensors and years of data, time-bucketing (e.g., `PRIMARY KEY ((sensor_id, month), recorded_at)`) would be advisable.

#### L3: Clustering Key = Sort Order

| Aspect | Discord | EcoPulse |
| :--- | :--- | :--- |
| **Clustering Key** | `message_id` (Snowflake — encodes timestamp) | `recorded_at` (native TIMESTAMP) |
| **Sort Order** | Ascending (oldest to newest within bucket) | **Descending** (newest to oldest) |
| **Effect** | Latest messages at the end of the partition | Latest readings at the **start** of the partition |

In the code — the `DESC` ordering in `init.cql`:

```sql
WITH CLUSTERING ORDER BY (recorded_at DESC);
```

This means `LIMIT 1` instantly returns the **most recent** reading, used by the latest-readings endpoint:

```sql
SELECT * FROM sensor_readings WHERE sensor_id = ? LIMIT 1
```

#### L4: Time-Series Data Fits Wide-Column

| Aspect | Discord | EcoPulse |
| :--- | :--- | :--- |
| **Data type** | Chat messages (continuous text stream) | Sensor readings (continuous IoT stream) |
| **Write pattern** | Users send messages 24/7 | Sensors emit readings every 2-5 seconds |
| **Append-only** | Messages are rarely updated/deleted | Readings are never updated — only inserted |

In the code — `simulator/seed.js` continuously generates and inserts data every 2-5 seconds.

#### L5: Horizontal Scalability

| Aspect | Discord | EcoPulse |
| :--- | :--- | :--- |
| **Scale strategy** | Multi-datacenter Cassandra cluster | Single-node (dev), scalable by design |
| **Data distribution** | Partition key hash distributes across nodes | Same — `sensor_id` hash distributes partitions |
| **Replication** | `NetworkTopologyStrategy` (production) | `SimpleStrategy` with RF=1 (development) |

In the code — keyspace in `init.cql`:

```sql
CREATE KEYSPACE IF NOT EXISTS ecopulse
WITH replication = {
  'class': 'SimpleStrategy',
  'replication_factor': 1
};
```

> **Tip:** For production, this would change to `NetworkTopologyStrategy` with RF=3 across multiple data centers — no application code changes needed, only the keyspace configuration.

#### L6: Partition-Level Read Isolation

| Aspect | Discord | EcoPulse |
| :--- | :--- | :--- |
| **Read scope** | One channel's bucket per query | One sensor's readings per query |
| **Performance guarantee** | O(1) partition lookup + O(N) within partition | Same — constant regardless of total sensor count |
| **Benefit** | Adding millions of channels doesn't slow reads | Adding thousands of sensors doesn't slow reads |

Every read query in `server.js` includes `WHERE sensor_id = ?`, ensuring single-partition access. The latest endpoint parallelizes 5 single-partition reads with `Promise.all()`.

#### L7: Bucketing Strategy (Simplified)

| Aspect | Discord | EcoPulse |
| :--- | :--- | :--- |
| **Bucketing** | Explicit time buckets in partition key | **Not implemented** (simplified for demo) |
| **Reason** | Billions of messages per channel need partitioning | 5 sensors with moderate data volume don't need it yet |
| **Future path** | — | Could add `month` or `day` to partition key for production |

#### L8: High Write Throughput

| Aspect | Discord | EcoPulse |
| :--- | :--- | :--- |
| **Write pattern** | Append-only (log-structured) | Append-only (same) |
| **CQL operation** | `INSERT INTO messages ...` | `INSERT INTO sensor_readings ...` |
| **Prepared statements** | Yes | Yes — `{ prepare: true }` |

Both `server.js` and `seed.js` use prepared statements for optimal write performance:

```javascript
await client.execute(INSERT_CQL, params, { prepare: true });
```

### 6.2 Summary Comparison Table

| Concept | Discord | EcoPulse | Status |
| :--- | :--- | :--- | :--- |
| Wide-column database | Cassandra / ScyllaDB | Apache Cassandra | Implemented |
| Query-first modeling | Messages by channel | Readings by sensor | Implemented |
| Partition key as access unit | `channel_id + bucket` | `sensor_id` | Implemented (simplified) |
| Clustering key for ordering | `message_id` (Snowflake) | `recorded_at` (DESC) | Implemented |
| Time-bucketed partitions | `bucket` in partition key | — | Not needed at current scale |
| High write throughput | Billions/day | Continuous simulator writes | Demonstrated |
| Horizontal scalability | Multi-DC cluster | Single-node (design supports scale-out) | Architecture ready |
| Prepared statements | Yes | Yes (`{ prepare: true }`) | Implemented |
| Bookmark-based pagination | Bucket-level navigation | Time-range filtering via API params | Implemented |
| Real-time data retrieval | Fetch latest messages | Auto-refresh dashboard (5s interval) | Implemented |

---

## 7. Conceptual Analogy Summary

```
+---------------------------------------------------------------------------+
|                        DISCORD (Case Study)                              |
|                                                                          |
|   "Fetch the 50 most recent MESSAGES in CHANNEL_A"                       |
|                                                                          |
|   +--------------+    +-------------+    +------------------+            |
|   |  channel_id  |--->|  message_id |--->| author, content, |            |
|   | (Partition)  |    | (Clustering)|    | nonce            |            |
|   +--------------+    +-------------+    +------------------+            |
|                                                                          |
|                   =======  maps to  =======                              |
|                                                                          |
|                      ECOPULSE (This Project)                             |
|                                                                          |
|   "Fetch the 50 most recent READINGS for SENSOR_JKT-AQI-001"            |
|                                                                          |
|   +--------------+    +-------------+    +------------------+            |
|   |  sensor_id   |--->| recorded_at |--->| temp, humidity,  |            |
|   | (Partition)  |    | (Clustering)|    | aqi, pm25, bat   |            |
|   +--------------+    +-------------+    +------------------+            |
|                                                                          |
+---------------------------------------------------------------------------+
```

> The core insight from both Discord and EcoPulse is the same: **when your access pattern is "get the most recent N items for entity X", a wide-column database with entity as partition key and time as clustering key is the optimal data model.** This pattern applies to chat messages, sensor readings, activity logs, financial transactions, and any other time-series data.
