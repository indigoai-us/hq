/**
 * S3 bucket infrastructure types for HQ Cloud file sync.
 *
 * Bucket structure: /{userId}/hq/ mirrors local HQ directory.
 */

/** S3 bucket configuration for HQ file storage */
export interface S3BucketConfig {
  /** Bucket name (e.g., hq-cloud-files-{env}) */
  bucketName: string;
  /** AWS region for the bucket */
  region: string;
  /** Enable versioning for file history */
  versioning: boolean;
  /** Encryption configuration */
  encryption: EncryptionConfig;
  /** Lifecycle rules for version management */
  lifecycleRules: LifecycleRule[];
  /** CORS configuration for web access */
  corsRules: CorsRule[];
  /** Public access block settings */
  publicAccessBlock: PublicAccessBlockConfig;
}

/** Server-side encryption configuration */
export interface EncryptionConfig {
  /** Encryption algorithm (AES256 or aws:kms) */
  algorithm: 'AES256' | 'aws:kms';
  /** KMS key ARN (required when algorithm is aws:kms) */
  kmsKeyArn?: string;
  /** Apply to all objects by default */
  bucketKeyEnabled: boolean;
}

/** Lifecycle rule for managing object versions */
export interface LifecycleRule {
  /** Rule identifier */
  id: string;
  /** Whether the rule is enabled */
  enabled: boolean;
  /** Prefix filter (empty = all objects) */
  prefix: string;
  /** Transition rules for storage class changes */
  transitions: LifecycleTransition[];
  /** Number of days to retain noncurrent versions */
  noncurrentVersionExpiration?: number;
  /** Number of noncurrent versions to retain */
  noncurrentVersionsToRetain?: number;
  /** Abort incomplete multipart uploads after N days */
  abortIncompleteMultipartUploadDays?: number;
}

/** Storage class transition */
export interface LifecycleTransition {
  /** Days after creation to transition */
  days: number;
  /** Target storage class */
  storageClass: 'STANDARD_IA' | 'INTELLIGENT_TIERING' | 'GLACIER' | 'DEEP_ARCHIVE';
}

/** CORS rule for bucket */
export interface CorsRule {
  /** Allowed origins */
  allowedOrigins: string[];
  /** Allowed HTTP methods */
  allowedMethods: ('GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD')[];
  /** Allowed headers */
  allowedHeaders: string[];
  /** Exposed headers */
  exposedHeaders: string[];
  /** Max age in seconds for preflight cache */
  maxAgeSeconds: number;
}

/** Public access block configuration */
export interface PublicAccessBlockConfig {
  blockPublicAcls: boolean;
  ignorePublicAcls: boolean;
  blockPublicPolicy: boolean;
  restrictPublicBuckets: boolean;
}

/** IAM policy statement for S3 access */
export interface S3PolicyStatement {
  /** Statement ID */
  sid: string;
  /** Effect: Allow or Deny */
  effect: 'Allow' | 'Deny';
  /** IAM principal(s) */
  principal: string | { AWS: string | string[] };
  /** S3 actions */
  actions: string[];
  /** Resource ARNs */
  resources: string[];
  /** Optional conditions */
  conditions?: Record<string, Record<string, string | string[]>>;
}

/** IAM policy document for S3 bucket */
export interface S3BucketPolicy {
  version: '2012-10-17';
  statements: S3PolicyStatement[];
}

/** User-scoped S3 path configuration */
export interface UserS3Path {
  /** User identifier */
  userId: string;
  /** Base prefix in S3: {userId}/hq/ */
  prefix: string;
  /** Full S3 URI: s3://{bucket}/{userId}/hq/ */
  uri: string;
}

/** S3 object metadata attached to synced files */
export interface SyncObjectMetadata {
  /** SHA-256 hash of file content */
  contentHash: string;
  /** Original local file path (relative to HQ root) */
  localPath: string;
  /** Timestamp of last local modification (ISO 8601) */
  lastModifiedLocal: string;
  /** User who uploaded the file */
  uploadedBy: string;
  /** Sync agent version */
  syncAgentVersion: string;
}

/** Result of a bucket creation/validation operation */
export interface BucketOperationResult {
  success: boolean;
  bucketName: string;
  region: string;
  arn: string;
  error?: string;
}

/** Predefined folder prefixes within a user's HQ space */
export const HQ_FOLDER_STRUCTURE = [
  'knowledge/',
  'projects/',
  'workers/',
  'workspace/',
  'workspace/checkpoints/',
  'workspace/threads/',
  'workspace/orchestrator/',
  'workspace/learnings/',
  'social-content/',
  'social-content/drafts/',
] as const;

export type HQFolder = (typeof HQ_FOLDER_STRUCTURE)[number];
