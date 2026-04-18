<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import type { MoodImageData } from '$lib/types';
	import { getImageUrl } from '$lib/utils/imageCache';

	let imageSrc = $state('');
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let panning = $state(false);
	let panStart = $state({ x: 0, y: 0, px: 0, py: 0 });

	const element = $derived(appStore.lightboxElement);
	const data = $derived(element ? element.data as MoodImageData : null);

	$effect(() => {
		if (data?.filename && appStore.activeProjectId) {
			getImageUrl(appStore.activeProjectId, data.filename)
				.then((src) => { imageSrc = src; zoom = 1; panX = 0; panY = 0; })
				.catch(console.error);
		}
	});

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const factor = e.deltaY > 0 ? 0.95 : 1.05;
		zoom = Math.min(10, Math.max(0.1, zoom * factor));
	}

	function handleMouseDown(e: MouseEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		panning = true;
		panStart = { x: e.clientX, y: e.clientY, px: panX, py: panY };
		window.addEventListener('mousemove', handlePanMove);
		window.addEventListener('mouseup', handlePanEnd);
	}

	function handlePanMove(e: MouseEvent) {
		if (!panning) return;
		panX = panStart.px + (e.clientX - panStart.x);
		panY = panStart.py + (e.clientY - panStart.y);
	}

	function handlePanEnd() {
		panning = false;
		window.removeEventListener('mousemove', handlePanMove);
		window.removeEventListener('mouseup', handlePanEnd);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') appStore.closeLightbox();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if appStore.lightboxElementId}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="lightbox-backdrop" onwheel={handleWheel} onmousedown={handleMouseDown} ondblclick={() => appStore.closeLightbox()} oncontextmenu={(e) => { e.preventDefault(); appStore.closeLightbox(); }}>
		<button class="lightbox-close" onclick={() => appStore.closeLightbox()}>
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
		</button>

		<div class="lightbox-zoom">{Math.round(zoom * 100)}%</div>

		{#if imageSrc}
			<img src={imageSrc} alt="" draggable="false" decoding="async"
				style="transform:translate({panX}px,{panY}px) scale({zoom}); transform-origin:center center; max-width:none; pointer-events:none; user-select:none;" />
		{/if}
	</div>
{/if}

<style>
	.lightbox-backdrop {
		position: fixed; inset: 0; z-index: 100000;
		background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
		display: flex; align-items: center; justify-content: center;
		cursor: grab;
	}
	.lightbox-backdrop:active { cursor: grabbing; }
	.lightbox-close {
		position: absolute; top: 16px; right: 16px; z-index: 1;
		width: 40px; height: 40px; border-radius: 12px;
		border: none; background: rgba(255,255,255,0.1);
		color: white; cursor: pointer; display: flex; align-items: center; justify-content: center;
		transition: background 0.15s;
	}
	.lightbox-close:hover { background: rgba(255,255,255,0.2); }
	.lightbox-zoom {
		position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
		padding: 6px 14px; border-radius: 8px;
		background: rgba(255,255,255,0.1); color: white;
		font-size: 13px; font-weight: 600; pointer-events: none;
	}
</style>
