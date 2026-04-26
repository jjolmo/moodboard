<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import type { CanvasElement, TextData } from '$lib/types';
	import { onMount } from 'svelte';

	let { element, zoom = 1, autoEdit = false, onEditStarted = () => {} }: {
		element: CanvasElement; zoom?: number; autoEdit?: boolean; onEditStarted?: () => void;
	} = $props();

	let editing = $state(false);
	let dragging = $state(false);
	let resizing = $state<string | null>(null);
	let dragStart = $state({ x: 0, y: 0, elemX: 0, elemY: 0 });
	let resizeStart = $state({ x: 0, y: 0, w: 0, h: 0, elemX: 0, elemY: 0 });
	let editDiv = $state<HTMLDivElement | null>(null);
	let wrapperDiv = $state<HTMLDivElement | null>(null);

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

	// Close editing when clicking outside this element
	function handleGlobalMouseDown(e: MouseEvent) {
		if (!editing) return;
		const target = e.target as HTMLElement;
		// If click is inside our wrapper (text + toolbar), keep editing
		if (wrapperDiv?.contains(target)) return;
		editing = false;
	}

	onMount(() => {
		document.addEventListener('mousedown', handleGlobalMouseDown, true);
		// Auto-start editing if just created
		if (autoEdit) {
			startEditing();
			onEditStarted();
		}
		return () => document.removeEventListener('mousedown', handleGlobalMouseDown, true);
	});

	let dragPeers: { id: string; startX: number; startY: number }[] = [];

	function handleMouseDown(e: MouseEvent) {
		if (e.button === 1) return;
		if (appStore.activeTool !== 'select') return;
		if (editing) return; // let contenteditable handle it
		e.stopPropagation(); e.preventDefault();
		appStore.closeImageContextMenu();
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
			let nx = dragStart.elemX + dx;
			let ny = dragStart.elemY + dy;
			if (!rotation) {
				const snapped = appStore.snapPosition(element.id, nx, ny, element.width, element.height);
				nx = snapped.x; ny = snapped.y;
			}
			appStore.updateElement(element.id, { x: nx, y: ny });
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

	function startEditing() {
		editing = true;
		// Set text and focus after Svelte renders the contenteditable
		requestAnimationFrame(() => {
			if (editDiv) {
				editDiv.innerText = data.text;
				editDiv.focus();
				// Place cursor at end
				const sel = window.getSelection();
				if (sel) {
					sel.selectAllChildren(editDiv);
					sel.collapseToEnd();
				}
			}
		});
	}

	function handleDblClick(e: MouseEvent) {
		e.stopPropagation();
		startEditing();
	}

	function handleTextInput(e: Event) {
		const target = e.target as HTMLDivElement;
		appStore.updateElement(element.id, {
			data: { ...data, text: target.innerText },
			height: Math.max(24, target.scrollHeight)
		});
	}

	function handleTextKeydown(e: KeyboardEvent) {
		e.stopPropagation(); // prevent canvas shortcuts
		if (e.key === 'Escape') {
			editing = false;
		}
	}

	function setFontSize(size: number) {
		appStore.updateElement(element.id, { data: { ...data, fontSize: Math.max(8, Math.min(200, size)) } });
		refocusEdit();
	}
	function setAlign(align: 'left' | 'center' | 'right') {
		appStore.updateElement(element.id, { data: { ...data, align } });
		refocusEdit();
	}
	function setColor(color: string) {
		appStore.updateElement(element.id, { data: { ...data, color } });
	}
	function setFont(fontFamily: string) {
		appStore.updateElement(element.id, { data: { ...data, fontFamily } });
		refocusEdit();
	}

	// Re-focus the contenteditable after toolbar interactions
	function refocusEdit() {
		requestAnimationFrame(() => editDiv?.focus());
	}

	// Prevent toolbar buttons from stealing focus
	function tbMouseDown(e: MouseEvent) {
		e.preventDefault(); // prevents focus shift
		e.stopPropagation();
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
		appStore.updateElement(element.id, { x: nx, y: ny, width: nw, height: nh });
	}
	function handleResizeEnd() {
		resizing = null;
		window.removeEventListener('mousemove', handleResizeMove);
		window.removeEventListener('mouseup', handleResizeEnd);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={wrapperDiv}
	class="absolute"
	style="left:{element.x}px; top:{element.y}px; width:{element.width}px; min-height:{element.height}px; z-index:{element.zIndex}; transform:rotate({rotation}deg); transform-origin:center center; user-select:{editing ? 'text' : 'none'};"
	onmousedown={handleMouseDown}
	ondblclick={handleDblClick}
>
	{#if editing}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div bind:this={editDiv}
			contenteditable="true"
			oninput={handleTextInput}
			onkeydown={handleTextKeydown}
			style="width:100%;height:100%;outline:none;overflow:hidden;white-space:pre-wrap;word-break:break-word;font-size:{data.fontSize}px;font-family:{data.fontFamily};color:{data.color};text-align:{data.align};line-height:1.3;cursor:text;padding:6px;caret-color:{data.color};"
		></div>
	{:else}
		<div style="width:100%;height:100%;overflow:hidden;white-space:pre-wrap;word-break:break-word;font-size:{data.fontSize}px;font-family:{data.fontFamily};color:{data.color};text-align:{data.align};line-height:1.3;padding:6px;cursor:{isSelected ? 'move' : 'default'};">
			{data.text}
		</div>
	{/if}

	<!-- Selection border -->
	{#if isSelected && !editing}
		<div style="position:absolute;inset:0;border:2px dashed var(--ui-accent);background:rgba(99,102,241,0.06);pointer-events:none;"></div>
	{/if}
	{#if editing}
		<div style="position:absolute;inset:0;border:2px solid var(--ui-accent);pointer-events:none;border-radius:2px;"></div>
	{/if}

	<!-- Resize handles -->
	{#if isSelected || editing}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;left:-9px;top:-9px;width:18px;height:18px;background:var(--ui-accent);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.25);border-radius:4px;cursor:nw-resize;" onmousedown={(e) => handleResizeStart(e, 'nw')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;right:-9px;top:-9px;width:18px;height:18px;background:var(--ui-accent);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.25);border-radius:4px;cursor:ne-resize;" onmousedown={(e) => handleResizeStart(e, 'ne')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;left:-9px;bottom:-9px;width:18px;height:18px;background:var(--ui-accent);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.25);border-radius:4px;cursor:sw-resize;" onmousedown={(e) => handleResizeStart(e, 'sw')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;right:-9px;bottom:-9px;width:18px;height:18px;background:var(--ui-accent);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.25);border-radius:4px;cursor:se-resize;" onmousedown={(e) => handleResizeStart(e, 'se')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;left:-6px;top:50%;transform:translateY(-50%);width:12px;height:36px;background:var(--ui-accent);opacity:0.7;border-radius:6px;cursor:w-resize;" onmousedown={(e) => handleResizeStart(e, 'w')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;right:-6px;top:50%;transform:translateY(-50%);width:12px;height:36px;background:var(--ui-accent);opacity:0.7;border-radius:6px;cursor:e-resize;" onmousedown={(e) => handleResizeStart(e, 'e')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:36px;height:12px;background:var(--ui-accent);opacity:0.7;border-radius:6px;cursor:n-resize;" onmousedown={(e) => handleResizeStart(e, 'n')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:36px;height:12px;background:var(--ui-accent);opacity:0.7;border-radius:6px;cursor:s-resize;" onmousedown={(e) => handleResizeStart(e, 's')}></div>
	{/if}

	<!-- Formatting toolbar (when editing) -->
	{#if editing}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="text-toolbar" onmousedown={tbMouseDown}>
			<select value={data.fontFamily} onchange={(e) => setFont(e.currentTarget.value)} onmousedown={(e) => e.stopPropagation()}>
				{#each FONTS as f}
					<option value={f} style="font-family:{f}">{f.split(',')[0]}</option>
				{/each}
			</select>

			<button class="tb" onmousedown={tbMouseDown} onclick={() => setFontSize(data.fontSize - 2)}>−</button>
			<span class="tb-label">{data.fontSize}</span>
			<button class="tb" onmousedown={tbMouseDown} onclick={() => setFontSize(data.fontSize + 2)}>+</button>

			<span class="tb-sep"></span>

			<button class="tb {data.align === 'left' ? 'active' : ''}" onmousedown={tbMouseDown} onclick={() => setAlign('left')}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M3 12h10"/><path d="M3 18h14"/></svg>
			</button>
			<button class="tb {data.align === 'center' ? 'active' : ''}" onmousedown={tbMouseDown} onclick={() => setAlign('center')}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M7 12h10"/><path d="M5 18h14"/></svg>
			</button>
			<button class="tb {data.align === 'right' ? 'active' : ''}" onmousedown={tbMouseDown} onclick={() => setAlign('right')}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M11 12h10"/><path d="M7 18h14"/></svg>
			</button>

			<span class="tb-sep"></span>

			<input type="color" value={data.color} oninput={(e) => setColor(e.currentTarget.value)}
				style="width:22px;height:22px;border:none;padding:0;cursor:pointer;background:transparent;" />
		</div>
	{/if}
</div>

<style>
	.text-toolbar {
		position: absolute;
		bottom: calc(100% + 10px);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 8px;
		border-radius: 12px;
		background: var(--bg-secondary);
		box-shadow: 0 8px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06);
		white-space: nowrap;
		z-index: 99998;
	}
	.text-toolbar select {
		padding: 4px 6px;
		border-radius: 6px;
		border: 1px solid var(--ui-border);
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: 11px;
		max-width: 100px;
		cursor: pointer;
	}
	.tb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.1s;
	}
	.tb:hover { background: var(--bg-hover); color: var(--text-primary); }
	.tb.active { background: var(--ui-accent); color: white; }
	.tb-label {
		font-size: 11px;
		color: var(--text-secondary);
		min-width: 24px;
		text-align: center;
	}
	.tb-sep {
		width: 1px;
		height: 18px;
		background: var(--ui-border);
		margin: 0 3px;
	}
</style>
