import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, PackageOpen, RotateCcw, Search } from "lucide-react";
import { Alert, AlertAction, AlertContent, AlertDescription, AlertIcon, AlertTitle } from "@/components/motion/alert";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { PluginCard } from "@/components/plugin-card";
import { loadGitHub, loadRegistry, matches, type Plugin } from "@/lib/plugins";
import { cn } from "@/lib/utils";

// 图标色相按 id 排序固定分配，筛选时不会跳色。
const HUES = [252, 285, 200, 340, 30, 160, 12, 220];
const pluginKey = (plugin: Plugin) => `${plugin.source}:${plugin.repo}:${plugin.id}`;

const SOURCES = [
	{ value: "all", label: "全部" },
	{ value: "registry", label: "收录" },
	{ value: "github", label: "社区" },
] as const;

type Source = (typeof SOURCES)[number]["value"];

function Mark({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
			<rect x="2.5" y="3.5" width="19" height="6" rx="1.8" />
			<rect x="2.5" y="13.5" width="12.5" height="7" rx="1.8" />
			<path d="M18 14.5v5" />
		</svg>
	);
}

function Section({
	title,
	count,
	note,
	badge,
	className,
	children,
}: {
	title: string;
	count: number;
	note: string;
	badge?: React.ReactNode;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<section>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="text-lg font-semibold tracking-tight">{title}</h2>
				<span className="text-sm tabular-nums text-muted-foreground">{count}</span>
				{badge}
				<span className="ml-auto text-xs text-muted-foreground">{note}</span>
			</div>
			<div className={cn("mt-5 grid", className)}>{children}</div>
		</section>
	);
}

function Skeleton() {
	return (
		<div className="grid gap-4 md:grid-cols-2">
			{Array.from({ length: 4 }).map((_, index) => (
				<div key={index} className="rounded-xl border p-6">
					<div className="flex items-start gap-3">
						<div className="size-9 animate-pulse rounded-lg bg-muted" />
						<div className="flex-1 space-y-2">
							<div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
							<div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
						</div>
					</div>
					<div className="mt-5 space-y-2">
						<div className="h-3 w-full animate-pulse rounded bg-muted" />
						<div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
					</div>
				</div>
			))}
		</div>
	);
}

export default function App() {
	const [registry, setRegistry] = useState<Plugin[]>([]);
	const [github, setGithub] = useState<Plugin[]>([]);
	const [source, setSource] = useState<Source>("all");
	const [query, setQuery] = useState("");
	const [errors, setErrors] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		setLoading(true);
		setErrors([]);
		const [registryResult, githubResult] = await Promise.allSettled([loadRegistry(), loadGitHub()]);
		const nextErrors: string[] = [];
		if (registryResult.status === "fulfilled") setRegistry(registryResult.value);
		else nextErrors.push(`收录表加载失败：${registryResult.reason?.message ?? registryResult.reason}`);
		if (githubResult.status === "fulfilled") setGithub(githubResult.value);
		else nextErrors.push(`社区来源加载失败：${githubResult.reason?.message ?? githubResult.reason}`);
		setErrors(nextErrors);
		setLoading(false);
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const hueMap = useMemo(() => {
		const map = new Map<string, number>();
		[...registry, ...github]
			.sort((a, b) => pluginKey(a).localeCompare(pluginKey(b)))
			.forEach((plugin, index) => map.set(pluginKey(plugin), HUES[index % HUES.length]));
		return map;
	}, [registry, github]);

	const needle = query.trim().toLowerCase();
	const registryMatches = useMemo(() => registry.filter((plugin) => matches(plugin, needle)), [registry, needle]);
	const githubMatches = useMemo(() => github.filter((plugin) => matches(plugin, needle)), [github, needle]);

	const showRegistry = source === "github" ? [] : registryMatches;
	const showGithub = source === "registry" ? [] : githubMatches;
	const total = showRegistry.length + showGithub.length;
	const filtering = Boolean(query.trim()) || source !== "all";
	const nothingLoaded = errors.length > 0 && registry.length === 0 && github.length === 0;

	return (
		<div className="min-h-screen bg-muted dark:bg-background">
			<header className="bg-background">
				<div className="mx-auto max-w-[1280px] px-6 pb-10 pt-14">
					<div className="flex items-center gap-3">
						<Mark className="size-8 text-primary" />
						<h1 className="text-4xl font-semibold tracking-tight">PiDeck 插件</h1>
					</div>
					<p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
						官方收录来自本仓库的 registry.json，人工核对过 manifest 与权限；社区条目抓自 GitHub 上打了 pideck-plugin topic
						的仓库，<span className="font-medium text-foreground">没有人审阅过</span>，装之前先看一眼源码。
					</p>
				</div>
			</header>

			<div className="sticky top-0 z-30 border-b bg-background">
				<div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-6 py-3">
					<Input
						value={query}
						onChange={setQuery}
						placeholder="搜索插件、作者或标签"
						leftIcon={<Search className="size-4" />}
						aria-label="搜索插件"
						className="w-full sm:max-w-xs"
					/>
					<div className="ml-auto flex items-center gap-1 rounded-full border bg-background p-1">
						{SOURCES.map((item) => {
							const count =
								item.value === "all"
									? registryMatches.length + githubMatches.length
									: item.value === "registry"
										? registryMatches.length
										: githubMatches.length;
							const active = source === item.value;
							return (
								<Button
									key={item.value}
									size="sm"
									variant={active ? "secondary" : "ghost"}
									aria-pressed={active}
									onClick={() => setSource(item.value)}
									className={cn(
										"gap-1.5",
										active && "border-primary/30 bg-primary/5 text-primary shadow-sm",
									)}
								>
									{item.label}
									<span className="font-mono text-[11px] tabular-nums opacity-60">{count}</span>
								</Button>
							);
						})}
					</div>
				</div>
			</div>

			<main className="mx-auto max-w-[1280px] px-6 py-10">
				<p className="sr-only" role="status" aria-live="polite">
					{loading ? "加载中" : filtering ? `匹配 ${total} 个插件` : `${registry.length} 个官方收录，${github.length} 个社区条目`}
				</p>

				{errors.length > 0 ? (
					<Alert variant="warning" className="mb-8" open onOpenChange={() => {}}>
						<AlertIcon />
						<AlertContent>
							<AlertTitle>部分来源没有加载出来</AlertTitle>
							<AlertDescription>{errors.join("；")}</AlertDescription>
						</AlertContent>
						<AlertAction>
							<Button size="sm" variant="outline" onClick={() => void load()}>
								<RotateCcw className="size-3.5" />
								重试
							</Button>
						</AlertAction>
					</Alert>
				) : null}

				{loading ? (
					<Skeleton />
				) : total === 0 && !nothingLoaded ? (
					<div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
						<PackageOpen className="size-6 text-muted-foreground" />
						<h2 className="mt-4 text-base font-semibold">
							{query.trim() ? `没有匹配「${query.trim()}」的插件` : "这个来源下还没有插件"}
						</h2>
						<p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
							{query.trim() ? "换个关键词试试，或者切回全部来源。" : "给仓库打上 pideck-plugin topic，它就会出现在这里。"}
						</p>
						<div className="mt-5 flex gap-2">
							{query.trim() ? (
								<Button size="sm" variant="outline" onClick={() => setQuery("")}>
									清除搜索
								</Button>
							) : null}
							{source !== "all" ? (
								<Button size="sm" variant="outline" onClick={() => setSource("all")}>
									看全部
								</Button>
							) : null}
						</div>
					</div>
				) : (
					<div className="space-y-12">
						{showRegistry.length > 0 ? (
							<Section
								title="官方收录"
								count={showRegistry.length}
								note="人工核对过 manifest 与权限"
								className="items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
							>
								{showRegistry.map((plugin) => (
									<PluginCard
										key={plugin.id}
										plugin={plugin}
										tier="featured"
										hue={hueMap.get(pluginKey(plugin))}
									/>
								))}
							</Section>
						) : null}

						{showGithub.length > 0 ? (
							<Section
								title="社区"
								count={showGithub.length}
								note="GitHub topic 自动抓取，PiDeck 不背书"
								badge={<AnimatedBadge status="warning" size="sm">未审阅</AnimatedBadge>}
								className="items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
							>
								{showGithub.map((plugin) => (
									<PluginCard
										key={`${plugin.repo}/${plugin.id}`}
										plugin={plugin}
										tier="compact"
										hue={hueMap.get(pluginKey(plugin))}
									/>
								))}
							</Section>
						) : source !== "registry" && !query.trim() ? (
							<section>
								<div className="flex flex-wrap items-center gap-3">
									<h2 className="text-lg font-semibold tracking-tight">社区</h2>
									<span className="text-sm tabular-nums text-muted-foreground">0</span>
									<AnimatedBadge status="warning" size="sm">未审阅</AnimatedBadge>
									<span className="ml-auto text-xs text-muted-foreground">GitHub topic 自动抓取，PiDeck 不背书</span>
								</div>
								<p className="mt-4 rounded-xl border border-dashed px-5 py-6 text-sm text-muted-foreground">
									还没有仓库打上 <code className="rounded bg-muted px-1 py-0.5 text-[13px]">pideck-plugin</code>{" "}
									topic。给自己的仓库打上它，就会出现在这里。
								</p>
							</section>
						) : null}
					</div>
				)}

				<section id="install" className="mt-16 scroll-mt-20 border-t pt-8">
					<h2 className="text-sm font-semibold text-muted-foreground">怎么装</h2>
					<ol className="mt-4 grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
						<li className="flex gap-2.5">
							<span className="font-mono text-xs text-muted-foreground/70">1</span>
							在 PiDeck 打开「设置 → 插件 → 安装插件 → 从 GitHub 链接…」，粘贴复制到的链接。
						</li>
						<li className="flex gap-2.5">
							<span className="font-mono text-xs text-muted-foreground/70">2</span>
							安装只把源码包放进去，不执行仓库里的脚本，也不跑构建。
						</li>
						<li className="flex gap-2.5">
							<span className="font-mono text-xs text-muted-foreground/70">3</span>
							装完是禁用状态，确认权限后才启用。
						</li>
					</ol>
				</section>

				<footer className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-6 text-xs text-muted-foreground">
					<a className="inline-flex items-center gap-1 hover:text-foreground" href="https://github.com/ayuayue/pideck-plugins">
						提 PR 收录
						<ArrowUpRight className="size-3" />
					</a>
					<a
						className="inline-flex items-center gap-1 hover:text-foreground"
						href="https://github.com/ayuayue/PiDeck/blob/main/docs/host-plugin-dev-guide.md"
					>
						插件开发文档
						<ArrowUpRight className="size-3" />
					</a>
					<a className="hover:text-foreground" href="./registry.json">
						registry.json
					</a>
				</footer>
			</main>
		</div>
	);
}
