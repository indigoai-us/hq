/**
 * User Settings Service
 *
 * Per-user settings stored in MongoDB. Extends the existing users collection
 * (synced from Clerk) with app-specific fields like hqDir and notification prefs.
 */

import type { Collection, Db } from 'mongodb';
import { getDb } from '../db/mongo.js';
import { encryptToken, decryptToken } from './token-encryption.js';

export interface NotificationSettings {
  enabled: boolean;
  questionsEnabled: boolean;
  permissionsEnabled: boolean;
  statusUpdatesEnabled: boolean;
}

export interface UserSettings {
  clerkUserId: string;
  hqDir: string | null;
  s3Prefix: string | null;
  notifications: NotificationSettings;
  claudeTokenEncrypted: string | null;
  claudeTokenSetAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateUserSettingsInput {
  hqDir?: string;
  s3Prefix?: string;
  notifications?: Partial<NotificationSettings>;
}

const COLLECTION = 'hq_user_settings';

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  enabled: true,
  questionsEnabled: true,
  permissionsEnabled: true,
  statusUpdatesEnabled: true,
};

function getCollection(db?: Db): Collection<UserSettings> {
  return (db ?? getDb()).collection<UserSettings>(COLLECTION);
}

/**
 * Get settings for a user. Returns null if no settings exist.
 */
export async function getUserSettings(clerkUserId: string): Promise<UserSettings | null> {
  const col = getCollection();
  return col.findOne({ clerkUserId });
}

/**
 * Create settings for a user (first-time setup).
 */
export async function createUserSettings(
  clerkUserId: string,
  input: { hqDir: string; s3Prefix?: string }
): Promise<UserSettings> {
  const col = getCollection();
  const now = new Date();

  const settings: UserSettings = {
    clerkUserId,
    hqDir: input.hqDir,
    s3Prefix: input.s3Prefix ?? null,
    notifications: { ...DEFAULT_NOTIFICATIONS },
    claudeTokenEncrypted: null,
    claudeTokenSetAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await col.insertOne(settings);
  return settings;
}

/**
 * Update settings for a user. Creates the document if it doesn't exist (upsert).
 */
export async function updateUserSettings(
  clerkUserId: string,
  input: UpdateUserSettingsInput
): Promise<UserSettings | null> {
  const col = getCollection();
  const now = new Date();

  const setFields: Record<string, unknown> = { updatedAt: now };

  if (input.hqDir !== undefined) {
    setFields.hqDir = input.hqDir;
  }

  if (input.s3Prefix !== undefined) {
    setFields.s3Prefix = input.s3Prefix;
  }

  if (input.notifications) {
    for (const [key, value] of Object.entries(input.notifications)) {
      if (value !== undefined) {
        setFields[`notifications.${key}`] = value;
      }
    }
  }

  const result = await col.findOneAndUpdate(
    { clerkUserId },
    {
      $set: setFields,
      $setOnInsert: {
        clerkUserId,
        createdAt: now,
        ...(input.hqDir === undefined ? { hqDir: null } : {}),
        ...(input.notifications === undefined
          ? { notifications: { ...DEFAULT_NOTIFICATIONS } }
          : {}),
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  return result ?? null;
}

/**
 * Check if a user has completed onboarding (has hqDir set).
 */
export async function isOnboarded(clerkUserId: string): Promise<boolean> {
  const settings = await getUserSettings(clerkUserId);
  return settings !== null && settings.hqDir !== null;
}

// --- Claude Token Management ---

/**
 * Store an encrypted Claude OAuth token for a user.
 */
export async function setClaudeToken(clerkUserId: string, plainToken: string): Promise<void> {
  const col = getCollection();
  const now = new Date();
  const encrypted = encryptToken(plainToken);

  await col.updateOne(
    { clerkUserId },
    {
      $set: {
        claudeTokenEncrypted: encrypted,
        claudeTokenSetAt: now,
        updatedAt: now,
      },
    },
    { upsert: false }
  );
}

/**
 * Check if a user has a Claude token stored.
 */
export async function hasClaudeToken(clerkUserId: string): Promise<boolean> {
  const settings = await getUserSettings(clerkUserId);
  return settings?.claudeTokenEncrypted !== null && settings?.claudeTokenEncrypted !== undefined;
}

/**
 * Remove the stored Claude token for a user.
 */
export async function removeClaudeToken(clerkUserId: string): Promise<void> {
  const col = getCollection();
  await col.updateOne(
    { clerkUserId },
    {
      $set: {
        claudeTokenEncrypted: null,
        claudeTokenSetAt: null,
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Get the decrypted Claude token for a user (used only by orchestrator).
 */
export async function getDecryptedClaudeToken(clerkUserId: string): Promise<string | null> {
  const settings = await getUserSettings(clerkUserId);
  if (!settings?.claudeTokenEncrypted) return null;
  return decryptToken(settings.claudeTokenEncrypted);
}

/**
 * Ensure indexes exist on the collection.
 * Called once at startup.
 */
export async function ensureUserSettingsIndexes(db?: Db): Promise<void> {
  const col = getCollection(db);
  await col.createIndex({ clerkUserId: 1 }, { unique: true });
}
