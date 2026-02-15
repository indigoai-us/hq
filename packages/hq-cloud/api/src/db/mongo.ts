/**
 * MongoDB connection management.
 *
 * Connects to MongoDB Atlas (or local) using the native driver.
 * Provides a singleton Db instance for the application.
 */

import { MongoClient, type Db } from 'mongodb';
import { config } from '../config.js';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connect to MongoDB. Safe to call multiple times — returns existing connection.
 */
export async function connectMongo(): Promise<Db> {
  if (db) return db;

  if (!config.mongodbUri) {
    throw new Error('MONGODB_URI is not configured');
  }

  client = new MongoClient(config.mongodbUri);
  await client.connect();
  db = client.db(); // uses the database from the URI
  return db;
}

/**
 * Get the current Db instance. Throws if not connected.
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongo() first.');
  }
  return db;
}

/**
 * Disconnect from MongoDB. Called during shutdown.
 */
export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

/**
 * Reset connection state (for testing).
 */
export function resetMongo(): void {
  client = null;
  db = null;
}
