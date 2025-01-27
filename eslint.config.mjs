// @ts-check

import * as importx from "importx";

// eslint-disable-next-line no-restricted-syntax
const mod = await importx.import("./eslint.config.mts", {
  cache: true,
  loader: "tsx",
  parentURL: import.meta.url,
});

export default mod.default;
