import { createModelRegistryRegister } from "./global-trust-model-registry-register.mjs";
import { createModelRegistryTransition } from "./global-trust-model-registry-transition.mjs";

export function createModelRegistryWriter(options) {
  return Object.freeze({
    register: createModelRegistryRegister(options),
    transition: createModelRegistryTransition(options),
  });
}
