/**
 * File operations API — CRUD for HQ files in S3
 * Each user's files are prefixed with their userId
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Resource } from "sst";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

const s3 = new S3Client({});

function getUserId(event: any): string {
  // Extract from Cognito JWT claims
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) throw new Error("Unauthorized");
  return claims.sub;
}

function getUserPrefix(userId: string): string {
  return `users/${userId}/hq/`;
}

export const list: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const prefix = getUserPrefix(userId);
    const continuationToken = event.queryStringParameters?.cursor;

    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: Resource.HqStorage.name,
        Prefix: prefix,
        MaxKeys: 100,
        ContinuationToken: continuationToken,
      })
    );

    const files = (response.Contents || []).map((obj) => ({
      path: obj.Key?.replace(prefix, "") || "",
      size: obj.Size,
      lastModified: obj.LastModified?.toISOString(),
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        files,
        cursor: response.NextContinuationToken,
        truncated: response.IsTruncated,
      }),
    };
  } catch (err) {
    return {
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};

export const get: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const filePath = event.pathParameters?.path;
    if (!filePath) throw new Error("Missing path");

    const key = `${getUserPrefix(userId)}${filePath}`;

    const response = await s3.send(
      new GetObjectCommand({
        Bucket: Resource.HqStorage.name,
        Key: key,
      })
    );

    const body = await response.Body?.transformToString("utf-8");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": response.ContentType || "application/octet-stream",
      },
      body: body || "",
    };
  } catch (err: any) {
    if (err.name === "NoSuchKey") {
      return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
    }
    return {
      statusCode: err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};

export const put: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const filePath = event.pathParameters?.path;
    if (!filePath) throw new Error("Missing path");

    const key = `${getUserPrefix(userId)}${filePath}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: Resource.HqStorage.name,
        Key: key,
        Body: event.body || "",
        ContentType: event.headers?.["content-type"] || "application/octet-stream",
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ path: filePath, status: "uploaded" }),
    };
  } catch (err) {
    return {
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};

export const remove: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const filePath = event.pathParameters?.path;
    if (!filePath) throw new Error("Missing path");

    const key = `${getUserPrefix(userId)}${filePath}`;

    await s3.send(
      new DeleteObjectCommand({
        Bucket: Resource.HqStorage.name,
        Key: key,
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ path: filePath, status: "deleted" }),
    };
  } catch (err) {
    return {
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};
