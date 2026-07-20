import {
  createFoundationProgressOperations,
} from "./progress-foundation-operations.mjs";
import {
  createAdoptionProgressOperations,
} from "./progress-adoption-operations.mjs";

export function createProgressOperations(ctx) {
  return Object.freeze({
    ...createFoundationProgressOperations(ctx),
    ...createAdoptionProgressOperations(ctx),
  });
}
