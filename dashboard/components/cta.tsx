import { Button } from "@/components/ui/button";
import Link from "next/link";

export function CallToAction() {
	return (
		<div
			className="w-full py-6"
			style={{ backgroundColor: "var(--color-brand-navy)" }}
		>
			<div className="relative mx-auto flex w-full max-w-3xl flex-col justify-between border-x border-white/10 md:flex-row">
				<div className="border-b border-white/10 p-4 md:border-b-0">
					<h2 className="text-center font-bold text-lg text-white md:text-left md:text-2xl">
						Ready to see RouteGuard in action?
					</h2>
				</div>
				<div className="flex items-center justify-center gap-2 p-4 md:border-l md:border-white/10">
					<Button
						asChild
						variant="outline"
						className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
					>
						<Link href="/contact">Contact Sales</Link>
					</Button>
					<Button
						asChild
						className="text-[#1B3A5C] hover:opacity-90"
						style={{ backgroundColor: "var(--color-brand-amber)" }}
					>
						<Link href="/contact">Request a Demo</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
