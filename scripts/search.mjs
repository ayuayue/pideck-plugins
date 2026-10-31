#!/usr/bin/env node
// 命令行搜索：本仓库收录的插件 + GitHub 上打了 pideck-plugin topic 的第三方插件。
//
//   node scripts/search.mjs [关键词] [--registry|--github|--all] [--json] [--limit N]
//
//   --registry  只查本仓库 registry.json（离线，读的是你本地这份）
//   --github    只查 GitHub topic:pideck-plugin（联网；未审阅，按星标倒序）
//   --all       两边都查（默认）
//   --json      输出 JSON（给脚本用）
//   --limit N   GitHub 最多取前 N 个仓库（默认 30，上限 100）
//
// 需要能直连 api.github.com 与 raw.githubusercontent.com；设 GITHUB_TOKEN 可以提高限额。
// PiDeck 应用里的市场搜索走 Electron 的 net.fetch，会跟随 PiDeck 自己的代理设置。
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const GITHUB_TOPIC = "pideck-plugin";
const MANIFEST_FILE = "pideck-plugin.json";
const root = resolve(import.meta.dirname, "..");

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((token) => token.startsWith("--") && !/^--(limit)$/.test(token)));
const keyword = argv.find((token) => !token.startsWith("--")) ?? "";
const limitIndex = argv.indexOf("--limit");
const limit = Math.min(100, Math.max(1, Number(argv[limitIndex + 1]) || 30));
const asJson = flags.has("--json");
const source = flags.has("--registry") ? "registry" : flags.has("--github") ? "github" : "all";

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const headers = { Accept: "application/vnd.github+json", "User-Agent": "pideck-plugins-search", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

function matches(haystack, needle) {
	if (!needle) return true;
	return haystack.some((value) => typeof value === "string" && value.toLowerCase().includes(needle));
}

function installUrl(entry) {
	if (!entry.subpath) return `https://github.com/${entry.repo}`;
	return `https://github.com/${entry.repo}/tree/${entry.ref ?? "main"}/${entry.subpath}`;
}

async function searchRegistry() {
	const path = join(root, "registry.json");
	if (!existsSync(path)) throw new Error("registry.json 不存在");
	const registry = JSON.parse(await readFile(path, "utf8"));
	const entries = (Array.isArray(registry.plugins) ? registry.plugins : [])
		.filter((entry) => matches([entry.id, entry.name, entry.description, entry.author, ...(entry.tags ?? [])], keyword))
		.map((entry) => ({
			source: "registry",
			id: entry.id,
			name: entry.name,
			version: entry.version,
			description: entry.description,
			author: entry.author,
			license: entry.license,
			permissions: entry.permissions ?? [],
			repo: entry.repo,
			installUrl: installUrl(entry),
			homepage: entry.homepage ?? `https://github.com/${entry.repo}`,
			reviewed: true,
		}));
	return entries;
}

async function searchGitHub() {
	const url = `https://api.github.com/search/repositories?q=topic:${GITHUB_TOPIC}&sort=stars&order=desc&per_page=${limit}`;
	const response = await fetch(url, { headers });
	if (!response.ok) throw new Error(`GitHub 搜索失败：HTTP ${response.status}${response.status === 403 ? "（多半是未认证限额，设 GITHUB_TOKEN 再试）" : ""}`);
	const payload = await response.json();
	const repos = (Array.isArray(payload.items) ? payload.items : []).filter((item) => !item.fork && !item.archived);

	const entries = [];
	for (const repo of repos) {
		// 社区源只认仓库根的 pideck-plugin.json（单仓库多插件请走 registry 的 subpath）。
		const raw = `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/${MANIFEST_FILE}`;
		let manifest;
		try {
			const manifestResponse = await fetch(raw, { headers });
			if (!manifestResponse.ok) continue;
			manifest = JSON.parse(await manifestResponse.text());
		} catch {
			continue;
		}
		if (typeof manifest?.id !== "string") continue;
		if (!matches([repo.full_name, repo.description, manifest.name, manifest.description, manifest.id], keyword)) continue;
		entries.push({
			source: "github",
			id: manifest.id,
			name: manifest.name,
			version: manifest.version,
			description: manifest.description ?? repo.description,
			permissions: Array.isArray(manifest.permissions) ? manifest.permissions : [],
			repo: repo.full_name,
			stars: repo.stargazers_count,
			updatedAt: repo.pushed_at,
			license: repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : undefined,
			installUrl: `https://github.com/${repo.full_name}`,
			homepage: repo.html_url,
			reviewed: false,
		});
	}
	return entries;
}

const tasks = [];
if (source !== "github") tasks.push(["registry", searchRegistry]);
if (source !== "registry") tasks.push(["github", searchGitHub]);

const settled = await Promise.allSettled(tasks.map(([, run]) => run()));
const entries = [];
const warnings = [];
settled.forEach((result, index) => {
	const [label] = tasks[index];
	if (result.status === "fulfilled") entries.push(...result.value);
	else warnings.push(`${label}: ${result.reason?.message ?? result.reason}`);
});

if (source === "all" && settled.every((result) => result.status === "rejected")) {
	console.error(`✗ 两个源都失败了：\n${warnings.map((warning) => `  - ${warning}`).join("\n")}`);
	process.exit(1);
}

if (asJson) {
	console.log(JSON.stringify({ keyword, entries, warnings }, null, "\t"));
} else {
	console.log(keyword ? `关键词：${keyword}\n` : "");
	if (!entries.length) console.log("（没有匹配的插件）");
	for (const entry of entries) {
		const badge = entry.reviewed ? "收录" : `社区${entry.stars !== undefined ? ` ${entry.stars}★` : ""}`;
		console.log(`[${badge}] ${entry.id}${entry.version ? `@${entry.version}` : ""} — ${entry.name ?? ""}`);
		if (entry.description) console.log(`         ${entry.description}`);
		if (entry.permissions?.length) console.log(`         权限：${entry.permissions.join(", ")}`);
		console.log(`         安装：${entry.installUrl}`);
		console.log(`         来源：${entry.repo}${entry.license ? ` · ${entry.license}` : ""}`);
	}
	for (const warning of warnings) console.log(`\n! ${warning}`);
	console.log(`\n共 ${entries.length} 条（收录 ${entries.filter((entry) => entry.reviewed).length}，社区 ${entries.filter((entry) => !entry.reviewed).length}）`);
}
