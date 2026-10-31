// 会话列表面板：演示 sessions 分页、历史条目分页、事件刷新与工作台跳转。
// 三条硬规矩（面板自己也要守，宿主那边有预算）：
//   1. 不一次拉全量——目录按 100 条分页，历史按 nextCursor 往前翻；
//   2. 一切文本走 textContent，绝不用 innerHTML（标题和历史都是数据）；
//   3. 事件只用来「按需重读」，不是每次事件全量刷新。
const PAGE_LIMIT = 500; // 面板自己的上限：翻到 500 条就停，别把整目录拉进来
const PREVIEW_CHARS = 400;

const COPY = {
	"zh-CN": {
		noProject: "未选择项目",
		scopeProject: "当前项目",
		scopeWorkspace: "整个工作区",
		searchPlaceholder: "搜索标题…",
		searching: "搜索中…",
		searchNone: "没有匹配的会话。",
		more: "加载更多",
		empty: "从左边选一个会话。",
		pick: "选一个会话看历史。",
		open: "在 PiDeck 中打开",
		noHistory: "这个会话没有可读的历史文件（DSH / ACP / 生图等后端不写 JSONL）。它仍然可以导航。",
		historyEmpty: "这个会话还没有历史条目。",
		older: "更早的历史",
		truncated: "有超长条目被省略（单条上限 256 KiB）。",
		omitted: "（条目过大，已省略）",
		compaction: "（上下文压缩）",
		unreadable: "不可读",
		failed: "请求失败：",
		offline: "当前页面没有 window.pideck：它不是 PiDeck 面板页（或宿主版本过旧）。",
	},
	"en-US": {
		noProject: "No project",
		scopeProject: "this project",
		scopeWorkspace: "whole workspace",
		searchPlaceholder: "Search titles…",
		searching: "Searching…",
		searchNone: "No matching session.",
		more: "Load more",
		empty: "Pick a session on the left.",
		pick: "Pick a session to preview its history.",
		open: "Open in PiDeck",
		noHistory: "This session has no readable history file (DSH / ACP / image backends do not write JSONL). It is still navigable.",
		historyEmpty: "This session has no history entries yet.",
		older: "Older history",
		truncated: "Some oversized entries were omitted (256 KiB per entry).",
		omitted: "(entry too large, omitted)",
		compaction: "(context compaction)",
		unreadable: "not readable",
		failed: "Request failed: ",
		offline: "window.pideck is unavailable — this page is not a PiDeck panel (or the host is too old).",
	},
};

const el = (id) => document.getElementById(id);
let copy = COPY["zh-CN"];
let context = { locale: "zh-CN" };
// 目录状态：sessions 是「已加载的页」，nextOffset 为 null 表示到底。
const catalog = { sessions: [], nextOffset: null, query: "", searching: false };
// 历史状态：cursor 是宿主给的游标，换会话或文件变化后必须重置为 undefined。
const history = { entries: [], cursor: undefined, truncated: false, sessionId: null };

function say(node, message) {
	node.textContent = message || "";
	node.hidden = !message;
}

function errorText(error) {
	return typeof error?.message === "string" ? error.message : String(error ?? "");
}

function relativeTime(value) {
	const stamp = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(stamp) || stamp <= 0) return "—";
	const delta = Date.now() - stamp;
	if (delta < 60_000) return copy === COPY["en-US"] ? "just now" : "刚刚";
	if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min`;
	if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} h`;
	return new Date(stamp).toISOString().slice(0, 16).replace("T", " ");
}

/** 历史条目是 pi 的原始 JSONL 记录：只挑消息正文，其他类型折叠成一行标记。 */
function entryText(entry) {
	const content = entry?.message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => (part && typeof part === "object" && part.type === "text" && typeof part.text === "string" ? part.text : ""))
		.join("")
		.trim();
}

function entryRow(entry) {
	const row = document.createElement("div");
	row.className = "entry";

	const head = document.createElement("div");
	head.className = "entry-head";
	const kind = document.createElement("span");
	kind.className = "chip";
	const time = document.createElement("span");
	time.className = "muted";

	if (entry?.omitted) {
		kind.textContent = "omitted";
		head.append(kind);
		const body = document.createElement("p");
		body.className = "muted";
		body.textContent = copy.omitted;
		row.append(head, body);
		return row;
	}

	const role = typeof entry?.message?.role === "string" ? entry.message.role : undefined;
	kind.textContent = role ?? String(entry?.type ?? "entry");
	if (role === "assistant") kind.dataset.role = "assistant";
	if (role === "user") kind.dataset.role = "user";
	time.textContent = relativeTime(entry?.timestamp);
	head.append(kind, time);

	const body = document.createElement("p");
	body.className = "entry-body";
	const text = entryText(entry);
	if (text) {
		body.textContent = text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
	} else {
		body.className = "muted";
		body.textContent = entry?.type === "compaction" ? copy.compaction : `(${kind.textContent})`;
	}
	row.append(head, body);
	return row;
}

function sessionRow(session) {
	const row = document.createElement("button");
	row.type = "button";
	row.className = "session";
	row.dataset.selected = String(session.id === history.sessionId);
	row.setAttribute("role", "listitem");

	const title = document.createElement("span");
	title.className = "session-title";
	title.textContent = session.title || session.id;
	row.append(title);

	const meta = document.createElement("span");
	meta.className = "muted";
	// directory 是项目根目录（不是会话文件路径），工作区范围下靠它区分同名会话。
	const parts = [relativeTime(session.updatedAt)];
	if (session.directory) parts.push(session.directory);
	if (session.readable === false) parts.push(copy.unreadable);
	meta.textContent = parts.join(" · ");
	row.append(meta);

	row.addEventListener("click", () => void select(session.id));
	return row;
}

function renderScope() {
	const name = context.projectName ?? copy.noProject;
	const scope = context.scope === "workspace" ? copy.scopeWorkspace : copy.scopeProject;
	const count = catalog.sessions.length;
	el("scope").textContent = `${name} · ${scope} · ${count}`;
}

function renderList() {
	const list = el("list");
	list.replaceChildren(...catalog.sessions.map(sessionRow));
	el("more").hidden = catalog.nextOffset === null || catalog.query !== "";
	el("more").textContent = copy.more;
	renderScope();
}

function renderHistory() {
	const box = el("history");
	box.replaceChildren(...history.entries.map(entryRow));
	el("more-history").hidden = history.cursor === undefined;
	el("more-history").textContent = copy.older;
	if (history.truncated) say(el("detail-message"), copy.truncated);
}

function renderDetail() {
	const session = catalog.sessions.find((item) => item.id === history.sessionId);
	el("empty").hidden = Boolean(session);
	el("detail").hidden = !session;
	if (!session) return;
	el("title").textContent = session.title || session.id;
	const parts = [session.projectName ?? copy.noProject, session.directory, session.backend ?? "pi", session.model, relativeTime(session.updatedAt)];
	el("meta").textContent = parts.filter(Boolean).join(" · ");
}

/** 目录读取：offset 为 null 表示从头开始（换项目、换搜索词、收到目录级变化事件）。 */
async function loadSessions(offset) {
	if (catalog.searching) return;
	catalog.searching = true;
	try {
		if (catalog.query) {
			const hits = await pideck.sessions.search(catalog.query, 100);
			catalog.sessions = hits;
			catalog.nextOffset = null;
			if (!hits.length) say(el("list-message"), copy.searchNone);
		} else {
			const page = await pideck.sessions.list(offset ?? 0);
			catalog.sessions = offset ? [...catalog.sessions, ...page.sessions] : page.sessions;
			catalog.nextOffset = page.nextOffset;
			say(el("list-message"), "");
		}
		renderList();
	} catch (error) {
		say(el("list-message"), copy.failed + errorText(error));
	} finally {
		catalog.searching = false;
	}
}

/** 历史读取：只在换会话或收到「该会话被追加」事件时重来，游标过期就整段重读。 */
async function loadHistory(sessionId, cursor) {
	try {
		const page = await pideck.sessions.entries(sessionId, cursor);
		if (cursor) {
			history.entries = [...history.entries, ...page.entries];
		} else {
			history.entries = page.entries;
			history.truncated = page.truncated;
		}
		history.cursor = page.nextCursor ?? undefined;
		say(el("detail-message"), page.truncated ? copy.truncated : "");
		renderHistory();
	} catch (error) {
		const code = errorText(error);
		if (code === "stale-cursor" || code === "history-changed") {
			// 游标绑文件版本：文件变了就整段重读，别硬接旧游标。
			history.cursor = undefined;
			await loadHistory(sessionId, undefined);
			return;
		}
		say(el("detail-message"), code === "history-unavailable" ? copy.noHistory : copy.failed + code);
	}
}

async function select(sessionId) {
	history.sessionId = sessionId;
	history.entries = [];
	history.cursor = undefined;
	history.truncated = false;
	renderList();
	renderDetail();
	renderHistory();
	say(el("detail-message"), "");
	const session = catalog.sessions.find((item) => item.id === sessionId);
	if (session?.readable === false) {
		// readable 为 false 只说明没有 JSONL 历史，不代表不能导航。
		say(el("detail-message"), copy.noHistory);
		return;
	}
	await loadHistory(sessionId, undefined);
	if (!history.entries.length) say(el("detail-message"), copy.historyEmpty);
}

function wireEvents() {
	el("search-form").addEventListener("submit", (event) => {
		event.preventDefault();
		catalog.query = el("query").value.trim();
		void loadSessions(null);
	});
	el("more").addEventListener("click", () => void loadSessions(catalog.nextOffset));
	el("more-history").addEventListener("click", () => void loadHistory(history.sessionId, history.cursor));
	el("open").addEventListener("click", async () => {
		try {
			await pideck.workbench.navigate(history.sessionId);
		} catch (error) {
			say(el("detail-message"), copy.failed + errorText(error));
		}
	});
}

async function main() {
	context = await pideck.context.get();
	copy = context.locale === "en-US" ? COPY["en-US"] : COPY["zh-CN"];
	document.documentElement.lang = copy === COPY["en-US"] ? "en-US" : "zh-CN";
	el("query").placeholder = copy.searchPlaceholder;
	el("empty").textContent = copy.empty;
	el("open").textContent = copy.open;
	wireEvents();
	await loadSessions(null);

	// 事件只用来触发「按需重读」：目录级变化才重拉列表，追加事件只影响被追加的那个会话。
	const reloadCatalog = debounce(() => void loadSessions(null), 400);
	pideck.onEvent((event) => {
		if (event.type === "context.changed") {
			context = event.context;
			renderScope();
			return;
		}
		if (event.type !== "sessions.changed") return;
		if (event.detail?.catalogChanged) {
			reloadCatalog();
			return;
		}
		if (event.detail?.sessionId && event.detail.sessionId === history.sessionId) {
			void loadHistory(history.sessionId, undefined);
		}
	});
}

function debounce(fn, ms) {
	let timer;
	return () => {
		window.clearTimeout(timer);
		timer = window.setTimeout(fn, ms);
	};
}

if (typeof globalThis.pideck?.sessions?.list !== "function") {
	document.body.textContent = COPY["zh-CN"].offline;
} else {
	void main();
}
