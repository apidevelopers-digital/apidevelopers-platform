import assert from "node:assert/strict";
import test from "node:test";

import { runOpenCvYuNetSFaceLabPipelineV1 } from "../src/yunet-sface-lab-pipeline-v1.mjs";

test("pipeline entrypoint exists and requires real pinned artifacts", async () => {
  await assert.rejects(
    () => runOpenCvYuNetSFaceLabPipelineV1({
      yunetModelPath: "/nonexistent/yunet.onnx",
      sfaceModelPath: "/ineditent/sface.onnx",
      imagePath: "/ineditent/photo.jpg",
    }),
    (error) => error.code === "lab_file_not_found",
  );
});
