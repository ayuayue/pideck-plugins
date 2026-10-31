// PiDeck 宿主插件契约的**镜像校验**（零依赖）。
//
// 为什么是镜像而不是引用：本仓库要在没有 PiDeck 检出、没有 node_modules 的 CI 里
// 独立校验，所以把 src/main/plugins/hostPluginManifest.ts + hostPluginNetworkPolicy.ts
// + src/shared/hostPluginIcons.ts + src/shared/localServices.ts 的判定口径抄了一份。
// 代价是会漂移：**最终判定永远以 PiDeck 安装时的那一份为准**，这里的结论只是提前拦错。
// 想拿真实口径复核，用 `node scripts/validate.mjs --pideck <PiDeck 检出路径>`，
// 它会额外跑一遍 PiDeck 自己的 scripts/pack-host-plugin.mjs（包预算与资产路径的权威实现）。
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const MANIFEST_FILE = "pideck-plugin.json";

export const PERMISSIONS = [
	"sessions.read",
	"sessions.read.workspace",
	"workbench.navigate",
	"workbench.openExternal",
	"network.https",
	"network.local",
	"service.local",
	"sessionGroups.manage",
];

/** 图标是渲染层按名静态映射的，未知名字 fail-closed 拒装。 */
export const ICONS = ["bar-chart", "activity", "database", "table", "calendar", "file-text", "terminal", "globe", "git-branch", "message", "clock", "layers"];

/** PiDeck 已实现的本地服务适配器：插件只能「点名」，新增服务必须先在 PiDeck 里写适配器。 */
export const LOCAL_SERVICE_IDS = ["billion-context"];

export const PRESENTATIONS = ["modal", "popover", "page"];

/** 能通过 pideck-plugin:// 服务给面板页的扩展名；其余文件可以进包，但页面引用不到。 */
export const SERVABLE_EXTENSIONS = [".html", ".js", ".mjs", ".css", ".json", ".svg", ".png", ".jpg", ".webp", ".woff2"];

export const BUDGET = { assetBytes: 4 * 1024 * 1024, packageBytes: 16 * 1024 * 1024, fileCount: 100, depth: 8 };

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const ASSET_PATTERN = /^[A-Za-z0-9_./-]+$/;

export const isPluginId = (value) => typeof value === "string" && value.length <= 80 && ID_PATTERN.test(value);

export function isAssetPath(value) {
	if (typeof value !== "string" || value.length > 240 || !ASSET_PATTERN.test(value) || value.startsWith("/")) return false;
	return value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

/** manifest 里的 label 字段口径：非空、≤160、无控制字符。 */
function isLabel(value) {
	return typeof value === "string" && value.trim().length > 0 && value.length <= 160 && !/[\u0000-\u001f]/.test(value);
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 与 hostPluginNetworkPolicy.ts 的 isPublicPluginAddress 同一口径：映射/转换/隧道/特殊用途地址不算 HTTPS 目的地。 */
export function isPublicPluginAddress(address) {
	if (isIP(address) === 4) {
		const [a, b, c] = address.split(".").map(Number);
		return !(
			a === 0 ||
			a === 10 ||
			a === 127 ||
			a >= 224 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
			(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
			(a === 203 && b === 0 && c === 113)
		);
	}
	if (isIP(address) !== 6 || address.includes("%")) return false;
	const [left, right = ""] = address.split("::");
	const first = left ? left.split(":") : [];
	const last = right ? right.split(":") : [];
	const parts = [...first, ...Array(Math.max(0, 8 - first.length - last.length)).fill("0"), ...last].map((part) => Number.parseInt(part, 16));
	const [a, b] = parts;
	return a >= 0x2000 && a <= 0x3fff && a !== 0x2002 && a !== 0x3fff && !(a === 0x2001 && (b <= 0x01ff || b === 0x0db8));
}

/** 返回规范化后的 origin，或返回 undefined（不合法）。 */
export function parseHttpsOrigin(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 2048 || /[\s\u0000-\u001f\u007f\\?#*]/.test(value)) return undefined;
	let url;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return undefined;
	if (!url.hostname || !/^[a-z0-9.:[\]-]+$/i.test(url.hostname)) return undefined;
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	if (hostname === "localhost" || hostname.endsWith(".localhost")) return undefined;
	if (isIP(hostname) !== 0 && !isPublicPluginAddress(hostname)) return undefined;
	return url.origin;
}

/** 收集 manifest 的全部问题（不是遇到第一个就停），返回人类可读的字符串数组。 */
export function validateManifest(manifest, { directory } = {}) {
	const issues = [];
	if (!isRecord(manifest)) return ["manifest 不是 JSON 对象"];
	if (manifest.schemaVersion !== 1) issues.push(`schemaVersion 必须是数字 1（现在是 ${JSON.stringify(manifest.schemaVersion)}）`);
	if (manifest.apiVersion !== 1) issues.push(`apiVersion 必须是数字 1（现在是 ${JSON.stringify(manifest.apiVersion)}）`);
	if (!isPluginId(manifest.id)) issues.push("id 必须是 ^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$ 且 ≤80 字符");
	else if (directory !== undefined && manifest.id !== directory) issues.push(`id 必须等于目录名（id=${manifest.id}，目录=${directory}）`);
	if (!isLabel(manifest.name)) issues.push("name 必须是非空字符串、≤160 字符、无控制字符");
	if (!isLabel(manifest.version)) issues.push("version 必须是非空字符串、≤160 字符（只用于展示，授权不看它）");
	if (manifest.description !== undefined && (typeof manifest.description !== "string" || manifest.description.length > 1000)) issues.push("description 必须是 ≤1000 字符的字符串");

	const rawPermissions = manifest.permissions;
	if (!Array.isArray(rawPermissions)) {
		issues.push("permissions 必须是数组（没有权限就写 []）");
		return issues;
	}
	for (const permission of rawPermissions) if (!PERMISSIONS.includes(permission)) issues.push(`未知权限：${JSON.stringify(permission)}（未知权限会直接拒装）`);
	if (new Set(rawPermissions).size !== rawPermissions.length) issues.push("permissions 里有重复项");
	const permissions = rawPermissions.filter((permission) => PERMISSIONS.includes(permission));
	if (permissions.includes("sessions.read.workspace") && !permissions.includes("sessions.read")) issues.push("sessions.read.workspace 必须同时声明 sessions.read（它只是范围扩展）");

	// services 与 service.local 互为必需。
	const declaresService = permissions.includes("service.local");
	if (manifest.services === undefined) {
		if (declaresService) issues.push("声明了 service.local 就必须给 services（1–8 个已实现的本地服务 id）");
	} else if (!declaresService) {
		issues.push("没有 service.local 权限就不能填 services");
	} else if (!Array.isArray(manifest.services) || manifest.services.length < 1 || manifest.services.length > 8) {
		issues.push("services 必须是 1–8 个元素的数组");
	} else {
		for (const id of manifest.services) if (!LOCAL_SERVICE_IDS.includes(id)) issues.push(`services 里的 ${JSON.stringify(id)} 不是 PiDeck 已实现的本地服务（当前只有：${LOCAL_SERVICE_IDS.join(", ")}）`);
		if (new Set(manifest.services).size !== manifest.services.length) issues.push("services 里有重复项");
	}

	// network 与网络权限互为必需，且只允许对应权限的那一半。
	const wantsHttps = permissions.includes("network.https");
	const wantsLocal = permissions.includes("network.local");
	if (manifest.network === undefined) {
		if (wantsHttps || wantsLocal) issues.push("声明了网络权限就必须给 network 目的地清单");
	} else if (!isRecord(manifest.network)) {
		issues.push("network 必须是对象");
	} else {
		const keys = Object.keys(manifest.network);
		for (const key of keys) if (key !== "httpsOrigins" && key !== "localPorts") issues.push(`network 不接受字段 ${key}`);
		if (!wantsHttps && !wantsLocal) issues.push("没有网络权限就不能填 network");
		if (manifest.network.httpsOrigins !== undefined && !wantsHttps) issues.push("network.httpsOrigins 需要 network.https 权限");
		if (manifest.network.localPorts !== undefined && !wantsLocal) issues.push("network.localPorts 需要 network.local 权限");
		if (wantsHttps) {
			const origins = manifest.network.httpsOrigins;
			if (!Array.isArray(origins) || origins.length < 1 || origins.length > 16) {
				issues.push("network.httpsOrigins 必须是 1–16 个元素的数组");
			} else {
				const normalized = [];
				for (const origin of origins) {
					const parsed = parseHttpsOrigin(origin);
					if (parsed === undefined) issues.push(`不是合法的 HTTPS origin：${JSON.stringify(origin)}（要 https://host[:port]，不能带路径/通配符/查询串，不能是 localhost 或内网 IP）`);
					else normalized.push(parsed);
				}
				if (new Set(normalized).size !== normalized.length) issues.push("network.httpsOrigins 里有重复项");
			}
		}
		if (wantsLocal) {
			const ports = manifest.network.localPorts;
			if (!Array.isArray(ports) || ports.length < 1 || ports.length > 16 || !ports.every((port) => typeof port === "number" && Number.isInteger(port) && port >= 1 && port <= 65535)) {
				issues.push("network.localPorts 必须是 1–16 个 1–65535 的整数");
			} else if (new Set(ports).size !== ports.length) {
				issues.push("network.localPorts 里有重复项");
			}
		}
	}

	const contributes = manifest.contributes;
	if (!isRecord(contributes) || !Array.isArray(contributes.panels) || !Array.isArray(contributes.commands)) {
		issues.push("contributes 必须是 { panels: [...], commands: [...] }");
		return issues;
	}
	if (contributes.panels.length < 1 || contributes.panels.length > 8) issues.push("contributes.panels 必须是 1–8 个");
	if (contributes.commands.length > 16) issues.push("contributes.commands 最多 16 个");
	const panelIds = [];
	for (const [index, panel] of contributes.panels.entries()) {
		const at = `contributes.panels[${index}]`;
		if (!isRecord(panel)) {
			issues.push(`${at} 必须是对象`);
			continue;
		}
		if (!isPluginId(panel.id)) issues.push(`${at}.id 不符合 id 规则`);
		else panelIds.push(panel.id);
		if (!isLabel(panel.title)) issues.push(`${at}.title 必须是非空字符串、≤160 字符`);
		if (!isAssetPath(panel.entry) || !String(panel.entry).endsWith(".html")) issues.push(`${at}.entry 必须是包内相对路径且以 .html 结尾（当前 ${JSON.stringify(panel.entry)}）`);
		if (panel.icon !== undefined && !ICONS.includes(panel.icon)) issues.push(`${at}.icon 不在白名单里：${JSON.stringify(panel.icon)}（可选值：${ICONS.join(", ")}）`);
		if (panel.presentation !== undefined && !PRESENTATIONS.includes(panel.presentation)) issues.push(`${at}.presentation 只能是 ${PRESENTATIONS.join(" / ")}`);
	}
	if (new Set(panelIds).size !== panelIds.length) issues.push("contributes.panels 里有重复 id");
	const commandIds = [];
	for (const [index, command] of contributes.commands.entries()) {
		const at = `contributes.commands[${index}]`;
		if (!isRecord(command)) {
			issues.push(`${at} 必须是对象`);
			continue;
		}
		if (!isPluginId(command.id)) issues.push(`${at}.id 不符合 id 规则`);
		else commandIds.push(command.id);
		if (!isLabel(command.title)) issues.push(`${at}.title 必须是非空字符串、≤160 字符`);
		if (typeof command.panelId !== "string" || !panelIds.includes(command.panelId)) issues.push(`${at}.panelId 必须指向已声明的面板`);
	}
	if (new Set(commandIds).size !== commandIds.length) issues.push("contributes.commands 里有重复 id");

	return issues;
}

/**
 * 读一遍包内容并核预算。返回的 files 顺序与 PiDeck 打包脚本一致
 * （逐层按名字排序），这样打出来的归档是确定性的。
 */
export async function collectPackage(root) {
	const files = [];
	const issues = [];
	let total = 0;
	let stopped = false;

	async function visit(prefix, depth) {
		if (stopped) return;
		if (depth > BUDGET.depth) {
			issues.push(`package-too-deep: ${prefix || "."}（目录深度上限 ${BUDGET.depth}）`);
			stopped = true;
			return;
		}
		let entries;
		try {
			entries = await readdir(join(root, prefix), { withFileTypes: true });
		} catch (error) {
			issues.push(`读不到 ${prefix || "."}：${error.message}`);
			stopped = true;
			return;
		}
		entries.sort((left, right) => left.name.localeCompare(right.name));
		for (const entry of entries) {
			if (stopped) return;
			const asset = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isSymbolicLink()) {
				issues.push(`symlink-not-allowed: ${asset}`);
				continue;
			}
			if (entry.isDirectory()) {
				await visit(asset, depth + 1);
				continue;
			}
			if (!entry.isFile()) {
				issues.push(`invalid-package-file: ${asset}`);
				continue;
			}
			if (!isAssetPath(asset)) {
				issues.push(`invalid-asset: ${asset}（路径只允许 A-Za-z0-9_./-，≤240 字符，不能有空格/中文/./..）`);
				continue;
			}
			if (files.length >= BUDGET.fileCount) {
				issues.push(`文件数超过 ${BUDGET.fileCount} 个（超出的已忽略）`);
				stopped = true;
				return;
			}
			const bytes = await readFile(join(root, asset));
			if (bytes.length > BUDGET.assetBytes) issues.push(`asset-too-large: ${asset}（${bytes.length} > ${BUDGET.assetBytes}）`);
			total += bytes.length;
			if (total > BUDGET.packageBytes) {
				issues.push(`package-too-large: 整包超过 ${BUDGET.packageBytes} 字节`);
				stopped = true;
				return;
			}
			files.push({ path: asset, bytes });
		}
	}

	await visit("", 0);
	return { files, issues };
}

/** 打包成 .pideck-plugin（NDJSON，逐文件 sha256）——与 PiDeck 的 pack-host-plugin.mjs 同一格式。 */
export function packPackage(files) {
	const lines = [JSON.stringify({ kind: "pideck-host-plugin", formatVersion: 1, files: files.length })];
	for (const file of files) {
		lines.push(
			JSON.stringify({
				kind: "file",
				path: file.path,
				sha256: createHash("sha256").update(file.bytes).digest("hex"),
				size: file.bytes.length,
				data: file.bytes.toString("base64"),
			}),
		);
	}
	return `${lines.join("\n")}\n`;
}
