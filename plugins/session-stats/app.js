// 会话统计：把 sessions.list 的分页结果汇总成看板。
// 声明了 sessions.read.workspace，所以宿主给的 scope 是整个工作区；
// 「只看当前项目」是插件自己再收窄一次（拿到了更宽的范围不代表必须用满）。
const MAX_SESSIONS = 1000; // 采样上限：10 页 × 100 条，避免把大工作区的目录全拉进来
const TOP_N = 8;
const ACTIVITY_DAYS = 14;

const COPY = {
	"zh-CN": {
		heading: "会话统计",
		subtitle: (scope, count, capped) => `${scope} · 采样 ${count} 个会话${capped ? "（已达采样上限）" : ""}`,
		scopeWorkspace: "整个工作区",
		scopeProject: "当前项目",
		onlyProject: "只看当前项目",
		reload: "刷新",
		loading: "统计中…",
		empty: "没有会话。",
		cardTotal: "会话总数",
		cardReadable: "有历史文件",
		cardUnreadable: "无历史文件",
		cardProjects: "涉及目录",
		titleDirs: "按目录",
		titleModels: "按模型",
		titleBackends: "按后端",
		titleActivity: "近 14 天活跃",
		none: "（无）",
		failed: "读取失败：",
		offline: "window.pideck 不可用——这个页面不是 PiDeck 面板页。",
	},
	"en-US": {
		heading: "Session stats",
		subtitle: (scope, count, capped) => `${scope} · sampled ${count} sessions${capped ? " (sample cap reached)" : ""}`,
		scopeWorkspace: "whole workspace",
		scopeProject: "this project",
		onlyProject: "This project only",
		reload: "Refresh",
		loading: "Crunching…",
		empty: "No sessions.",
		cardTotal: "Sessions",
		cardReadable: "With history file",
		cardUnreadable: "Without history file",
		cardProjects: "Directories",
		titleDirs: "By directory",
		titleModels: "By model",
		titleBackends: "By backend",
		titleActivity: "Last 14 days",
		none: "(none)",
		failed: "Failed to read: ",
		offline: "window.pideck is unavailable — this page is not a PiDeck panel.",
	},
};

const el = (id) => document.getElementById(id);
let copy = COPY["zh-CN"];
let context = { locale: "zh-CN", scope: "project" };
let sessions = [];
let capped = false;

const errorText = (error) => (typeof error?.message === "string" ? error.message : String(error ?? ""));
const dayKey = (stamp) => new Date(stamp).toISOString().slice(0, 10);
const shortDate = (stamp) => `${new Date(stamp).getMonth() + 1}/${new Date(stamp).getDate()}`;

function say(node, message) {
	node.textContent = message || "";
	node.hidden = !message;
}

function visible() {
	if (!el("only-project").checked || !context.projectId) return sessions;
	return sessions.filter((session) => session.projectId === context.projectId);
}

/** 计数并取前 N 名；key 为空的一律归到 (无)。 */
function tally(items, pick) {
	const counts = new Map();
	for (const item of items) {
		const key = pick(item) || copy.none;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, TOP_N);
}

function renderCards(items) {
	const readable = items.filter((session) => session.readable !== false).length;
	const directories = new Set(items.map((session) => session.directory).filter(Boolean));
	const cards = [
		[copy.cardTotal, String(items.length)],
		[copy.cardReadable, String(readable)],
		[copy.cardUnreadable, String(items.length - readable)],
		[copy.cardProjects, String(directories.size)],
	];
	el("summary").replaceChildren(
		...cards.map(([label, value]) => {
			const card = document.createElement("div");
			card.className = "card";
			const strong = document.createElement("strong");
			strong.textContent = value;
			const span = document.createElement("span");
			span.className = "muted";
			span.textContent = label;
			card.append(strong, span);
			return card;
		}),
	);
}

function renderBars(node, rows) {
	if (!rows.length) {
		const empty = document.createElement("p");
		empty.className = "muted";
		empty.textContent = copy.none;
		node.replaceChildren(empty);
		return;
	}
	const max = Math.max(...rows.map(([, count]) => count));
	node.replaceChildren(
		...rows.map(([label, count]) => {
			const row = document.createElement("div");
			row.className = "bar";
			const name = document.createElement("span");
			name.className = "bar-label";
			name.textContent = label;
			name.title = label;
			const track = document.createElement("span");
			track.className = "bar-track";
			const fill = document.createElement("span");
			fill.className = "bar-fill";
			// 只有宽度是算出来的数值，不是文本——文本一律走 textContent。
			fill.style.width = `${Math.max(2, Math.round((count / max) * 100))}%`;
			track.append(fill);
			const value = document.createElement("span");
			value.className = "bar-value";
			value.textContent = String(count);
			row.append(name, track, value);
			return row;
		}),
	);
}

function renderActivity(items) {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const days = [];
	for (let offset = ACTIVITY_DAYS - 1; offset >= 0; offset -= 1) {
		const stamp = today.getTime() - offset * 86_400_000;
		days.push({ key: dayKey(stamp), stamp, count: 0 });
	}
	const index = new Map(days.map((day) => [day.key, day]));
	for (const session of items) {
		const bucket = index.get(dayKey(session.updatedAt));
		if (bucket) bucket.count += 1;
	}
	const max = Math.max(1, ...days.map((day) => day.count));
	el("activity").replaceChildren(
		...days.map((day) => {
			const cell = document.createElement("div");
			cell.className = "day";
			cell.title = `${day.key}: ${day.count}`;
			const fill = document.createElement("span");
			fill.className = "day-fill";
			fill.style.height = `${Math.max(3, Math.round((day.count / max) * 100))}%`;
			if (day.count === 0) fill.dataset.empty = "true";
			const label = document.createElement("span");
			label.className = "day-label";
			label.textContent = shortDate(day.stamp);
			cell.append(fill, label);
			return cell;
		}),
	);
}

function render() {
	const items = visible();
	el("subtitle").textContent = copy.subtitle(context.scope === "workspace" ? copy.scopeWorkspace : copy.scopeProject, items.length, capped);
	el("only-project-label").textContent = copy.onlyProject;
	el("only-project").hidden = !context.projectId;
	say(el("status"), items.length ? "" : copy.empty);
	renderCards(items);
	renderBars(el("dirs"), tally(items, (session) => session.directory));
	renderBars(el("models"), tally(items, (session) => session.model));
	renderBars(el("backends"), tally(items, (session) => session.backend));
	renderActivity(items);
}

async function load() {
	el("reload").disabled = true;
	say(el("status"), copy.loading);
	try {
		const collected = [];
		let offset = 0;
		capped = false;
		while (offset !== null && collected.length < MAX_SESSIONS) {
			const page = await pideck.sessions.list(offset);
			collected.push(...page.sessions);
			if (page.nextOffset === null || page.nextOffset === undefined) break;
			offset = page.nextOffset;
			if (collected.length >= MAX_SESSIONS) {
				capped = true;
				break;
			}
		}
		sessions = collected;
		render();
	} catch (error) {
		say(el("status"), copy.failed + errorText(error));
	} finally {
		el("reload").disabled = false;
	}
}

function applyCopy() {
	document.documentElement.lang = copy === COPY["en-US"] ? "en-US" : "zh-CN";
	el("heading").textContent = copy.heading;
	el("reload").textContent = copy.reload;
	el("title-dirs").textContent = copy.titleDirs;
	el("title-models").textContent = copy.titleModels;
	el("title-backends").textContent = copy.titleBackends;
	el("title-activity").textContent = copy.titleActivity;
}

function debounce(fn, ms) {
	let timer;
	return () => {
		window.clearTimeout(timer);
		timer = window.setTimeout(fn, ms);
	};
}

async function main() {
	context = await pideck.context.get();
	copy = context.locale === "en-US" ? COPY["en-US"] : COPY["zh-CN"];
	applyCopy();
	el("reload").addEventListener("click", () => void load());
	el("only-project").addEventListener("change", render);
	await load();

	const reload = debounce(() => void load(), 600);
	pideck.onEvent((event) => {
		if (event.type === "context.changed") {
			context = event.context;
			copy = context.locale === "en-US" ? COPY["en-US"] : COPY["zh-CN"];
			applyCopy();
			render();
			return;
		}
		// 目录级变化才重算；单会话追加不影响这份统计。
		if (event.type === "sessions.changed" && event.detail?.catalogChanged) reload();
	});
}

if (typeof globalThis.pideck?.sessions?.list !== "function") {
	document.body.textContent = COPY["zh-CN"].offline;
} else {
	void main();
}
