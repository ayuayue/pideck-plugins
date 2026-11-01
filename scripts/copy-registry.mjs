import { copyFile, mkdir } from "node:fs/promises";

// 页面运行时抓 registry.json，构建时把它一起放进产物。
await mkdir("site", { recursive: true });
await copyFile("registry.json", "site/registry.json");
console.log("copied registry.json -> site/registry.json");
