<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
	import type { CanvasElement, MoodImageData } from '$lib/types';
	import { invoke } from '@tauri-apps/api/core';
	import { getImageUrl, getCachedStaticFrame, cacheStaticFrame, pickBucket, type LodBucket } from '$lib/utils/imageCache';

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

	// Local overrides during drag/resize/rotate — avoids store updates per frame
	let localX = $state<number | null>(null);
	let localY = $state<number | null>(null);
	let localW = $state<number | null>(null);
	let localH = $state<number | null>(null);
	let localRot = $state<number | null>(null);

	// Peer local overrides during group drag
	let peerOverrides = $state<Map<string, { x: number; y: number }>>(new Map());

	const isSelected = $derived(appStore.isSelected(element.id));
	const data = $derived(element.data as MoodImageData);
	const isGif = $derived(data.filename?.toLowerCase().endsWith('.gif') ?? false);
	const displaySrc = $derived(isGif && !appStore.animateGifs && staticSrc ? staticSrc : imageSrc);
	const rotation = $derived(element.rotation ?? 0);

	// Render positions: use local override if dragging, else store value
	const renderX = $derived(localX ?? element.x);
	const renderY = $derived(localY ?? element.y);
	const renderW = $derived(localW ?? element.width);
	const renderH = $derived(localH ?? element.height);
	const renderRot = $derived(localRot ?? rotation);

	// LOD: pick thumbnail bucket based on how big this image renders on screen.
	// Throttled so zoom doesn't spam invocations mid-gesture.
	let currentBucket = $state<LodBucket | null>(null);
	let bucketSwapScheduled = 0;

	function desiredBucket(): LodBucket {
		const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
		const displayPx = Math.max(element.width, element.height) * zoom * dpr;
		return pickBucket(displayPx, currentBucket);
	}

	function loadBucket(bucket: LodBucket) {
		const fn = data.filename;
		const pid = appStore.activeProjectId;
		if (!fn || !pid) return;
		getImageUrl(pid, fn, bucket).then((src) => {
			// Only apply if still the active filename / bucket
			if (data.filename !== fn) return;
			imageSrc = src;
			currentBucket = bucket;
			if (fn.toLowerCase().endsWith('.gif') && !staticSrc) {
				const cached = getCachedStaticFrame(src);
				if (cached) { staticSrc = cached; return; }
				const img = new Image();
				img.crossOrigin = 'anonymous';
				img.onload = () => {
					try {
						const c = document.createElement('canvas');
						c.width = img.naturalWidth; c.height = img.naturalHeight;
						c.getContext('2d')?.drawImage(img, 0, 0);
						const frame = c.toDataURL('image/png');
						cacheStaticFrame(src, frame);
						staticSrc = frame;
					} catch (e) {
						console.warn('[gif] static frame extraction failed:', e);
					}
				};
				img.onerror = (e) => console.warn('[gif] static frame load failed:', e);
				img.src = src;
			}
		}).catch(console.error);
	}

	$effect(() => {
		const fn = data.filename;
		const pid = appStore.activeProjectId;
		if (!fn || !pid) return;

		// First load: pick bucket immediately, reset state if filename changed
		if (fn !== loadedFilename) {
			loadedFilename = fn;
			imageSrc = '';
			staticSrc = '';
			currentBucket = null;
			loadBucket(desiredBucket());
			return;
		}

		// Subsequent: zoom changed. Recompute, and if bucket changed, schedule swap.
		const want = desiredBucket();
		if (want !== currentBucket) {
			if (bucketSwapScheduled) clearTimeout(bucketSwapScheduled);
			bucketSwapScheduled = window.setTimeout(() => {
				bucketSwapScheduled = 0;
				// Re-check in case zoom kept changing
				const again = desiredBucket();
				if (again !== currentBucket) loadBucket(again);
			}, 180);
		}
	});

	let dragPeers: { id: string; startX: number; startY: number }[] = [];

	const hasActiveTag = $derived(appStore.activeTagId !== null);
	const elementHasActiveTag = $derived(
		appStore.activeTagId ? (element.tagIds ?? []).includes(appStore.activeTagId) : false
	);

	function handleMouseDown(e: MouseEvent) {
		if (e.button === 1) return; // middle click reserved for pan
		if (appStore.activeTool !== 'select') return;
		e.stopPropagation(); e.preventDefault();
		appStore.closeImageContextMenu();

		// Tagging mode: toggle tag on click
		if (hasActiveTag && appStore.activeTagId) {
			appStore.toggleTagOnElement(element.id, appStore.activeTagId);
			return;
		}
		// If already selected and part of multi-selection, don't reset selection
		if (!appStore.isSelected(element.id)) {
			appStore.selectElement(element.id, e.ctrlKey || e.metaKey);
		}
		appStore.bringToFront(element.id);
		appStore.pushUndo();
		dragging = true;
		dragStart = { x: e.clientX, y: e.clientY, elemX: element.x, elemY: element.y };
		// Capture initial positions of all selected elements for group drag
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
			// Update local position only — no store update per frame
			localX = nx;
			localY = ny;
			// Broadcast peer positions via DOM for group drag (no store)
			for (const peer of dragPeers) {
				const peerEl = document.querySelector(`[data-element-id="${peer.id}"]`) as HTMLElement | null;
				if (peerEl) {
					const px = peer.startX + dx;
					const py = peer.startY + dy;
					peerEl.style.left = px + 'px';
					peerEl.style.top = py + 'px';
					peerOverrides.set(peer.id, { x: px, y: py });
				}
			}
		});
	}

	function handleDragEnd() {
		if (dragging) {
			// Commit final positions to store in one batch
			if (localX !== null || localY !== null) {
				appStore.updateElement(element.id, { x: localX ?? element.x, y: localY ?? element.y });
				localX = null; localY = null;
			}
			for (const peer of dragPeers) {
				const pos = peerOverrides.get(peer.id);
				if (pos) appStore.updateElement(peer.id, { x: pos.x, y: pos.y });
			}
			peerOverrides.clear();
		}
		dragging = false;
		dragPeers = [];
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
		// Local update only — no store writes per frame
		localX = nx; localY = ny; localW = nw; localH = nh;
		});
	}

	function handleResizeEnd() {
		if (resizing && (localX !== null || localW !== null)) {
			appStore.updateElement(element.id, {
				x: localX ?? element.x, y: localY ?? element.y,
				width: localW ?? element.width, height: localH ?? element.height,
			});
			localX = null; localY = null; localW = null; localH = null;
		}
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
		localRot = newRot;
	}

	function handleRotateEnd() {
		if (rotating && localRot !== null) {
			appStore.updateElement(element.id, { rotation: localRot });
			localRot = null;
		}
		rotating = false;
		window.removeEventListener('mousemove', handleRotateMove);
		window.removeEventListener('mouseup', handleRotateEnd);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={wrapperEl}
	class="absolute select-none"
	data-element-id={element.id}
	style="left:{renderX}px; top:{renderY}px; width:{renderW}px; height:{renderH}px; z-index:{element.zIndex}; transform:rotate({renderRot}deg); transform-origin:center center; will-change:{dragging || resizing ? 'transform' : 'auto'}; contain:layout paint;"
	onmousedown={handleMouseDown}
	ondblclick={handleDblClick}
	oncontextmenu={handleContextMenuEvt}
>
	{#if displaySrc}
		<img src={displaySrc} alt="" draggable="false" loading="lazy" decoding="async"
			style="pointer-events:none; width:100%; height:100%; border-radius:{appStore.roundedCorners ? '6px' : '0'}; object-fit:contain;" />
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

	<!-- Reference indicator -->
	{#if element.isReference}
		<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.6);color:white;border-radius:4px;padding:2px 5px;font-size:10px;pointer-events:none;display:flex;align-items:center;gap:3px;">
			<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
			REF
		</div>
	{/if}

	<!-- Tag dots -->
	{#if element.tagIds?.length}
		<div style="position:absolute;bottom:4px;left:4px;display:flex;gap:3px;pointer-events:none;">
			{#each element.tagIds as tagId}
				{@const tag = appStore.tagMap.get(tagId)}
				{#if tag}
					<div style="width:8px;height:8px;border-radius:50%;background:{tag.color};box-shadow:0 1px 2px rgba(0,0,0,0.3);" title={tag.name}></div>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Tagging mode highlight -->
	{#if hasActiveTag}
		{@const activeTag = appStore.tagMap.get(appStore.activeTagId ?? '')}
		<div style="position:absolute;inset:-10px;border-radius:12px;border:10px solid {elementHasActiveTag ? (activeTag?.color ?? '#10b981') : 'rgba(200,200,200,0.2)'};pointer-events:none;transition:border-color 0.15s;{elementHasActiveTag ? `box-shadow:0 0 24px ${activeTag?.color ?? '#10b981'}80;` : ''}"></div>
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

