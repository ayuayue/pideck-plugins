export type Plugin = {
	id: string;
	name: string;
	version?: string;
	description?: string;
	permissions: string[];
	presentations?: string[];
	icon?: string;
	author?: string;
	repo: string;
	stars?: number;
	license?: string;
	subpath?: string;
	ref?: string;
	tags?: string[];
	source: "registry" | "github";
};

const REGISTRY_URL = "./registry.json";
const TOPIC = "pideck-plugin";
const CACHE_KEY = "pideck-plugins-github-cache";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MANIFEST_FILE = "pideck-plugin.json";

export const installUrl = (plugin: Plugin) =>
	plugin.subpath
		? `https://github.com/${plugin.repo}/tree/${plugin.ref ?? "main"}/${plugin.subpath}`
		: `https://github.com/${plugin.repo}`;

export const permissionLabel = (plugin: Plugin) => {
	const list = plugin.permissions;
	if (!list.length) return "不需要权限";
	if (list.length === 1) return `需要 ${list[0]}`;
	return `需要 ${list[0]} 等 ${list.length} 项`;
};

export const presentationLabel = (plugin: Plugin) => {
	const kind = plugin.presentations?.[0];
	return kind === "page" ? "页面" : kind === "popover" ? "浮层" : kind === "modal" ? "弹窗" : "";
};

export async function loadRegistry(): Promise<Plugin[]> {
	const response = await fetch(REGISTRY_URL);
	if (!response.ok) throw new Error(`registry.json HTTP ${response.status}`);
	const payload = await response.json();
	return (payload.plugins ?? []).map((plugin: Plugin) => ({
		...plugin,
		permissions: Array.isArray(plugin.permissions) ? plugin.permissions : [],
		source: "registry" as const,
	}));
}

export async function loadGitHub(): Promise<Plugin[]> {
	try {
		const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null");
		if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.entries as Plugin[];
	} catch {
		/* 缓存坏了就重新拉 */
	}

	const response = await fetch(
		`https://api.github.com/search/repositories?q=topic:${TOPIC}&sort=stars&order=desc&per_page=30`,
		{ headers: { Accept: "application/vnd.github+json" } },
	);
	if (!response.ok) {
		throw new Error(`GitHub HTTP ${response.status}${response.status === 403 ? "（未认证限额，等一分钟再试）" : ""}`);
	}

	const payload = await response.json();
	const repos = (payload.items ?? []).filter((item: any) => !item.fork && !item.archived);
	const entries: Plugin[] = [];

	for (const repo of repos) {
		// 社区源只认仓库根的 manifest；单仓库多插件走 registry 的 subpath。
		try {
			const manifestResponse = await fetch(
				`https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/${MANIFEST_FILE}`,
			);
			if (!manifestResponse.ok) continue;
			const manifest = await manifestResponse.json();
			if (typeof manifest?.id !== "string") continue;
			entries.push({
				id: manifest.id,
				name: manifest.name ?? repo.name,
				version: manifest.version,
				description: manifest.description ?? repo.description,
				permissions: Array.isArray(manifest.permissions) ? manifest.permissions : [],
				presentations: Array.isArray(manifest.presentations) ? manifest.presentations : [],
				icon: manifest.icon,
				author: repo.owner?.login,
				repo: repo.full_name,
				stars: repo.stargazers_count,
				license:
					repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : undefined,
				subpath: "",
				source: "github",
			});
		} catch {
			continue;
		}
	}

	try {
		sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), entries }));
	} catch {
		/* 隐私模式下写不了，无所谓 */
	}

	return entries;
}

export function matches(plugin: Plugin, needle: string) {
	if (!needle) return true;
	return [plugin.id, plugin.name, plugin.description, plugin.author, plugin.repo, ...(plugin.tags ?? [])].some(
		(value) => typeof value === "string" && value.toLowerCase().includes(needle),
	);
}
