import { commitTypes } from "./release.config.ts";

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", commitTypes.map((t) => t.type)],
  },
};
