"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon, CalendarIcon } from "lucide-react";
import Link from "next/link";

export function HeroSection() {
	return (
		<section
			className="-mt-14 w-full overflow-hidden pt-14"
			style={{ backgroundColor: "var(--color-brand-navy)" }}
		>
			<div
				aria-hidden="true"
				className="absolute inset-0 size-full overflow-hidden"
			>
				<div
					className={cn(
						"absolute inset-0 isolate -z-10",
						"bg-[radial-gradient(20%_80%_at_20%_0%,rgba(245,168,37,0.12),transparent)]"
					)}
				/>
			</div>

			<div className="mx-auto w-full max-w-5xl pt-16 pb-0">
				<div className="relative z-10 flex max-w-2xl flex-col gap-5 px-4">
					<Link
						href="/contact"
						className={cn(
							"group flex w-fit items-center gap-3 rounded-sm border border-white/20 bg-white/10 p-1",
							"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out"
						)}
					>
						<div className="rounded-xs border border-white/20 bg-white/10 px-1.5 py-0.5">
							<p className="font-mono text-xs text-white">NEW</p>
						</div>
						<span className="text-xs text-white/80">Pilot-ready for district transportation teams</span>
						<span className="block h-5 border-l border-white/20" />
						<div className="pr-1">
							<ArrowRightIcon className="size-3 -translate-x-0.5 text-white/60 duration-150 ease-out group-hover:translate-x-0.5" />
						</div>
					</Link>

					<h1
						className={cn(
							"text-balance font-medium text-4xl text-white leading-tight md:text-5xl",
							"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out"
						)}
					>
						Close The School Bus Safety Gap, Every Ride
					</h1>

					<p
						className={cn(
							"text-white/70 text-sm tracking-wider sm:text-lg md:text-xl",
							"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-200 duration-500 ease-out"
						)}
					>
						RouteGuard combines UHF RFID student verification, live GPS
						visibility, instant guardian alerts, and tiered panic escalation in
						one platform for K-12 transportation operations.
					</p>

					<div className="fade-in slide-in-from-bottom-10 flex w-fit animate-in items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
						<Button
							asChild
							variant="outline"
							className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
						>
							<Link href="/contact">
								<CalendarIcon data-icon="inline-start" />
								Book a Demo
							</Link>
						</Button>
						<Button
							className="text-[#1B3A5C] hover:opacity-90"
							style={{ backgroundColor: "var(--color-brand-amber)" }}
							onClick={() =>
								document
									.getElementById("features")
									?.scrollIntoView({ behavior: "smooth" })
							}
						>
							See How It Works
							<ArrowRightIcon data-icon="inline-end" />
						</Button>
					</div>
				</div>
				<div className="relative">
					<div
						className={cn(
							"absolute -inset-x-20 inset-y-0 -translate-y-1/3 scale-120 rounded-full",
							"bg-[radial-gradient(ellipse_at_center,rgba(245,168,37,0.08),transparent,transparent)]",
							"blur-[50px]"
						)}
					/>
					<div
						className={cn(
							"mask-b-from-60% relative mt-8 -mr-56 overflow-hidden px-2 sm:mt-12 sm:mr-0 md:mt-20",
							"fade-in slide-in-from-bottom-5 animate-in fill-mode-backwards delay-100 duration-1000 ease-out"
						)}
					>
						<div className="relative inset-shadow-2xs inset-shadow-white/10 mx-auto max-w-5xl overflow-hidden rounded-[24px] border border-white/10 bg-background/90 p-2 shadow-2xl ring-1 ring-white/10">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								alt="RouteGuard admin dashboard screenshot"
								className="z-2 aspect-[2.01/1] w-full rounded-[16px] border border-slate-200/80 object-cover object-top shadow-[0_24px_70px_rgba(15,23,42,0.3)] dark:hidden"
								height="1020"
								src="/screens/route-guard-home.png"
								width="2048"
							/>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								alt="RouteGuard admin dashboard screenshot"
								className="hidden aspect-[2.01/1] w-full rounded-[16px] border border-white/10 object-cover object-top shadow-[0_24px_70px_rgba(15,23,42,0.45)] dark:block"
								height="1020"
								src="/screens/route-guard-home.png"
								width="2048"
							/>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
