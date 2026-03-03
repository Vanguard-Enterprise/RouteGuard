import { FullWidthDivider } from "@/components/ui/full-width-divider";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function CallToAction() {
	return (
		<div className="relative mx-auto flex w-full max-w-3xl flex-col justify-between border-x md:flex-row">
			<FullWidthDivider className="-top-px" />
			<div className="border-b p-4 md:border-b-0">
				<h2 className="text-center font-bold text-lg md:text-left md:text-2xl">
					Ready to see RouteGuard in action?
				</h2>
			</div>
			<div className="flex items-center justify-center gap-2 p-4 md:border-l">
				<Button asChild variant="secondary">
					<Link href="/contact">Contact Sales</Link>
				</Button>
				<Button asChild>
					<Link href="/contact">Request a Demo</Link>
				</Button>
			</div>
			<FullWidthDivider className="-bottom-px" />
		</div>
	);
}
