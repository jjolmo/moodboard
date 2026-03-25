<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import type { CanvasElement, CircleData } from '$lib/types';

	let { element, zoom = 1 }: { element: CanvasElement; zoom?: number } = $props();

	const isSelected = $derived(appStore.isSelected(element.id));
	const data = $derived(element.data as CircleData);

	let dragging = $state(false);
	let resizing = $state<string | null>(null);
	let dragStart = $state({ x: 0, y: 0, elemX: 0, elemY: 0 });
	let resizeStart = $state({ x: 0, y: 0, w: 0, h: 0, elemX: 0, elemY: 0 });

	function handleMouseDown(e: MouseEvent) {
		if (appStore.activeTool !== 'select') return;
		e.stopPropagation();
		e.preventDefault();

		appStore.selectElement(element.id);
		appStore.bringToFront(element.id);

		dragging = true;
		dragStart = { x: e.clientX, y: e.clientY, elemX: element.x, elemY: element.y };

		window.addEventListener('mousemove', handleDragMove);
		window.addEventListener('mouseup', handleDragEnd);
	}

	function handleDragMove(e: MouseEvent) {
		if (!dragging) return;
		const dx = (e.clientX - dragStart.x) / zoom;
		const dy = (e.clientY - dragStart.y) / zoom;
		appStore.updateElement(element.id, {
			x: Math.max(0, dragStart.elemX + dx),
			y: Math.max(0, dragStart.elemY + dy)
		});
	}

	function handleDragEnd() {
		dragging = false;
		window.removeEventListener('mousemove', handleDragMove);
		window.removeEventListener('mouseup', handleDragEnd);
	}

	function handleResizeStart(e: MouseEvent, handle: string) {
		if (appStore.activeTool !== 'select') return;
		e.stopPropagation();
		e.preventDefault();

		resizing = handle;
		resizeStart = {
			x: e.clientX,
			y: e.clientY,
			w: element.width,
			h: element.height,
			elemX: element.x,
			elemY: element.y
		};

		window.addEventListener('mousemove', handleResizeResize);
		window.addEventListener('mouseup', handleResizeEnd);
	}

	function handleResizeResize(e: MouseEvent) {
		if (!resizing) return;
		const dx = (e.clientX - resizeStart.x) / zoom;
		const dy = (e.clientY - resizeStart.y) / zoom;

		let newW = resizeStart.w;
		let newH = resizeStart.h;
		let newX = resizeStart.elemX;
		let newY = resizeStart.elemY;

		if (resizing.includes('e')) newW = Math.max(30, resizeStart.w + dx);
		if (resizing.includes('w')) {
			newW = Math.max(30, resizeStart.w - dx);
			newX = resizeStart.elemX + (resizeStart.w - newW);
		}
		if (resizing.includes('s')) newH = Math.max(30, resizeStart.h + dy);
		if (resizing.includes('n')) {
			newH = Math.max(30, resizeStart.h - dy);
			newY = resizeStart.elemY + (resizeStart.h - newH);
		}

		appStore.updateElement(element.id, {
			x: Math.max(0, newX),
			y: Math.max(0, newY),
			width: newW,
			height: newH
		});
	}

	function handleResizeEnd() {
		resizing = null;
		window.removeEventListener('mousemove', handleResizeResize);
		window.removeEventListener('mouseup', handleResizeEnd);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute select-none"
	style="left: {element.x}px; top: {element.y}px; width: {element.width}px; height: {element.height}px; z-index: {element.zIndex};"
	onmousedown={handleMouseDown}
>
	<svg width="100%" height="100%" style="overflow: visible;">
		<ellipse
			cx={element.width / 2}
			cy={element.height / 2}
			rx={element.width / 2 - data.strokeWidth}
			ry={element.height / 2 - data.strokeWidth}
			fill={data.fill}
			stroke={data.color}
			stroke-width={data.strokeWidth}
			style="cursor: move;"
		/>
	</svg>

	{#if isSelected}
		<div class="pointer-events-none absolute inset-0 rounded border-2 border-accent border-dashed"></div>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="absolute -left-1.5 -top-1.5 h-3 w-3 cursor-nw-resize rounded-sm bg-accent" onmousedown={(e) => handleResizeStart(e, 'nw')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="absolute -right-1.5 -top-1.5 h-3 w-3 cursor-ne-resize rounded-sm bg-accent" onmousedown={(e) => handleResizeStart(e, 'ne')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-sw-resize rounded-sm bg-accent" onmousedown={(e) => handleResizeStart(e, 'sw')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-sm bg-accent" onmousedown={(e) => handleResizeStart(e, 'se')}></div>
	{/if}
</div>
