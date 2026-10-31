// 网络面板：演示 network.https 的四件事。
//   1. origin 必须在 manifest 的 network.httpsOrigins 里逐个写明（不支持通配符、不能带路径），
//      宿主只放行这些 origin，其余一律 network-origin-denied；
//   2. 4xx / 5xx 不会抛错，要自己看 response.status / response.ok；
//   3. 响应体只有有界的 UTF-8 文本（这里限 1 MiB），二进制和压缩响应会被拒；
//   4. 拼 URL 前先校验用户输入——宿主会再查一遍 origin，但别把任意文本塞进 URL。
const API_ORIGIN = "https://api.github.com";
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/;

const COPY = {
	"zh-CN": {
		heading: "我的网络面板",
		subtitle: `只允许访问 ${API_ORIGIN}`,
		label: "仓库",
		go: "查询",
		idle: "填一个 owner/repo 然后点查询。",
		loading: "查询中…",
		badInput: "格式不对，应该是 owner/repo。",
		notFound: "仓库不存在，或者拼错了。",
		http: (status) => `接口返回 ${status}。`,
		badJson: "响应不是合法 JSON。",
		failed: "请求失败：",
		reason: {
			"network-origin-denied": "这个地址不在 manifest 的 network.httpsOrigins 里。",
			"network-address-denied": "域名解析到了非公网地址，已拒绝。",
			"network-timeout": "超时（默认 15 秒，最多 30 秒）。",
			"network-cancelled": "请求已取消（面板可能被关闭了）。",
			"network-request-failed": "连接失败。",
			"network-response-too-large": "响应体超过 1 MiB。",
			"network-response-type-denied": "响应不是 text/JSON。",
			"permission-denied": "manifest 里没有 network.https 权限。",
			"rate-limited": "请求太频繁（每实例同时最多 2 个在途、每秒最多 20 个）。",
			"plugin-revoked": "插件已被禁用或代码变了。",
		},
	},
	"en-US": {
		heading: "My network panel",
		subtitle: `Only ${API_ORIGIN} is allowed`,
		label: "Repository",
		go: "Query",
		idle: "Enter an owner/repo and press Query.",
		loading: "Querying…",
		badInput: "Invalid format — expected owner/repo.",
		notFound: "Repository not found, or the name is misspelled.",
		http: (status) => `The API returned ${status}.`,
		badJson: "Response is not valid JSON.",
		failed: "Request failed: ",
		reason: {
			"network-origin-denied": "This address is not in the manifest's network.httpsOrigins.",
			"network-address-denied": "The hostname resolved to a non-public address and was rejected.",
			"network-timeout": "Timed out (15s default, 30s max).",
			"network-cancelled": "Cancelled — the panel was probably closed.",
			"network-request-failed": "Connection failed.",
			"network-response-too-large": "Response body exceeds 1 MiB.",
			"network-response-type-denied": "Response is not text/JSON.",
			"permission-denied": "The manifest does not declare network.https.",
			"rate-limited": "Too many requests (2 in flight, 20 per second per instance).",
			"plugin-revoked": "The plugin was disabled or its code changed.",
		},
	},
};

const el = (id) => document.getElementById(id);
let copy = COPY["zh-CN"];

function say(node, message) {
	node.textContent = message || "";
	node.hidden = !message;
}

function errorText(error) {
	return typeof error?.message === "string" ? error.message : String(error ?? "");
}

function reasonText(code) {
	return copy.reason[code] ?? code;
}

function setBusy(busy) {
	document.body.dataset.busy = String(busy);
	el("go").disabled = busy;
	if (busy) say(el("status"), copy.loading);
}

async function query() {
	const repo = el("repo").value.trim();
	el("result").hidden = true;
	if (!REPO_PATTERN.test(repo)) {
		say(el("status"), copy.badInput);
		return;
	}
	setBusy(true);
	try {
		const response = await pideck.network.request({
			url: `${API_ORIGIN}/repos/${repo}`,
			method: "GET",
			headers: { Accept: "application/vnd.github+json" },
			timeoutMs: 10_000,
		});
		// 4xx / 5xx 不抛错：这里按 status 自己分支。
		if (response.status === 404) {
			say(el("status"), copy.notFound);
			return;
		}
		if (!response.ok) {
			say(el("status"), copy.http(response.status));
			return;
		}
		let payload;
		try {
			payload = JSON.parse(response.body);
		} catch {
			say(el("status"), copy.badJson);
			return;
		}
		say(el("status"), "");
		const summary = {
			full_name: payload.full_name,
			description: payload.description,
			stars: payload.stargazers_count,
			forks: payload.forks_count,
			license: payload.license?.spdx_id ?? null,
			pushed_at: payload.pushed_at,
			default_branch: payload.default_branch,
		};
		// 展示的数据也是数据：用 textContent 写，别拼 HTML。
		el("result").textContent = JSON.stringify(summary, null, 2);
		el("result").hidden = false;
		el("idle").hidden = true;
	} catch (error) {
		say(el("status"), copy.failed + reasonText(errorText(error)));
	} finally {
		setBusy(false);
	}
}

async function main() {
	const context = await pideck.context.get();
	copy = context.locale === "en-US" ? COPY["en-US"] : COPY["zh-CN"];
	document.documentElement.lang = copy === COPY["en-US"] ? "en-US" : "zh-CN";
	el("heading").textContent = copy.heading;
	el("subtitle").textContent = copy.subtitle;
	el("label").textContent = copy.label;
	el("go").textContent = copy.go;
	el("idle").textContent = copy.idle;
	el("form").addEventListener("submit", (event) => {
		event.preventDefault();
		void query();
	});
	await query();
}

if (typeof globalThis.pideck?.network?.request !== "function") {
	document.body.textContent = "window.pideck is unavailable — this page is not a PiDeck panel.";
} else {
	void main();
}
