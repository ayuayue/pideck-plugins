import { useEffect, useRef, useState } from "react";
import {
	Activity,
	BarChart3,
	Box,
	Check,
	Copy,
	FileText,
	Layers,
	ShieldAlert,
	Star,
} from "lucide-react";
import {
	CARD_TARGET_CLASS,
	Card,
	CardAction,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/motion/card";
import { StatefulButton } from "@/components/motion/button/stateful";
import { cn } from "@/lib/utils";
import { installUrl, permissionLabel, presentationLabel, type Plugin } from "@/lib/plugins";

const ICONS: Record<string, typeof Box> = {
	activity: Activity,
	"file-text": FileText,
	layers: Layers,
	"bar-chart": BarChart3,
};

type CopyState = "idle" | "loading" | "success" | "error";

export function PluginCard({ plugin, tier }: { plugin: Plugin; tier: "featured" | "compact" }) {
	const [state, setState] = useState<CopyState>("idle");
	const timer = useRef<number | undefined>(undefined);
	const Icon = ICONS[plugin.icon ?? ""] ?? Box;
	const url = installUrl(plugin);
	const featured = tier === "featured";

	useEffect(() => () => window.clearTimeout(timer.current), []);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(url);
			setState("success");
		} catch {
			setState("error");
		}
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setState("idle"), 1800);
	};

	return (
		<Card
			interactive
			variant={featured ? "outlined" : "muted"}
			size={featured ? "default" : "compact"}
			className={cn("h-full", featured ? "gap-4 py-5" : "gap-3 py-3")}
		>
			<CardHeader>
				<div className="flex min-w-0 items-start gap-3">
					<span
						className={cn(
							"grid shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground",
							featured ? "size-9" : "size-7",
						)}
					>
						<Icon className={featured ? "size-4.5" : "size-4"} />
					</span>
					<div className="min-w-0">
						<CardTitle
							as="h3"
							className={cn(
								"truncate",
								featured ? "text-[17px] tracking-tight" : "text-sm font-medium",
							)}
						>
							<a
								href={url}
								target="_blank"
								rel="noreferrer noopener"
								className={cn("outline-none hover:underline hover:underline-offset-4", CARD_TARGET_CLASS)}
							>
								{plugin.name || plugin.id}
							</a>
						</CardTitle>
						<div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
							<span className="truncate">{plugin.author ?? plugin.repo.split("/")[0]}</span>
							<span className="text-muted-foreground/40">·</span>
							<span className="shrink-0 font-mono text-[11px]">{plugin.id}</span>
						</div>
					</div>
				</div>
				<CardAction className="relative z-10">
					<StatefulButton
						size="sm"
						variant={featured ? "primary" : "ghost"}
						state={state}
						icon={<Copy className="size-3.5" />}
						loadingText="复制中"
						successText="已复制"
						errorText="复制失败"
						onClick={copy}
					>
						复制
					</StatefulButton>
				</CardAction>
			</CardHeader>

			<CardContent>
				<p
					className={cn(
						"text-muted-foreground",
						featured ? "line-clamp-3 text-sm leading-relaxed" : "line-clamp-2 text-xs leading-relaxed",
					)}
				>
					{plugin.description}
				</p>
			</CardContent>

			<CardFooter className="mt-auto flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
				<span className="inline-flex min-w-0 items-center gap-1.5" title={plugin.permissions.join("\n") || "不需要任何权限"}>
					{plugin.permissions.length ? (
						<ShieldAlert className="size-3.5 shrink-0" />
					) : (
						<Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
					)}
					<span className="truncate">{permissionLabel(plugin)}</span>
				</span>
				{presentationLabel(plugin) ? (
					<span className="text-muted-foreground/70">{presentationLabel(plugin)}</span>
				) : null}
				<span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground/70">
					{plugin.stars ? (
						<span className="inline-flex items-center gap-0.5">
							<Star className="size-3" />
							{plugin.stars}
						</span>
					) : null}
					{plugin.version ? <span>v{plugin.version}</span> : null}
				</span>
			</CardFooter>
		</Card>
	);
}
