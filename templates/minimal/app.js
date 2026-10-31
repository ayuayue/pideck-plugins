// 最小可运行的宿主插件：不需要任何权限。
// 能力面只有三样：读 context、读写自己的 storage、订阅事件（见 window.pideck）。
// 面板形态是 popover（侧栏那一行旁边就地展开，约 320x280），所以只放一两行内容。
const STORAGE_KEY = "counter";

const COPY = {
	"zh-CN": {
		noProject: "未选择项目",
		hint: "点一下计数，值存在插件自己的存储里，关掉面板再开还在。",
		failed: "操作失败：",
		offline: "当前页面没有 window.pideck：它不是 PiDeck 面板页（或宿主版本过旧）。",
	},
	"en-US": {
		noProject: "No project",
		hint: "Tap to count. The value lives in this plugin's own storage and survives a reload.",
		failed: "Request failed: ",
		offline: "window.pideck is unavailable — this page is not a PiDeck panel (or the host is too old).",
	},
};

const el = (id) => document.getElementById(id);
let copy = COPY["zh-CN"];
let count = 0;

function say(message) {
	const node = el("hint");
	node.textContent = message || "";
}

function paintScope(context) {
	const name = context.projectName ?? copy.noProject;
	const locale = context.locale === "en-US" ? "en-US" : "zh-CN";
	// scope 由宿主按 manifest 权限写入，插件塞什么都不算数；这里只是显示出来。
	el("scope").textContent = `${name} · ${context.scope ?? "project"} · ${locale}`;
}

function paintCount() {
	el("count").textContent = String(count);
}

async function main() {
	const context = await pideck.context.get();
	copy = context.locale === "en-US" ? COPY["en-US"] : COPY["zh-CN"];
	document.documentElement.lang = copy === COPY["en-US"] ? "en-US" : "zh-CN";
	paintScope(context);

	// storage.get 对不存在的键回 null，所以先兜底再 Number。
	count = Number(await pideck.storage.get(STORAGE_KEY)) || 0;
	paintCount();
	say(copy.hint);

	el("ping").addEventListener("click", async () => {
		count += 1;
		paintCount();
		try {
			await pideck.storage.set(STORAGE_KEY, count);
		} catch (error) {
			say(copy.failed + (error?.message ?? error));
		}
	});

	// 切项目 / 切语言 / 切主题都会推事件，负载里就是新 context，不用自己再拉一次。
	pideck.onEvent((event) => {
		if (event.type === "context.changed") paintScope(event.context);
	});
}

if (typeof globalThis.pideck?.context?.get !== "function") {
	say(COPY["zh-CN"].offline);
} else {
	void main();
}
