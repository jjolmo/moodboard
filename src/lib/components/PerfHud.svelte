<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { appStore } from '$lib/stores/app.svelte';

	interface Props {
		total: number;
		visible: number;
		cullMs: number;
		panX: number;
		panY: number;
		zoom: number;
	}
	let { total, visible, cullMs, panX, panY, zoom }: Props = $props();

	let fps = $state(0);
	let minFps = $state(999);
	let frameMs = $state(0);
	let longTasks = $state(0);
	let longestTask = $state(0);
	let memMB = $state<number | null>(null);

	let raf = 0;
	let lastT = performance.now();
	let frames = 0;
	let fpsT = performance.now();
	let rollingMin = 999;
	let rollingResetAt = performance.now();
	let po: PerformanceObserver | null = null;

	function loop() {
		const t = performance.now();
		frameMs = t - lastT;
		lastT = t;
		frames++;
		if (t - fpsT >= 500) {
			fps = Math.round((frames * 1000) / (t - fpsT));
			frames = 0;
			fpsT = t;
			if (fps < rollingMin) rollingMin = fps;
			// Reset rolling min every 3s so it recovers
			if (t - rollingResetAt > 3000) {
				minFps = rollingMin;
				rollingMin = fps;
				rollingResetAt = t;
			} else {
				minFps = Math.min(minFps, rollingMin);
			}
			// @ts-ignore
			if ((performance as any).memory) {
				// @ts-ignore
				memMB = Math.round((performance as any).memory.usedJSHeapSize / 1048576);
			}
		}
		raf = requestAnimationFrame(loop);
	}

	onMount(() => {
		raf = requestAnimationFrame(loop);
		try {
			po = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					longTasks++;
					if (entry.duration > longestTask) longestTask = entry.duration;
				}
			});
			po.observe({ entryTypes: ['longtask'] });
		} catch {}
	});

	onDestroy(() => {
		cancelAnimationFrame(raf);
		if (po) po.disconnect();
	});

	function fpsColor(v: number) {
		if (v >= 55) return '#10b981';
		if (v >= 30) return '#f59e0b';
		return '#ef4444';
	}
</script>

{#if appStore.perfHud}
	<div class="perf-hud">
		<div class="row"><span>FPS</span><b style="color:{fpsColor(fps)}">{fps}</b><span class="dim">min {minFps}</span></div>
		<div class="row"><span>Frame</span><b>{frameMs.toFixed(1)}ms</b></div>
		<div class="row"><span>Elements</span><b>{visible}</b><span class="dim">/ {total}</span></div>
		<div class="row"><span>Cull</span><b>{cullMs.toFixed(2)}ms</b></div>
		<div class="row"><span>Long tasks</span><b style="color:{longTasks > 0 ? '#ef4444' : '#10b981'}">{longTasks}</b><span class="dim">max {longestTask.toFixed(0)}ms</span></div>
		{#if memMB !== null}
			<div class="row"><span>JS heap</span><b>{memMB}MB</b></div>
		{/if}
		<div class="row"><span>Zoom</span><b>{Math.round(zoom * 100)}%</b></div>
		<div class="row"><span>Pan</span><b>{Math.round(panX)},{Math.round(panY)}</b></div>
	</div>
{/if}

<style>
	.perf-hud {
		position: fixed;
		left: 12px;
		bottom: 12px;
		z-index: 99998;
		background: rgba(0, 0, 0, 0.82);
		color: #e5e7eb;
		font: 11px/1.3 ui-monospace, Menlo, Consolas, monospace;
		padding: 8px 12px;
		border-radius: 8px;
		pointer-events: none;
		min-width: 170px;
		user-select: none;
	}
	.row {
		display: grid;
		grid-template-columns: 72px 1fr auto;
		gap: 8px;
		align-items: baseline;
	}
	b {
		font-weight: 700;
		color: #f9fafb;
	}
	.dim {
		color: #9ca3af;
		font-size: 10px;
	}
</style>
