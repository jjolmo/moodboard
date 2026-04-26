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

	let dragPeers: { id: string; startX: number; startY: number }[] = [];

	function handleMouseDown(e: MouseEvent) {
		if (e.button === 1) return;
		if (appStore.activeTool !== 'select') return;
		e.stopPropagation();
		e.preventDefault();

		if (!appStore.isSelected(element.id)) {
			appStore.selectElement(element.id, e.ctrlKey || e.metaKey);
		}
		appStore.bringToFront(element.id);
		appStore.pushUndo();
		dragging = true;
		dragStart = { x: e.clientX, y: e.clientY, elemX: element.x, elemY: element.y };
		dragPeers = appStore.selectedElements.filter(el => el.id !== element.id).map(el => ({ id: el.id, startX: el.x, startY: el.y }));

		window.addEventListener('mousemove', handleDragMove);
		window.addEventListener('mouseup', handleDragEnd);
	}

	let dragRaf = 0;
	function handleDragMove(e: MouseEvent) {
		if (!dragging) return;
		cancelAnimationFrame(dragRaf);
		dragRaf = requestAnimationFrame(() => {
			const dx = (e.clientX - dragStart.x) / zoom;
			const dy = (e.clientY - dragStart.y) / zoom;
			appStore.updateElement(element.id, {
				x: dragStart.elemX + dx,
				y: dragStart.elemY + dy
			});
			for (const peer of dragPeers) {
				appStore.updateElement(peer.id, { x: peer.startX + dx, y: peer.startY + dy });
			}
		});
	}

	function handleDragEnd() {
		dragging = false;
		dragPeers = [];
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
		<div style="position:absolute;left:-9px;top:-9px;width:18px;height:18px;background:var(--ui-accent);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.25);border-radius:4px;cursor:nw-resize;" onmousedown={(e) => handleResizeStart(e, 'nw')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;right:-9px;top:-9px;width:18px;height:18px;background:var(--ui-accent);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.25);border-radius:4px;cursor:ne-resize;" onmousedown={(e) => handleResizeStart(e, 'ne')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;left:-9px;bottom:-9px;width:18px;height:18px;background:var(--ui-accent);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.25);border-radius:4px;cursor:sw-resize;" onmousedown={(e) => handleResizeStart(e, 'sw')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;right:-9px;bottom:-9px;width:18px;height:18px;background:var(--ui-accent);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.25);border-radius:4px;cursor:se-resize;" onmousedown={(e) => handleResizeStart(e, 'se')}></div>
	{/if}
</div>
