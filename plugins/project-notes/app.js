// 项目便签：一个不需要任何权限的插件——只用 context + storage。
//
// 存储键必须匹配 ^[A-Za-z0-9_.-]{1,80}$，而 projectId 的形状由宿主决定，
// 所以先把它洗成安全键名（不能假设 projectId 就是 slug）。
// 整个插件只有 1 MiB / 200 键，所以自己在插件侧也设上限，别把配额撑爆。
const KEY_PREFIX = "notes.";
const MAX_NOTES = 100;
const MAX_TEXT = 2000;

const COPY = {
	"zh-CN": {
		heading: "项目便签",
		noProject: "未选择项目（便签存在公共区）",
		placeholder: "记点什么…",
		add: "添加",
		empty: "这个项目还没有便签。",
		remove: "删除",
		removeTitle: "删除这条便签？",
		failed: "操作失败：",
		tooMany: (max) => `每个项目最多 ${max} 条，先删几条。`,
		tooLong: (max) => `单条最多 ${max} 字符。`,
		footer: (projects, notes) => `${projects} 个项目 · ${notes} 条便签`,
		relative: { now: "刚刚", min: (n) => `${n} 分钟前`, hour: (n) => `${n} 小时前` },
		offline: "window.pideck 不可用——这个页面不是 PiDeck 面板页。",
	},
	"en-US": {
		heading: "Project notes",
		noProject: "No project selected (notes go to the shared bucket)",
		placeholder: "Write something…",
		add: "Add",
		empty: "No notes for this project yet.",
		remove: "Delete",
		removeTitle: "Delete this note?",
		failed: "Failed: ",
		tooMany: (max) => `Up to ${max} notes per project — delete a few first.`,
		tooLong: (max) => `A note can be at most ${max} characters.`,
		footer: (projects, notes) => `${projects} projects · ${notes} notes`,
		relative: { now: "just now", min: (n) => `${n} min ago`, hour: (n) => `${n} h ago` },
		offline: "window.pideck is unavailable — this page is not a PiDeck panel.",
	},
};

const el = (id) => document.getElementById(id);
let copy = COPY["zh-CN"];
let context = { locale: "zh-CN" };
let notes = [];

const errorText = (error) => (typeof error?.message === "string" ? error.message : String(error ?? ""));

function say(node, message) {
	node.textContent = message || "";
	node.hidden = !message;
}

/** projectId 的形状不是契约的一部分：洗成合法键名，顺带保证长度可控。 */
function storageKey() {
	const raw = typeof context.projectId === "string" && context.projectId ? context.projectId : "shared";
	const safe = raw.replace(/[^A-Za-z0-9_.-]/g, "-").slice(-60) || "shared";
	return `${KEY_PREFIX}${safe}`;
}

function timeText(stamp) {
	const delta = Date.now() - stamp;
	if (delta < 60_000) return copy.relative.now;
	if (delta < 3_600_000) return copy.relative.min(Math.floor(delta / 60_000));
	if (delta < 86_400_000) return copy.relative.hour(Math.floor(delta / 3_600_000));
	return new Date(stamp).toISOString().slice(0, 16).replace("T", " ");
}

function noteRow(note) {
	const item = document.createElement("li");
	item.className = "note";

	const text = document.createElement("p");
	text.className = "note-text";
	text.textContent = note.text;

	const meta = document.createElement("div");
	meta.className = "note-meta";
	const time = document.createElement("span");
	time.className = "muted";
	time.textContent = timeText(note.at);
	const remove = document.createElement("button");
	remove.type = "button";
	remove.className = "link";
	remove.textContent = copy.remove;
	remove.title = copy.removeTitle;
	remove.addEventListener("click", () => void removeNote(note.id));
	meta.append(time, remove);

	item.append(text, meta);
	return item;
}

function render() {
	el("scope").textContent = context.projectName ?? copy.noProject;
	el("add").textContent = copy.add;
	el("text").placeholder = copy.placeholder;
	el("notes").replaceChildren(...notes.map(noteRow));
	say(el("status"), notes.length ? "" : copy.empty);
}

/** 便签是「整段覆盖」：storage 没有事务，读改写三步都在同一个键上。 */
async function persist(next) {
	const key = storageKey();
	await pideck.storage.set(key, next);
	notes = next;
	render();
	await renderFooter();
}

async function addNote() {
	const value = el("text").value.trim();
	if (!value) return;
	if (value.length > MAX_TEXT) {
		say(el("status"), copy.tooLong(MAX_TEXT));
		return;
	}
	if (notes.length >= MAX_NOTES) {
		say(el("status"), copy.tooMany(MAX_NOTES));
		return;
	}
	const next = [{ id: `${Date.now()}-${notes.length}`, text: value, at: Date.now() }, ...notes];
	el("text").value = "";
	try {
		await persist(next);
	} catch (error) {
		say(el("status"), copy.failed + errorText(error));
	}
}

async function removeNote(id) {
	try {
		await persist(notes.filter((note) => note.id !== id));
	} catch (error) {
		say(el("status"), copy.failed + errorText(error));
	}
}

/** storage.keys() 是唯一能跨项目看全貌的口子（值只能一个个 get）。 */
async function renderFooter() {
	try {
		const keys = await pideck.storage.keys();
		const projectKeys = keys.filter((key) => key.startsWith(KEY_PREFIX));
		let total = 0;
		for (const key of projectKeys) {
			const value = await pideck.storage.get(key);
			if (Array.isArray(value)) total += value.length;
		}
		el("footer").textContent = copy.footer(projectKeys.length, total);
	} catch {
		el("footer").textContent = "";
	}
}

async function load() {
	try {
		const stored = await pideck.storage.get(storageKey());
		notes = Array.isArray(stored) ? stored.filter((note) => note && typeof note.text === "string") : [];
	} catch (error) {
		notes = [];
		say(el("status"), copy.failed + errorText(error));
	}
	render();
	await renderFooter();
}

function applyCopy() {
	document.documentElement.lang = copy === COPY["en-US"] ? "en-US" : "zh-CN";
	el("heading").textContent = copy.heading;
}

async function main() {
	context = await pideck.context.get();
	copy = context.locale === "en-US" ? COPY["en-US"] : COPY["zh-CN"];
	applyCopy();
	el("form").addEventListener("submit", (event) => {
		event.preventDefault();
		void addNote();
	});
	await load();

	// 切项目只换存储键，不用重新挂载面板。
	pideck.onEvent((event) => {
		if (event.type !== "context.changed") return;
		context = event.context;
		copy = context.locale === "en-US" ? COPY["en-US"] : COPY["zh-CN"];
		applyCopy();
		void load();
	});
}

if (typeof globalThis.pideck?.storage?.get !== "function") {
	document.body.textContent = COPY["zh-CN"].offline;
} else {
	void main();
}
