export function createGlobalTrustFaceLabEphemeralS3Lifecycle({
  s3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  compareFaces,
} = {}) {
  if (!s3Client || typeof s3Client.send !== "function") {
    throw new TypeError("s3Client.send is required");
  }
  if (typeof PutObjectCommand !== "function") {
    throw new TypeError("PutObjectCommand is required");
  }
  if (typeof DeleteObjectCommand !== "function") {
    throw new TypeError("DeleteObjectCommand is required");
  }
  if (typeof compareFaces !== "function") {
    throw new TypeError("compareFaces is required");
  }

  return Object.freeze({
    async compareEphemeralReference({
      bucket,
      key,
      body,
      contentType = "image/jpeg",
      target,
      similarityThreshold,
    } = {}) {
      if (typeof bucket !== "string" || bucket.length === 0) {
        throw new TypeError("bucket is required");
      }
      if (typeof key !== "string" || key.length === 0) {
        throw new TypeError("key is required");
      }
      if (body == null) {
        throw new TypeError("body is required");
      }
      if (!target || typeof target !== "object") {
        throw new TypeError("target is required");
      }

      const reference = { bucket, key };

      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }));

      let compareResult;
      let compareError;
      try {
        compareResult = await compareFaces({
          source: reference,
          target,
          similarityThreshold,
        });
      } catch (error) {
        compareError = error;
      } finally {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          }));
        } catch (deleteError) {
          if (compareError) {
            throw new AggregateError(
              [compareError, deleteError],
              "compareFaces failed and ephemeral S3 cleanup also failed",
            );
          }
          throw deleteError;
        }
      }

      if (compareError) {
        throw compareError;
      }

      return Object.freeze({
        reference,
        comparison: compareResult,
        deleted: true,
      });
    },
  });
}
