#!/usr/bin/env node
// 把 plugins/ 下的每个插件打包成 dist/<id>.pideck-plugin（NDJSON，逐文件 sha256）。
//
//   node scripts/pack-all.mjs [输出目录]     默认 dist/
//
// 格式与 PiDeck 的 scripts/pack-host-plugin.mjs 完全一致，用户可以把这个文件
// 拖进 PiDeck 的「安装插件 → 从文件」，也可以在 GitHub Release 里当附件发。
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MANIFEST_FILE, collectPackage, packPackage } from "./lib/hostPlugin.mjs";

const root = resolve(import.meta.dirname, "..");
const output = resolve(process.argv[2] ?? join(root, "dist"));

const pluginsRoot = join(root, "plugins");
if (!existsSync(pluginsRoot)) {
	console.error("✗ 没有 plugins/ 目录");
	process.exit(1);
}

/** 相对仓库根显示；输出目录在仓库外时退回绝对路径。 */
const show = (path) => (path.startsWith(root) ? path.slice(root.length + 1).split("\\").join("/") : path);

const names = (await readdir(pluginsRoot, { withFileTypes: true }))
	.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
	.map((entry) => entry.name)
	.sort();
if (!names.length) {
	console.error("✗ plugins/ 下没有插件");
	process.exit(1);
}

await mkdir(output, { recursive: true });
let failed = 0;

for (const name of names) {
	const directory = join(pluginsRoot, name);
	if (!existsSync(join(directory, MANIFEST_FILE))) {
		console.error(`✗ plugins/${name}: 缺少 ${MANIFEST_FILE}`);
		failed += 1;
		continue;
	}
	const { files, issues } = await collectPackage(directory);
	if (issues.length) {
		console.error(`✗ plugins/${name}:`);
		for (const issue of issues) console.error(`    - ${issue}`);
		failed += 1;
		continue;
	}
	const archive = packPackage(files);
	const path = join(output, `${name}.pideck-plugin`);
	await writeFile(path, archive);
	console.log(`✓ ${name}: ${files.length} 个文件 → ${show(path)}（${Buffer.byteLength(archive)} 字节）`);
}

if (failed) {
	console.error(`\n✗ ${failed} 个插件打包失败`);
	process.exit(1);
}
console.log(`\n✓ ${names.length} 个插件已打包到 ${output}`);
