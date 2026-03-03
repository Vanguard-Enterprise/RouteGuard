"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

type ScanPhase = "scanning" | "fail" | "rescanning" | "success";

const SEQUENCE: { phase: ScanPhase; duration: number }[] = [
	{ phase: "scanning",   duration: 3200 },
	{ phase: "fail",       duration: 2200 },
	{ phase: "rescanning", duration: 3200 },
	{ phase: "success",    duration: 2800 },
];


/* Checkmark whose path draws itself via stroke-dashoffset */
function AnimatedCheck() {
	return (
		<svg viewBox="0 0 48 48" fill="none" className="size-20 text-green-500">
			<path
				d="M8 26 L20 36 L40 12"
				stroke="currentColor"
				strokeWidth="5"
				strokeLinecap="round"
				strokeLinejoin="round"
				style={{ strokeDasharray: 52, strokeDashoffset: 52 }}
				className="animate-[draw-check_0.55s_ease-out_0.1s_both]"
			/>
		</svg>
	);
}

/* Radial burst particles flying from center outward */
function Particles({ color, count, radius }: { color: string; count: number; radius: number }) {
	return (
		<>
			{Array.from({ length: count }, (_, i) => {
				const angle = (i / count) * 2 * Math.PI;
				return (
					<div
						key={i}
						className={cn("absolute left-1/2 top-1/2 size-2 rounded-full", color)}
						style={{
							"--tx": `${Math.cos(angle) * radius}px`,
							"--ty": `${Math.sin(angle) * radius}px`,
							animationName: "rfid-particle",
							animationDuration: "0.7s",
							animationTimingFunction: "ease-out",
							animationFillMode: "both",
							animationDelay: `${(i / count) * 0.07}s`,
						} as React.CSSProperties}
					/>
				);
			})}
		</>
	);
}

export function RfidScanVisual() {
	const [phase, setPhase] = useState<ScanPhase>("scanning");
	const [animKey, setAnimKey] = useState(0);

	useEffect(() => {
		let idx = 0;
		let t: ReturnType<typeof setTimeout>;
		const advance = () => {
			idx = (idx + 1) % SEQUENCE.length;
			setPhase(SEQUENCE[idx].phase);
			setAnimKey((k) => k + 1);
			t = setTimeout(advance, SEQUENCE[idx].duration);
		};
		t = setTimeout(advance, SEQUENCE[0].duration);
		return () => clearTimeout(t);
	}, []);

	const isScanning = phase === "scanning" || phase === "rescanning";
	const isFail     = phase === "fail";
	const isSuccess  = phase === "success";

	const ringColor  = isFail ? "border-red-500"   : isSuccess ? "border-green-500"  : "border-blue-500";
	const glowColor  = isFail ? "rgba(239,68,68,0.5)" : isSuccess ? "rgba(34,197,94,0.5)" : "rgba(59,130,246,0.45)";
	const glowFaint  = isFail ? "rgba(239,68,68,0.15)" : isSuccess ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.12)";
	const innerFill  = isFail ? "bg-red-500"        : isSuccess ? "bg-green-500"       : "bg-blue-500";

	return (
		<>
			{/* ── Main visual ─────────────────────────────────── */}
			<div className="relative mx-auto flex size-48 items-center justify-center -mt-8">

				{/* Staggered expanding rings */}
				{!isSuccess && [0, 0.73, 1.46].map((delay, i) => (
					<div
						key={`ring-${i}-${animKey}`}
						className={cn(
							"absolute inset-8 rounded-full border animate-[rfid-ring-out_2.2s_ease-out_infinite]",
							ringColor
						)}
						style={{ animationDelay: `${delay}s` }}
					/>
				))}

				{/* Success: 3 fast burst rings */}
				{isSuccess && [0, 0.18, 0.36].map((delay, i) => (
					<div
						key={`sb-${i}-${animKey}`}
						className="absolute inset-8 rounded-full border border-green-500 animate-[rfid-ring-out_0.65s_ease-out_forwards]"
						style={{ animationDelay: `${delay}s` }}
					/>
				))}

				{/* Outer radar sweep (wide, slow) */}
				{isScanning && (
					<div
						key={`radar-outer-${animKey}`}
						className="absolute inset-0 rounded-full animate-[rfid-radar_2.8s_linear_infinite]"
						style={{
							background:
								"conic-gradient(from 0deg at center, transparent 0deg, transparent 270deg, rgba(59,130,246,0.08) 310deg, rgba(59,130,246,0.35) 360deg)",
						}}
					/>
				)}

				{/* Main circle */}
				<div
					key={animKey}
					className={cn(
						"absolute inset-8 z-10 flex items-center justify-center rounded-full border-2 bg-background",
						"transition-all duration-300",
						isFail ? "border-red-500"   : isSuccess ? "border-green-500" : "border-blue-500",
						isFail && "animate-[rfid-shake_0.5s_ease-in-out]"
					)}
					style={{ boxShadow: `0 0 32px ${glowColor}, 0 0 72px ${glowFaint}` }}
				>
					{/* Tinted inner fill */}
					<div className={cn("absolute inset-0 rounded-full opacity-[0.11] transition-colors duration-500", innerFill)} />

					{/* Primary clockwise sweep - long bright tail */}
					{isScanning && (
						<div key={`sw1-${animKey}`} className="absolute inset-2 overflow-hidden rounded-full">
							<div
								className="absolute inset-0 animate-[rfid-radar_1.6s_linear_infinite]"
								style={{
									background:
										"conic-gradient(from 0deg, transparent 0deg, transparent 155deg, rgba(59,130,246,0.04) 200deg, rgba(59,130,246,0.12) 250deg, rgba(59,130,246,0.38) 315deg, rgba(59,130,246,0.9) 355deg, rgba(59,130,246,0.95) 360deg)",
								}}
							/>
						</div>
					)}

					{/* Secondary counter-clockwise sweep - shorter dim tail */}
					{isScanning && (
						<div key={`sw2-${animKey}`} className="absolute inset-2 overflow-hidden rounded-full">
							<div
								className="absolute inset-0 animate-[rfid-radar-ccw_2.5s_linear_infinite]"
								style={{
									background:
										"conic-gradient(from 0deg, transparent 0deg, transparent 260deg, rgba(59,130,246,0.05) 300deg, rgba(59,130,246,0.22) 350deg, rgba(59,130,246,0.28) 360deg)",
								}}
							/>
						</div>
					)}

					{/* Center anchor dot */}
					{isScanning && (
						<div className="absolute size-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_3px_rgba(59,130,246,0.6)]" />
					)}

					{/* Center icon */}
					<div className="relative z-10 flex items-center justify-center">
						{isScanning && null}
						{isFail && (
							<svg
								key={`x-${animKey}`}
								viewBox="0 0 48 48"
								fill="none"
								className="size-20 text-red-500 animate-[rfid-pop_0.28s_ease-out_both]"
							>
								<path
									d="M12 12 L36 36 M36 12 L12 36"
									stroke="currentColor"
									strokeWidth="5"
									strokeLinecap="round"
								/>
							</svg>
						)}
						{isSuccess && <AnimatedCheck key={`check-${animKey}`} />}
					</div>
				</div>

				{/* Particles */}
				{isFail    && <Particles key={`fp-${animKey}`} color="bg-red-500"   count={6}  radius={66} />}
				{isSuccess && <Particles key={`sp-${animKey}`} color="bg-green-400" count={10} radius={74} />}
			</div>

			{/* ── Card text ────────────────────────────────────── */}
			<div className="relative mt-8 space-y-1.5 text-center">
				<h3 className="font-medium text-foreground text-lg">RFID Student Scanning</h3>
				<p className="text-muted-foreground text-sm">
					Students are automatically scanned when they board the bus. Every scan is validated before the student boards the bus.
				</p>
			</div>
		</>
	);
}
