<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import type { CanvasElement, MoodImageData } from '$lib/types';
	import { invoke } from '@tauri-apps/api/core';
	import { getCachedImage, getCachedStaticFrame, cacheStaticFrame } from '$lib/utils/imageCache';

	let { element, scrollContainer, zoom = 1 }: { element: CanvasElement; scrollContainer: HTMLElement | null; zoom?: number } = $props();

	let imageSrc = $state('');
	let staticSrc = $state('');
	let loadedFilename = $state('');
	let dragging = $state(false);
	let resizing = $state<string | null>(null);
	let rotating = $state(false);
	let dragStart = $state({ x: 0, y: 0, elemX: 0, elemY: 0 });
	let resizeStart = $state({ x: 0, y: 0, w: 0, h: 0, elemX: 0, elemY: 0 });
	let rotateStart = $state({ angle: 0, mouseAngle: 0 });
	let wrapperEl = $state<HTMLDivElement | null>(null);

	const isSelected = $derived(appStore.isSelected(element.id));
	const data = $derived(element.data as MoodImageData);
	const isGif = $derived(data.filename?.toLowerCase().endsWith('.gif') ?? false);
	const displaySrc = $derived(isGif && !appStore.animateGifs && staticSrc ? staticSrc : imageSrc);
	const rotation = $derived(element.rotation ?? 0);

	// Only reload when filename changes — not on position/size/selection updates
	$effect(() => {
		const fn = data.filename;
		const pid = appStore.activeProjectId;
		if (fn && pid && fn !== loadedFilename) {
			loadedFilename = fn;
			getCachedImage(pid, fn).then((src) => {
				imageSrc = src;
				if (fn.toLowerCase().endsWith('.gif')) {
					const cached = getCachedStaticFrame(src);
					if (cached) { staticSrc = cached; return; }
					const img = new Image();
					img.onload = () => {
						const c = document.createElement('canvas');
						c.width = img.naturalWidth; c.height = img.naturalHeight;
						c.getContext('2d')?.drawImage(img, 0, 0);
						const frame = c.toDataURL('image/png');
						cacheStaticFrame(src, frame);
						staticSrc = frame;
					};
					img.src = src;
				}
			}).catch(console.error);
		}
	});

	function handleMouseDown(e: MouseEvent) {
		if (e.button === 1) return; // middle click reserved for pan
		if (appStore.activeTool !== 'select') return;
		e.stopPropagation(); e.preventDefault();
		appStore.closeImageContextMenu();
		appStore.selectElement(element.id, e.ctrlKey || e.metaKey);
		appStore.bringToFront(element.id);
		appStore.pushUndo();
		dragging = true;
		dragStart = { x: e.clientX, y: e.clientY, elemX: element.x, elemY: element.y };
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
		});
	}

	function handleDragEnd() {
		dragging = false;
		window.removeEventListener('mousemove', handleDragMove);
		window.removeEventListener('mouseup', handleDragEnd);
	}

	function handleDblClick(e: MouseEvent) {
		e.stopPropagation();
		appStore.openLightbox(element.id);
	}

	function handleContextMenuEvt(e: MouseEvent) {
		e.preventDefault(); e.stopPropagation();
		appStore.openImageContextMenu(e.clientX, e.clientY, element.id);
	}

	// ── Resize ──────────────────────────────────────────────

	function handleResizeStart(e: MouseEvent, handle: string) {
		if (appStore.activeTool !== 'select') return;
		e.stopPropagation(); e.preventDefault();
		resizing = handle;
		resizeStart = { x: e.clientX, y: e.clientY, w: element.width, h: element.height, elemX: element.x, elemY: element.y };
		window.addEventListener('mousemove', handleResizeMove);
		window.addEventListener('mouseup', handleResizeEnd);
	}

	let resizeRaf = 0;
	function handleResizeMove(e: MouseEvent) {
		if (!resizing) return;
		const handle = resizing;
		cancelAnimationFrame(resizeRaf);
		resizeRaf = requestAnimationFrame(() => {
		if (!handle) return;
		const dx = (e.clientX - resizeStart.x) / zoom;
		const dy = (e.clientY - resizeStart.y) / zoom;
		const ar = resizeStart.w / resizeStart.h;
		let nw = resizeStart.w, nh = resizeStart.h, nx = resizeStart.elemX, ny = resizeStart.elemY;
		if (handle.includes('e')) nw = Math.max(50, resizeStart.w + dx);
		if (handle.includes('w')) { nw = Math.max(50, resizeStart.w - dx); nx = resizeStart.elemX + (resizeStart.w - nw); }
		if (handle.includes('s')) nh = Math.max(50, resizeStart.h + dy);
		if (handle.includes('n')) { nh = Math.max(50, resizeStart.h - dy); ny = resizeStart.elemY + (resizeStart.h - nh); }
		if (e.shiftKey || handle.length === 2) {
			if (Math.abs(dx) > Math.abs(dy)) {
				nh = nw / ar;
				if (handle.includes('n')) ny = resizeStart.elemY + resizeStart.h - nh;
			} else {
				nw = nh * ar;
				if (handle.includes('w')) nx = resizeStart.elemX + resizeStart.w - nw;
			}
		}
		appStore.updateElement(element.id, { x: nx, y: ny, width: nw, height: nh });
		});
	}

	function handleResizeEnd() {
		resizing = null;
		window.removeEventListener('mousemove', handleResizeMove);
		window.removeEventListener('mouseup', handleResizeEnd);
	}

	// ── Rotate ──────────────────────────────────────────────

	function getScreenCenter(): { cx: number; cy: number } {
		if (wrapperEl) {
			const r = wrapperEl.getBoundingClientRect();
			return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
		}
		return { cx: 0, cy: 0 };
	}

	function handleRotateStart(e: MouseEvent) {
		e.stopPropagation(); e.preventDefault();
		rotating = true;
		const { cx, cy } = getScreenCenter();
		rotateStart = { angle: rotation, mouseAngle: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI };
		window.addEventListener('mousemove', handleRotateMove);
		window.addEventListener('mouseup', handleRotateEnd);
	}

	function handleRotateMove(e: MouseEvent) {
		if (!rotating) return;
		const { cx, cy } = getScreenCenter();
		const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
		let newRot = rotateStart.angle + (currentAngle - rotateStart.mouseAngle);
		for (const snap of [0, 90, 180, 270, -90, -180, -270, 360]) {
			if (Math.abs(newRot - snap) < 5) { newRot = snap; break; }
		}
		appStore.updateElement(element.id, { rotation: newRot });
	}

	function handleRotateEnd() {
		rotating = false;
		window.removeEventListener('mousemove', handleRotateMove);
		window.removeEventListener('mouseup', handleRotateEnd);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={wrapperEl}
	class="absolute select-none"
	style="left:{element.x}px; top:{element.y}px; width:{element.width}px; height:{element.height}px; z-index:{element.zIndex}; transform:rotate({rotation}deg); transform-origin:center center; will-change:{dragging || resizing ? 'transform' : 'auto'};"
	onmousedown={handleMouseDown}
	ondblclick={handleDblClick}
	oncontextmenu={handleContextMenuEvt}
>
	{#if displaySrc}
		<img src={displaySrc} alt="" draggable="false"
			style="pointer-events:none; width:100%; height:100%; border-radius:{appStore.roundedCorners ? '6px' : '0'}; object-fit:contain; image-rendering:pixelated;" />
	{:else}
		<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border-radius:{appStore.roundedCorners ? '6px' : '0'};background:var(--bg-tertiary);color:var(--text-muted);">
			Loading...
		</div>
	{/if}

	<!-- Always on top indicator -->
	{#if element.alwaysOnTop}
		<div style="position:absolute;top:4px;right:4px;background:var(--ui-accent);color:white;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;pointer-events:none;">
			TOP
		</div>
	{/if}

	{#if isSelected}
		<div style="position:absolute;inset:0;border-radius:4px;border:2px solid var(--ui-accent);background:rgba(99,102,241,0.08);pointer-events:none;"></div>

		<!-- Corner resize handles -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;left:-5px;top:-5px;width:10px;height:10px;background:var(--ui-accent);border-radius:2px;cursor:nw-resize;" onmousedown={(e) => handleResizeStart(e, 'nw')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;right:-5px;top:-5px;width:10px;height:10px;background:var(--ui-accent);border-radius:2px;cursor:ne-resize;" onmousedown={(e) => handleResizeStart(e, 'ne')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;left:-5px;bottom:-5px;width:10px;height:10px;background:var(--ui-accent);border-radius:2px;cursor:sw-resize;" onmousedown={(e) => handleResizeStart(e, 'sw')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;right:-5px;bottom:-5px;width:10px;height:10px;background:var(--ui-accent);border-radius:2px;cursor:se-resize;" onmousedown={(e) => handleResizeStart(e, 'se')}></div>

		<!-- Edge resize handles -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;top:-4px;left:50%;transform:translateX(-50%);width:20px;height:6px;background:var(--ui-accent);opacity:0.5;border-radius:3px;cursor:n-resize;" onmousedown={(e) => handleResizeStart(e, 'n')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:20px;height:6px;background:var(--ui-accent);opacity:0.5;border-radius:3px;cursor:s-resize;" onmousedown={(e) => handleResizeStart(e, 's')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;left:-4px;top:50%;transform:translateY(-50%);width:6px;height:20px;background:var(--ui-accent);opacity:0.5;border-radius:3px;cursor:w-resize;" onmousedown={(e) => handleResizeStart(e, 'w')}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;right:-4px;top:50%;transform:translateY(-50%);width:6px;height:20px;background:var(--ui-accent);opacity:0.5;border-radius:3px;cursor:e-resize;" onmousedown={(e) => handleResizeStart(e, 'e')}></div>

		<!-- Rotate handle (above top-center) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position:absolute;top:-28px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;cursor:grab;"
			onmousedown={handleRotateStart}>
			<div style="width:10px;height:10px;border-radius:50%;background:var(--ui-accent);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
			<div style="width:1px;height:10px;background:var(--ui-accent);opacity:0.5;"></div>
		</div>
	{/if}
</div>

