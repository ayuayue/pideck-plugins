#!/usr/bin/env node
// 校验本仓库的每个插件 / 模板，并核对 registry.json 与 manifest 的一致性。
//
//   node scripts/validate.mjs                  校验
//   node scripts/validate.mjs --fix            回填 registry.json 的派生字段并按 id 排序
//   node scripts/validate.mjs --pideck <路径>   额外用 PiDeck 自己的打包脚本复核一遍包预算
//
// 判定口径是 PiDeck 安装校验的镜像（见 scripts/lib/hostPlugin.mjs 顶部说明）：
// 这里通过 ≠ 一定装得上，但这里失败基本就是真失败。CI 跑的就是这个命令。
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MANIFEST_FILE, SERVABLE_EXTENSIONS, collectPackage, validateManifest } from "./lib/hostPlugin.mjs";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const fix = args.includes("--fix");
const pideckIndex = args.indexOf("--pideck");
const pideckRoot = pideckIndex === -1 ? undefined : resolve(args[pideckIndex + 1] ?? "");

const DOCUMENTATION_FILES = ["README.md", "CHANGELOG.md", "LICENSE", "LICENSE.md", "NOTICE"];

const errors = [];
const warnings = [];

async function listDirectories(parent) {
	if (!existsSync(parent)) return [];
	const entries = await readdir(parent, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.map((entry) => entry.name)
		.sort();
}

async function readManifest(directory) {
	const path = join(directory, MANIFEST_FILE);
	if (!existsSync(path)) {
		errors.push(`${rel(directory)}: 缺少 ${MANIFEST_FILE}`);
		return undefined;
	}
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		errors.push(`${rel(path)}: 读不到（${error.message}）`);
		return undefined;
	}
	try {
		return JSON.parse(raw);
	} catch (error) {
		errors.push(`${rel(path)}: 不是合法 JSON（${error.message}）`);
		return undefined;
	}
}

function rel(absolute) {
	return absolute.slice(root.length + 1).split("\\").join("/");
}

function fail(label, issues) {
	errors.push(`${label}:\n${issues.map((issue) => `    - ${issue}`).join("\n")}`);
}

/** 单个插件包：manifest + 包预算 + 入口文件存在性。返回 manifest 供 registry 核对。 */
async function inspect(directory, label, { requireIdMatch }) {
	const manifest = await readManifest(directory);
	if (manifest === undefined) return undefined;
	const issues = validateManifest(manifest, requireIdMatch ? { directory: label.split("/").at(-1) } : {});
	const { files, issues: packageIssues } = await collectPackage(directory);
	issues.push(...packageIssues);
	if (!files.some((file) => file.path === MANIFEST_FILE)) issues.push(`包里没有 ${MANIFEST_FILE}`);
	for (const panel of Array.isArray(manifest?.contributes?.panels) ? manifest.contributes.panels : []) {
		if (typeof panel?.entry !== "string") continue;
		if (!files.some((file) => file.path === panel.entry)) issues.push(`面板入口 ${panel.entry} 不在包里`);
	}
	for (const file of files) {
		// README/LICENSE 这类文件本来就不该被页面引用，别刷提醒。
		if (DOCUMENTATION_FILES.includes(file.path)) continue;
		const dot = file.path.lastIndexOf(".");
		const extension = dot === -1 ? "" : file.path.slice(dot).toLowerCase();
		if (!SERVABLE_EXTENSIONS.includes(extension)) warnings.push(`${label}: ${file.path} 的扩展名 ${extension || "(无)"} 不能通过 pideck-plugin:// 提供给页面（能进包，但引用不到）`);
	}
	if (!files.some((file) => file.path === "README.md")) warnings.push(`${label}: 没有 README.md`);
	if (issues.length) fail(label, issues);
	else console.log(`✓ ${label}`);
	return manifest;
}

/** registry 条目里由 manifest 派生的那一半，必须逐字段相等。 */
function derived(manifest) {
	const panels = Array.isArray(manifest?.contributes?.panels) ? manifest.contributes.panels : [];
	const presentations = [...new Set(panels.map((panel) => panel?.presentation ?? "modal"))];
	return {
		name: manifest?.name,
		version: manifest?.version,
		description: manifest?.description,
		permissions: Array.isArray(manifest?.permissions) ? [...manifest.permissions] : [],
		icon: panels[0]?.icon,
		presentations,
	};
}

function sameValue(left, right) {
	if (Array.isArray(left) || Array.isArray(right)) return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
	return (left ?? null) === (right ?? null);
}

function registryEntry(id, manifest) {
	const entry = { id, ...derived(manifest) };
	if (entry.description === undefined) delete entry.description;
	if (entry.icon === undefined) delete entry.icon;
	return entry;
}

async function main() {
	console.log(`仓库：${root}\n`);

	// ---- 模板：结构必须合法，但不进 registry（模板不是可收录的插件）----
	const templateNames = await listDirectories(join(root, "templates"));
	if (!templateNames.length) warnings.push("templates/ 下没有模板");
	for (const name of templateNames) await inspect(join(root, "templates", name), `templates/${name}`, { requireIdMatch: false });

	// ---- 插件：结构合法 + 目录名必须等于 manifest.id ----
	const pluginNames = await listDirectories(join(root, "plugins"));
	const manifests = new Map();
	for (const name of pluginNames) {
		const manifest = await inspect(join(root, "plugins", name), `plugins/${name}`, { requireIdMatch: true });
		if (manifest !== undefined) manifests.set(name, manifest);
	}

	// ---- registry.json：存在性、形状、与 manifest 的一致性 ----
	const registryPath = join(root, "registry.json");
	let registry;
	if (!existsSync(registryPath)) {
		errors.push("registry.json 不存在");
	} else {
		try {
			registry = JSON.parse(await readFile(registryPath, "utf8"));
		} catch (error) {
			errors.push(`registry.json: 不是合法 JSON（${error.message}）`);
		}
	}

	if (registry !== undefined) {
		if (registry.schemaVersion !== 1) errors.push(`registry.json: schemaVersion 必须是 1（现在是 ${JSON.stringify(registry.schemaVersion)}）`);
		if (!Array.isArray(registry.plugins)) {
			errors.push("registry.json: plugins 必须是数组");
		} else {
			const seen = new Set();
			let changed = false;
			for (const [index, entry] of registry.plugins.entries()) {
				const at = `registry.json plugins[${index}]`;
				if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
					errors.push(`${at}: 必须是对象`);
					continue;
				}
				if (typeof entry.id !== "string" || !entry.id) {
					errors.push(`${at}: 缺少 id`);
					continue;
				}
				if (seen.has(entry.id)) errors.push(`${at}: id 重复（${entry.id}）`);
				seen.add(entry.id);
				if (!manifests.has(entry.id)) {
					errors.push(`${at}: id ${entry.id} 在 plugins/ 下没有对应目录`);
					continue;
				}
				for (const field of ["author", "license", "repo"]) {
					if (typeof entry[field] !== "string" || !entry[field].trim()) errors.push(`${at}: 缺少 ${field}`);
				}
				if (typeof entry.repo === "string" && !/^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/.test(entry.repo)) errors.push(`${at}: repo 必须写成 owner/name`);
				if (entry.tags !== undefined && (!Array.isArray(entry.tags) || !entry.tags.every((tag) => typeof tag === "string" && tag.trim()))) errors.push(`${at}: tags 必须是非空字符串数组`);
				if (entry.subpath !== undefined && !/^[A-Za-z0-9._/-]{1,240}$/.test(entry.subpath)) errors.push(`${at}: subpath 只能包含 A-Za-z0-9._/-`);
				if (entry.ref !== undefined && !/^[A-Za-z0-9._/-]{1,120}$/.test(entry.ref)) errors.push(`${at}: ref 只能包含 A-Za-z0-9._/-`);
				if (entry.homepage !== undefined && (typeof entry.homepage !== "string" || !entry.homepage.startsWith("https://"))) errors.push(`${at}: homepage 必须是 https:// 开头的字符串`);

				const expected = derived(manifests.get(entry.id));
				const mismatched = Object.keys(expected).filter((field) => !sameValue(entry[field], expected[field]));
				if (mismatched.length && fix) {
					Object.assign(entry, registryEntry(entry.id, manifests.get(entry.id)));
					changed = true;
				} else if (mismatched.length) {
					for (const field of mismatched) errors.push(`${at}: ${field} 与 manifest 不一致（registry=${JSON.stringify(entry[field])}，manifest=${JSON.stringify(expected[field])}）—— 跑 node scripts/validate.mjs --fix 回填`);
				}
			}
			// 每个插件目录都必须被收录。
			for (const name of pluginNames) {
				if (seen.has(name)) continue;
				const skeleton = { id: name, ...registryEntry(name, manifests.get(name) ?? {}), author: "TODO", license: "MIT", repo: "ayuayue/pideck-plugins", ref: "main", subpath: `plugins/${name}` };
				errors.push(`registry.json 里没有 ${name}，加一条（author 请填真人/组织名）：\n${JSON.stringify(skeleton, null, "\t").split("\n").map((line) => `    ${line}`).join("\n")}`);
			}
			if (fix && changed) {
				registry.plugins.sort((left, right) => String(left.id).localeCompare(String(right.id)));
				await writeFile(registryPath, `${JSON.stringify(registry, null, "\t")}\n`);
				console.log("✓ registry.json 已回填派生字段并按 id 排序");
			}
		}
	}

	// ---- 可选：用 PiDeck 自己的实现复核包预算（权威口径）----
	if (pideckRoot !== undefined) {
		const packer = join(pideckRoot, "scripts", "pack-host-plugin.mjs");
		if (!existsSync(packer)) {
			errors.push(`--pideck 指向的目录里没有 scripts/pack-host-plugin.mjs：${pideckRoot}`);
		} else {
			for (const name of pluginNames) {
				try {
					execFileSync(process.execPath, [packer, join(root, "plugins", name), join(root, "dist", `${name}.pideck-plugin`)], { stdio: "pipe" });
					console.log(`✓ PiDeck 复核 plugins/${name}`);
				} catch (error) {
					const detail = [error.stdout, error.stderr].map((buffer) => String(buffer ?? "").trim()).filter(Boolean).join(" ");
					errors.push(`PiDeck 复核 plugins/${name} 失败：${detail || error.message}`);
				}
			}
		}
	}

	console.log("");
	for (const warning of warnings) console.log(`! ${warning}`);
	if (errors.length) {
		console.error(`\n✗ ${errors.length} 项不通过：\n`);
		for (const error of errors) console.error(`  ${error}`);
		process.exit(1);
	}
	console.log(`\n✓ ${pluginNames.length} 个插件、${templateNames.length} 个模板全部通过${warnings.length ? `（${warnings.length} 条提醒）` : ""}`);
}

await main();
