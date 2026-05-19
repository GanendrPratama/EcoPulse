-- EcoPulse: Cassandra Initialization Script
-- Creates the keyspace and sensor_readings table

CREATE KEYSPACE IF NOT EXISTS ecopulse
WITH replication = {
  'class': 'SimpleStrategy',
  'replication_factor': 1
};

USE ecopulse;

CREATE TABLE IF NOT EXISTS sensor_readings (
  sensor_id    TEXT,
  recorded_at  TIMESTAMP,
  temperature_c FLOAT,
  humidity_percent INT,
  aqi_value    INT,
  pm25_level   FLOAT,
  battery_status INT,
  PRIMARY KEY ((sensor_id), recorded_at)
) WITH CLUSTERING ORDER BY (recorded_at DESC);
