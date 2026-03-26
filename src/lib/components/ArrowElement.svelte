<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import type { CanvasElement, ArrowData } from '$lib/types';

	let { element, zoom = 1 }: { element: CanvasElement; zoom?: number } = $props();

	const isSelected = $derived(appStore.isSelected(element.id));
	const data = $derived(element.data as ArrowData);

	let dragging = $state(false);
	let dragStart = $state({ x: 0, y: 0, elemX: 0, elemY: 0 });

	function handleClick(e: MouseEvent) {
		if (appStore.activeTool !== 'select') return;
		e.stopPropagation();
		appStore.selectElement(element.id);
		appStore.bringToFront(element.id);
	}

	function handleMouseDown(e: MouseEvent) {
		if (e.button === 1) return;
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
			x: dragStart.elemX + dx,
			y: dragStart.elemY + dy
		});
	}

	function handleDragEnd() {
		dragging = false;
		window.removeEventListener('mousemove', handleDragMove);
		window.removeEventListener('mouseup', handleDragEnd);
	}

	// Arrow geometry: start at (0,0) relative to element position, end at (endX, endY)
	const svgWidth = $derived(Math.abs(data.endX) + data.strokeWidth * 2 + 20);
	const svgHeight = $derived(Math.abs(data.endY) + data.strokeWidth * 2 + 20);

	const x1 = $derived(data.endX >= 0 ? 10 : svgWidth - 10);
	const y1 = $derived(data.endY >= 0 ? 10 : svgHeight - 10);
	const x2 = $derived(data.endX >= 0 ? svgWidth - 10 : 10);
	const y2 = $derived(data.endY >= 0 ? svgHeight - 10 : 10);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute select-none"
	style="left: {element.x}px; top: {element.y}px; z-index: {element.zIndex}; pointer-events: none;"
	onmousedown={handleMouseDown}
>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<svg
		width={svgWidth}
		height={svgHeight}
		style="pointer-events: all; overflow: visible;"
		onclick={handleClick}
	>
		<defs>
			<marker
				id="arrowhead-{element.id}"
				markerWidth="10"
				markerHeight="7"
				refX="9"
				refY="3.5"
				orient="auto"
			>
				<polygon points="0 0, 10 3.5, 0 7" fill={data.color} />
			</marker>
		</defs>
		<!-- Invisible thick line for easier click target -->
		<line
			{x1} {y1} {x2} {y2}
			stroke="transparent"
			stroke-width={Math.max(data.strokeWidth + 10, 15)}
			style="cursor: move;"
		/>
		<line
			{x1} {y1} {x2} {y2}
			stroke={data.color}
			stroke-width={data.strokeWidth}
			marker-end="url(#arrowhead-{element.id})"
			style="cursor: move;"
		/>
		{#if isSelected}
			<line
				{x1} {y1} {x2} {y2}
				stroke="var(--color-accent)"
				stroke-width={data.strokeWidth + 2}
				stroke-dasharray="4 4"
				opacity="0.5"
				style="pointer-events: none;"
			/>
		{/if}
	</svg>
</div>
