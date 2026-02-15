/**
 * Resolve HQ data source for the current request user.
 *
 * Returns an S3DataSource when the user has completed S3 provisioning,
 * or a LocalDataSource as fallback (tests, pre-S3 users).
 */

import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { getUserSettings } from './user-settings.js';
import type { DataSource } from './data-source.js';
import { LocalDataSource } from './local-data-source.js';
import { S3DataSource } from './s3-data-source.js';

export class SetupRequiredError extends Error {
  constructor() {
    super('Setup required — configure your HQ directory');
    this.name = 'SetupRequiredError';
  }
}

/**
 * Get the HQ directory for the authenticated user.
 * Throws SetupRequiredError if user hasn't completed onboarding.
 */
export async function getUserHqDir(request: FastifyRequest): Promise<string> {
  // In test mode or when MongoDB is not configured, use the global config
  if (config.skipAuth || !config.mongodbUri) {
    return config.hqDir;
  }

  const userId = request.user?.userId;
  if (!userId) {
    return config.hqDir;
  }

  const settings = await getUserSettings(userId);
  if (!settings?.hqDir) {
    throw new SetupRequiredError();
  }

  return settings.hqDir;
}

/**
 * Get a DataSource for the authenticated user.
 *
 * Resolution order:
 * 1. skipAuth / no MongoDB → LocalDataSource(config.hqDir)  (tests)
 * 2. User has s3Prefix → S3DataSource
 * 3. User has hqDir but no s3Prefix → LocalDataSource  (pre-S3 legacy)
 * 4. No settings → SetupRequiredError
 */
export async function getDataSource(request: FastifyRequest): Promise<DataSource> {
  if (config.skipAuth || !config.mongodbUri) {
    return new LocalDataSource(config.hqDir);
  }

  const userId = request.user?.userId;
  if (!userId) {
    return new LocalDataSource(config.hqDir);
  }

  const settings = await getUserSettings(userId);

  if (settings?.s3Prefix) {
    return new S3DataSource({
      bucketName: config.s3BucketName,
      region: config.s3Region,
      prefix: settings.s3Prefix,
    });
  }

  if (settings?.hqDir) {
    return new LocalDataSource(settings.hqDir);
  }

  throw new SetupRequiredError();
}
