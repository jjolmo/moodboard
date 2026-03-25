<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import type { CanvasElement, TextData } from '$lib/types';

	let { element, zoom = 1 }: { element: CanvasElement; zoom?: number } = $props();

	let editing = $state(false);
	let dragging = $state(false);
	let resizing = $state<string | null>(null);
	let dragStart = $state({ x: 0, y: 0, elemX: 0, elemY: 0 });
	let resizeStart = $state({ x: 0, y: 0, w: 0, h: 0, elemX: 0, elemY: 0 });
	let showToolbar = $state(false);

	const isSelected = $derived(appStore.isSelected(element.id));
	const data = $derived(element.data as TextData);
	const rotation = $derived(element.rotation ?? 0);

	const FONTS = [
		'Inter, sans-serif',
		'Georgia, serif',
		'Courier New, monospace',
		'Comic Sans MS, cursive',
		'Impact, sans-serif',
		'Arial Black, sans-serif',
	];

	function handleMouseDown(e: MouseEvent) {
		if (e.button === 1) return;
		if (appStore.activeTool !== 'select' || editing) return;
		e.stopPropagation(); e.preventDefault();
		appStore.closeImageContextMenu();
		appStore.selectElement(element.id, e.ctrlKey || e.metaKey);
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
		let nx = Math.max(0, dragStart.elemX + dx);
		let ny = Math.max(0, dragStart.elemY + dy);
		if (!rotation) {
			const snapped = appStore.snapPosition(element.id, nx, ny, element.width, element.height);
			nx = snapped.x; ny = snapped.y;
		}
		appStore.updateElement(element.id, { x: nx, y: ny });
	}

	function handleDragEnd() {
		dragging = false;
		window.removeEventListener('mousemove', handleDragMove);
		window.removeEventListener('mouseup', handleDragEnd);
	}

	function handleDblClick(e: MouseEvent) {
		e.stopPropagation();
		editing = true;
		showToolbar = true;
	}

	function handleTextInput(e: Event) {
		const target = e.target as HTMLDivElement;
		appStore.updateElement(element.id, {
			data: { ...data, text: target.innerText }
		});
	}

	function handleTextBlur() {
		editing = false;
	}

	function handleTextKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') { editing = false; (e.target as HTMLElement).blur(); }
		e.stopPropagation();
	}

	function setFontSize(size: number) {
		appStore.updateElement(element.id, { data: { ...data, fontSize: Math.max(8, Math.min(200, size)) } });
	}
	function setAlign(align: 'left' | 'center' | 'right') {
		appStore.updateElement(element.id, { data: { ...data, align } });
	}
	function setColor(color: string) {
		appStore.updateElement(element.id, { data: { ...data, color } });
	}
	function setFont(fontFamily: string) {
		appStore.updateElement(element.id, { data: { ...data, fontFamily } });
	}

	// Resize
	function handleResizeStart(e: MouseEvent, handle: string) {
		if (appStore.activeTool !== 'select') return;
		e.stopPropagation(); e.preventDefault();
		resizing = handle;
		resizeStart = { x: e.clientX, y: e.clientY, w: element.width, h: element.height, elemX: element.x, elemY: element.y };
		window.addEventListener('mousemove', handleResizeMove);
		window.addEventListener('mouseup', handleResizeEnd);
	}
	function handleResizeMove(e: MouseEvent) {
		if (!resizing) return;
		const dx = (e.clientX - resizeStart.x) / zoom;
		const dy = (e.clientY - resizeStart.y) / zoom;
		let nw = resizeStart.w, nh = resizeStart.h, nx = resizeStart.elemX, ny = resizeStart.elemY;
		if (resizing.includes('e')) nw = Math.max(60, resizeStart.w + dx);
		if (resizing.includes('w')) { nw = Math.max(60, resizeStart.w - dx); nx = resizeStart.elemX + (resizeStart.w - nw); }
		if (resizing.includes('s')) nh = Math.max(24, resizeStart.h + dy);
		if (resizing.includes('n')) { nh = Math.max(24, resizeStart.h - dy); ny = resizeStart.elemY + (resizeStart.h - nh); }
		appStore.updateElement(element.id, { x: Math.max(0, nx), y: Math.max(0, ny), width: nw, height: nh });
	}
	function handleResizeEnd() {
		resizing = null;
		window.removeEventListener('mousemove', handleResizeMove);
		window.removeEventListener('mouseup', handleResizeEnd);
	}
</script>

<svelte:window onclick={() => { if (!editing) showToolbar = false; }} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute select-none"
	style="left:{element.x}px; top:{element.y}px; width:{element.width}px; height:{element.height}px; z-index:{element.zIndex}; transform:rotate({rotation}deg); transform-origin:center center;"
	onmousedown={handleMouseDown}
	ondblclick={handleDblClick}
>
	<!-- Text content -->
	{#if editing}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div contenteditable="true"
			oninput={handleTextInput}
			onblur={handleTextBlur}
			onkeydown={handleTextKeydown}
			style="width:100%;height:100%;outline:none;overflow:hidden;white-space:pre-wrap;word-break:break-word;font-size:{data.fontSize}px;font-family:{data.fontFamily};color:{data.color};text-align:{data.align};line-height:1.3;cursor:text;padding:4px;"
		>{data.text}</div>
	{:else}
		<div style="width:100%;height:100%;overflow:hidden;white-space:pre-wrap;word-break:break-word;font-size:{data.fontSize}px;font-family:{data.fontFamily};color:{data.color};text-align:{data.align};line-height:1.3;cursor:move;padding:4px;">
			{data.text}
		</div>
	{/if}

	<!-- Selection + resize -->
	{#if isSelected}
		<div style="position:absolute;inset:0;border:2px dashed var(--ui-accent);pointer-events:none;"></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;left:-5px;top:-5px;width:10px;height:10px;background:var(--ui-accent);border-radius:2px;cursor:nw-resize;" onmousedown={(e) => handleResizeStart(e, 'nw')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;right:-5px;top:-5px;width:10px;height:10px;background:var(--ui-accent);border-radius:2px;cursor:ne-resize;" onmousedown={(e) => handleResizeStart(e, 'ne')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;left:-5px;bottom:-5px;width:10px;height:10px;background:var(--ui-accent);border-radius:2px;cursor:sw-resize;" onmousedown={(e) => handleResizeStart(e, 'sw')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;right:-5px;bottom:-5px;width:10px;height:10px;background:var(--ui-accent);border-radius:2px;cursor:se-resize;" onmousedown={(e) => handleResizeStart(e, 'se')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;left:-4px;top:50%;transform:translateY(-50%);width:6px;height:20px;background:var(--ui-accent);opacity:0.5;border-radius:3px;cursor:w-resize;" onmousedown={(e) => handleResizeStart(e, 'w')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;right:-4px;top:50%;transform:translateY(-50%);width:6px;height:20px;background:var(--ui-accent);opacity:0.5;border-radius:3px;cursor:e-resize;" onmousedown={(e) => handleResizeStart(e, 'e')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;top:-4px;left:50%;transform:translateX(-50%);width:20px;height:6px;background:var(--ui-accent);opacity:0.5;border-radius:3px;cursor:n-resize;" onmousedown={(e) => handleResizeStart(e, 'n')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:20px;height:6px;background:var(--ui-accent);opacity:0.5;border-radius:3px;cursor:s-resize;" onmousedown={(e) => handleResizeStart(e, 's')}></div>
	{/if}

	<!-- Inline toolbar when selected -->
	{#if isSelected && showToolbar}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="text-toolbar" onclick={(e) => e.stopPropagation()} onmousedown={(e) => e.stopPropagation()}>
			<!-- Font select -->
			<select value={data.fontFamily} onchange={(e) => setFont(e.currentTarget.value)}>
				{#each FONTS as f}
					<option value={f} style="font-family:{f}">{f.split(',')[0]}</option>
				{/each}
			</select>

			<!-- Font size -->
			<button class="tb" onclick={() => setFontSize(data.fontSize - 2)}>-</button>
			<span class="tb-label">{data.fontSize}</span>
			<button class="tb" onclick={() => setFontSize(data.fontSize + 2)}>+</button>

			<span class="tb-sep"></span>

			<!-- Alignment -->
			<button class="tb {data.align === 'left' ? 'active' : ''}" onclick={() => setAlign('left')}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M3 12h10"/><path d="M3 18h14"/></svg>
			</button>
			<button class="tb {data.align === 'center' ? 'active' : ''}" onclick={() => setAlign('center')}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M7 12h10"/><path d="M5 18h14"/></svg>
			</button>
			<button class="tb {data.align === 'right' ? 'active' : ''}" onclick={() => setAlign('right')}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M11 12h10"/><path d="M7 18h14"/></svg>
			</button>

			<span class="tb-sep"></span>

			<!-- Color -->
			<input type="color" value={data.color} oninput={(e) => setColor(e.currentTarget.value)}
				style="width:22px;height:22px;border:none;padding:0;cursor:pointer;background:transparent;" />
		</div>
	{/if}
</div>

<style>
	.text-toolbar {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 3px;
		padding: 4px 6px;
		border-radius: 10px;
		background: var(--bg-secondary);
		box-shadow: 0 4px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06);
		white-space: nowrap;
		z-index: 99998;
	}
	.text-toolbar select {
		padding: 3px 4px;
		border-radius: 6px;
		border: 1px solid var(--ui-border);
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: 11px;
		max-width: 90px;
		cursor: pointer;
	}
	.tb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.1s;
	}
	.tb:hover { background: var(--bg-hover); color: var(--text-primary); }
	.tb.active { background: var(--ui-accent); color: white; }
	.tb-label {
		font-size: 11px;
		color: var(--text-secondary);
		min-width: 20px;
		text-align: center;
	}
	.tb-sep {
		width: 1px;
		height: 16px;
		background: var(--ui-border);
		margin: 0 2px;
	}
</style>
