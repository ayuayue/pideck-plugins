#!/usr/bin/env node
// 从模板生成一个新插件目录。
//
//   node scripts/new-plugin.mjs <id> --template <minimal|sessions|network> --name "我的插件" [选项]
//
//   --template <name>      模板名，见 templates/（默认 minimal）
//   --name "<名字>"        面板显示名（默认用 id）
//   --description "<描述>" 一句话描述（默认取模板自带的那句）
//   --out <目录>           输出目录（默认 plugins/<id>）
//   --force                目标目录已存在时覆盖
//
// 生成出来的目录会：① 把 manifest 的 id/name/version/description 换成你的；
// ② 把模板里的占位 id 全部替换成新 id；③ 在 README 顶部加一段说明。
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { MANIFEST_FILE, isPluginId } from "./lib/hostPlugin.mjs";

const root = resolve(import.meta.dirname, "..");

function usage(message) {
	if (message) console.error(`✗ ${message}\n`);
	console.error('用法: node scripts/new-plugin.mjs <id> --template <minimal|sessions|network> --name "我的插件" [--description "…"] [--out <目录>] [--force]');
	process.exit(1);
}

const argv = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let index = 0; index < argv.length; index += 1) {
	const token = argv[index];
	if (!token.startsWith("--")) {
		positional.push(token);
		continue;
	}
	const name = token.slice(2);
	if (name === "force") {
		flags.set("force", "true");
		continue;
	}
	const value = argv[index + 1];
	if (value === undefined || value.startsWith("--")) usage(`--${name} 后面缺值`);
	flags.set(name, value);
	index += 1;
}

const id = positional[0];
if (!id) usage("缺少插件 id");
if (!isPluginId(id)) usage(`id 不合法：${id}（要求 ^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$，≤80 字符）`);

const templateName = flags.get("template") ?? "minimal";
const templateRoot = join(root, "templates", templateName);
if (!existsSync(join(templateRoot, MANIFEST_FILE))) usage(`没有这个模板：templates/${templateName}`);

const name = flags.get("name") ?? id;
if (name.length > 160) usage("--name 最多 160 字符");

const target = resolve(flags.get("out") ?? join(root, "plugins", id));
if (existsSync(target) && !flags.has("force")) usage(`目标已存在：${target}（要覆盖就加 --force）`);

async function copyTree(from, to) {
	await mkdir(to, { recursive: true });
	for (const entry of await readdir(from, { withFileTypes: true })) {
		const source = join(from, entry.name);
		const destination = join(to, entry.name);
		if (entry.isDirectory()) await copyTree(source, destination);
		else if (entry.isFile()) await writeFile(destination, await readFile(source));
	}
}

const TEXT_EXTENSIONS = [".json", ".md", ".html", ".js", ".mjs", ".css"];
const templateManifest = JSON.parse(await readFile(join(templateRoot, MANIFEST_FILE), "utf8"));
const templateId = templateManifest.id;

await copyTree(templateRoot, target);

const manifestPath = join(target, MANIFEST_FILE);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.id = id;
manifest.name = name;
manifest.version = "0.1.0";
if (flags.has("description")) manifest.description = flags.get("description");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);

// 模板里的占位 id（README 的用法行等）与 {{name}} 一并换成真值。
for (const entry of await readdir(target, { withFileTypes: true })) {
	if (!entry.isFile()) continue;
	const dot = entry.name.lastIndexOf(".");
	if (!TEXT_EXTENSIONS.includes(dot === -1 ? "" : entry.name.slice(dot).toLowerCase())) continue;
	const path = join(target, entry.name);
	const text = await readFile(path, "utf8");
	const replaced = text.split(templateId).join(id).split("{{name}}").join(name);
	if (replaced !== text) await writeFile(path, replaced);
}

const readmePath = join(target, "README.md");
if (existsSync(readmePath)) {
	const note = [
		`> 由 \`templates/${templateName}\` 生成（\`node scripts/new-plugin.mjs ${id} --template ${templateName}\`）。`,
		`> 安装目录名必须等于 \`${MANIFEST_FILE}\` 里的 \`id\`：\`${id}\`。`,
		"> 下面「用法」一节讲的是怎么从模板再生成一个插件，对这个已经生成好的目录不适用。",
		"",
		"",
	].join("\n");
	await writeFile(readmePath, note + (await readFile(readmePath, "utf8")));
}

const insideRepo = target === root || target.startsWith(root + sep);
const relative = insideRepo ? target.slice(root.length + 1).split(sep).join("/") : target;
console.log(`✓ 已生成 ${relative}/`);
if (!insideRepo) console.log(`! 目标不在仓库里：registry 条目的 subpath 需要你自己换成仓库内的相对路径。`);
console.log(`\n下一步：`);
console.log(`  1. 改 ${relative}/app.js 与 ${relative}/app.html；`);
console.log(`  2. 校验：node scripts/validate.mjs（会在 registry.json 那步报缺条目，下面这条直接粘进去，author 换成你自己）；`);
console.log(`  3. 试装：把 ${relative}/ 整个目录拷进 PiDeck 的宿主插件目录（设置 → 插件 → 打开目录），或「安装插件 → 从文件夹」。\n`);
console.log(
	JSON.stringify(
		{ id, name, version: "0.1.0", description: manifest.description, permissions: manifest.permissions, author: "TODO", license: "MIT", repo: "ayuayue/pideck-plugins", ref: "main", subpath: relative },
		null,
		"\t",
	),
);
