import { useEffect, useRef, useState } from "react";
import { Activity, BarChart3, Box, Check, Copy, FileText, Layers, ShieldAlert, Star } from "lucide-react";
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

export function PluginCard({
	plugin,
	tier,
	hue = 250,
}: {
	plugin: Plugin;
	tier: "featured" | "compact";
	hue?: number;
}) {
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
			size="compact"
			className="gap-0 py-3.5"
		>
			<CardHeader className="pb-0">
				<div className="flex min-w-0 items-start gap-2.5">
					<span
						style={{ "--h": hue } as React.CSSProperties}
						className="tile-hue mt-0.5 grid size-7 shrink-0 place-items-center rounded-md"
					>
						<Icon className="size-4" />
					</span>
					<div className="min-w-0">
						<CardTitle as="h3" className="truncate text-[15px] font-semibold tracking-tight">
							<a
								href={url}
								target="_blank"
								rel="noreferrer noopener"
								className={cn("outline-none hover:underline hover:underline-offset-4", CARD_TARGET_CLASS)}
							>
								{plugin.name || plugin.id}
							</a>
						</CardTitle>
						<div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
							<span className="truncate">{plugin.author ?? plugin.repo.split("/")[0]}</span>
							<span className="text-muted-foreground/40">·</span>
							<span className="truncate font-mono">{plugin.id}</span>
						</div>
					</div>
				</div>
				<CardAction className="relative z-10">
					<StatefulButton
						size="sm"
						variant="ghost"
						state={state}
						icon={<Copy className="size-3.5" />}
						loadingText="复制中"
						successText="已复制"
						errorText="复制失败"
						onClick={copy}
						className="-mr-1 px-2 text-muted-foreground hover:text-foreground"
					>
						复制
					</StatefulButton>
				</CardAction>
			</CardHeader>

			<CardContent className="pt-2.5">
				<p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{plugin.description}</p>
			</CardContent>

			<CardFooter className="mt-3 flex-nowrap items-center gap-2 text-[11.5px] text-muted-foreground">
				<span className="inline-flex min-w-0 items-center gap-1" title={plugin.permissions.join("\n") || "不需要任何权限"}>
					{plugin.permissions.length ? (
						<ShieldAlert className="size-3.5 shrink-0" />
					) : (
						<Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
					)}
					<span className="truncate">{permissionLabel(plugin)}</span>
				</span>
				<span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground/70">
					{presentationLabel(plugin) ? <span>{presentationLabel(plugin)}</span> : null}
					{plugin.stars ? (
						<span className="inline-flex items-center gap-0.5">
							<Star className="size-3" />
							{plugin.stars}
						</span>
					) : null}
					{plugin.version ? <span className="font-mono">v{plugin.version}</span> : null}
				</span>
			</CardFooter>
		</Card>
	);
}
