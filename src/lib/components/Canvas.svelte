<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { appStore } from '$lib/stores/app.svelte';
	import { invoke, convertFileSrc } from '@tauri-apps/api/core';
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { generateId, now } from '$lib/utils/ids';
	import { debounce } from '$lib/utils/debounce';
	import { readImage, readText } from '@tauri-apps/plugin-clipboard-manager';
	import type { CanvasElement, ArrowData, CircleData, TextData } from '$lib/types';
	import ImageElement from './ImageElement.svelte';
	import ArrowElement from './ArrowElement.svelte';
	import CircleElement from './CircleElement.svelte';
	import TextElement from './TextElement.svelte';

	const CANVAS_SIZE = 5000;

	async function getImageSize(projectId: string, filename: string): Promise<{w: number; h: number}> {
		try {
			const path: string = await invoke('get_image_path', { projectId, filename });
			const src = convertFileSrc(path);
			return new Promise((resolve) => {
				const img = new Image();
				img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
				img.onerror = () => resolve({ w: 300, h: 200 });
				img.src = src;
			});
		} catch { return { w: 300, h: 200 }; }
	}

	let viewport = $state<HTMLElement | null>(null);
	let isDragOver = $state(false);
	let newTextElementId = $state<string | null>(null);
	let skipNextClick = $state(false);
	let drawing = $state(false);
	let drawStart = $state({ x: 0, y: 0 });
	let drawCurrent = $state({ x: 0, y: 0 });
	let marqueeSelecting = $state(false);
	let marqueeStart = $state({ x: 0, y: 0 });
	let marqueeCurrent = $state({ x: 0, y: 0 });

	// ── Pan & Zoom state ────────────────────────────────────

	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let panning = $state(false);
	let panStart = $state({ x: 0, y: 0, panX: 0, panY: 0 });
	let showZoomTooltip = $state(false);
	let lastVibeId = $state<string | null>(null);
	let spaceHeld = $state(false);

	const debouncedSaveViewport = debounce(() => {
		appStore.saveViewport(panX, panY, zoom);
	}, 300);

	// Viewport culling: only render elements visible on screen (with margin)
	let viewportWidth = $state(1920);
	let viewportHeight = $state(1080);
	const CULL_MARGIN = 200; // px extra margin to avoid pop-in

	const visibleElements = $derived.by(() => {
		if (!viewport) return appStore.elements;
		const vw = viewportWidth;
		const vh = viewportHeight;
		const z = zoom;
		const px = panX;
		const py = panY;
		// Viewport bounds in canvas coordinates
		const left = -px / z - CULL_MARGIN / z;
		const top = -py / z - CULL_MARGIN / z;
		const right = (vw - px) / z + CULL_MARGIN / z;
		const bottom = (vh - py) / z + CULL_MARGIN / z;
		return appStore.elements.filter(el => {
			const ex = el.x, ey = el.y, ew = el.width, eh = el.height;
			return ex + ew > left && ex < right && ey + eh > top && ey < bottom;
		});
	});

	// Restore viewport when vibe or tag view changes
	let lastTagViewId = $state<string | null>(null);
	$effect(() => {
		const vid = appStore.activeVibeId;
		const tvid = appStore.tagGridViewId;
		const elCount = appStore.elements.length;
		if ((vid && vid !== lastVibeId) || tvid !== lastTagViewId) {
			lastVibeId = vid ?? lastVibeId;
			lastTagViewId = tvid;
			const vp = appStore.getViewport();
			panX = vp.panX;
			panY = vp.panY;
			zoom = vp.zoom;
		}
	});
	let zoomTooltipTimeout: ReturnType<typeof setTimeout> | null = null;

	// ── Zoom (mouse wheel, centered on cursor) ──────────────

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		if (!viewport) return;

		const rect = viewport.getBoundingClientRect();
		// Mouse position in viewport
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		// Mouse position in canvas space before zoom
		const canvasX = (mx - panX) / zoom;
		const canvasY = (my - panY) / zoom;

		const s = 1 + appStore.zoomSensitivity * 0.01; // 1.01 to 1.10
		const factor = e.deltaY > 0 ? 1 / s : s;
		const newZoom = Math.min(5, Math.max(0.05, zoom * factor));

		// Adjust pan so the canvas point under cursor stays fixed
		panX = mx - canvasX * newZoom;
		panY = my - canvasY * newZoom;
		zoom = newZoom;

		showZoomTooltip = true;
		if (zoomTooltipTimeout) clearTimeout(zoomTooltipTimeout);
		zoomTooltipTimeout = setTimeout(() => { showZoomTooltip = false; }, 1500);
		debouncedSaveViewport();
	}

	// ── Pan & Select (mouse interactions on canvas background) ──────────

	function handleViewportMouseDown(e: MouseEvent) {
		// Middle click and Space+drag handled in capture phase (onMount)
		if (e.button !== 0) return;

		// Ctrl+drag is handled in capture phase (onMount) — skip here
		if (e.ctrlKey || e.metaKey) return;

		// Space+drag = pan
		if (spaceHeld) {
			e.preventDefault();
			panning = true;
			panStart = { x: e.clientX, y: e.clientY, panX, panY };
			window.addEventListener('mousemove', handlePanMove);
			window.addEventListener('mouseup', handlePanEnd);
			return;
		}

		// Normal left-click drag on canvas = marquee selection
		if (appStore.activeTool === 'select') {
			e.preventDefault();
			marqueeSelecting = true;
			const pos = getCanvasPos(e);
			marqueeStart = pos;
			marqueeCurrent = pos;
			window.addEventListener('mousemove', handleMarqueeMove);
			window.addEventListener('mouseup', handleMarqueeEnd);
			return;
		}

		// Text tool: single click creates a text element
		if (appStore.activeTool === 'text') {
			e.preventDefault();
			const pos = getCanvasPos(e);
			const maxZ = Math.max(...(appStore.elements.map((el) => el.zIndex) ?? [0]), 0);
			const element: CanvasElement = {
				id: generateId(),
				type: 'text',
				x: pos.x,
				y: pos.y,
				width: 200,
				height: 40,
				zIndex: maxZ + 1,
				data: { text: '', fontSize: 24, fontFamily: 'Inter, sans-serif', color: appStore.shapeColor, align: 'left' } as TextData
			};
			appStore.addElement(element);
			appStore.setTool('select');
			// Signal the new text element to start editing immediately
			newTextElementId = element.id;
			return;
		}

		// Drawing tools (arrow, circle) — remaining tools after select/text handled above
		{
			e.preventDefault();
			const pos = getCanvasPos(e);
			drawing = true;
			drawStart = pos;
			drawCurrent = pos;
			window.addEventListener('mousemove', handleDrawMove);
			window.addEventListener('mouseup', handleDrawEnd);
		}
	}

	let panRaf = 0;
	let panPendingX = 0;
	let panPendingY = 0;
	function handlePanMove(e: MouseEvent) {
		if (!panning) return;
		panPendingX = panStart.panX + (e.clientX - panStart.x);
		panPendingY = panStart.panY + (e.clientY - panStart.y);
		if (panRaf) return;
		panRaf = requestAnimationFrame(() => {
			panRaf = 0;
			panX = panPendingX;
			panY = panPendingY;
		});
	}

	function handlePanEnd() {
		panning = false;
		window.removeEventListener('mousemove', handlePanMove);
		window.removeEventListener('mouseup', handlePanEnd);
		debouncedSaveViewport();
	}

	// ── Marquee selection ───────────────────────────────────

	function handleMarqueeMove(e: MouseEvent) {
		if (!marqueeSelecting) return;
		marqueeCurrent = getCanvasPos(e);
	}

	function handleMarqueeEnd(e: MouseEvent) {
		if (!marqueeSelecting) return;
		// Update to final position
		marqueeCurrent = getCanvasPos(e);
		marqueeSelecting = false;
		window.removeEventListener('mousemove', handleMarqueeMove);
		window.removeEventListener('mouseup', handleMarqueeEnd);

		// Find elements inside the marquee rect
		const x1 = Math.min(marqueeStart.x, marqueeCurrent.x);
		const y1 = Math.min(marqueeStart.y, marqueeCurrent.y);
		const x2 = Math.max(marqueeStart.x, marqueeCurrent.x);
		const y2 = Math.max(marqueeStart.y, marqueeCurrent.y);

		if (Math.abs(x2 - x1) < 3 && Math.abs(y2 - y1) < 3) return;

		const ids: string[] = [];
		for (const el of appStore.elements) {
			const ex = el.x, ey = el.y, ew = el.width, eh = el.height;
			if (ex + ew > x1 && ex < x2 && ey + eh > y1 && ey < y2) {
				ids.push(el.id);
			}
		}

		if (ids.length > 0) {
			appStore.selectElement(null);
			for (const id of ids) {
				appStore.selectElement(id, true);
			}
			// Prevent the click event (fires after mouseup) from deselecting
			skipNextClick = true;
		}
	}

	// ── Tauri drag-drop ─────────────────────────────────────

	let unlistenDragDrop: (() => void) | null = null;

	let resizeObserver: ResizeObserver | null = null;

	onMount(async () => {
		// Track viewport dimensions for culling
		if (viewport) {
			viewportWidth = viewport.clientWidth;
			viewportHeight = viewport.clientHeight;
			resizeObserver = new ResizeObserver(entries => {
				for (const entry of entries) {
					viewportWidth = entry.contentRect.width;
					viewportHeight = entry.contentRect.height;
				}
			});
			resizeObserver.observe(viewport);
		}

		// Capture-phase listeners — intercept before any child can stopPropagation
		viewport?.addEventListener('mousedown', (e: MouseEvent) => {
			// Middle mouse = pan from anywhere
			if (e.button === 1) {
				e.preventDefault();
				e.stopPropagation();
				panning = true;
				panStart = { x: e.clientX, y: e.clientY, panX, panY };
				window.addEventListener('mousemove', handlePanMove);
				window.addEventListener('mouseup', handlePanEnd);
				return;
			}
			// Space+drag = pan from anywhere (even over elements)
			if (e.button === 0 && spaceHeld) {
				e.preventDefault();
				e.stopPropagation();
				panning = true;
				panStart = { x: e.clientX, y: e.clientY, panX, panY };
				window.addEventListener('mousemove', handlePanMove);
				window.addEventListener('mouseup', handlePanEnd);
				return;
			}
			// Ctrl+drag = marquee selection (additive, even over elements)
			if (e.button === 0 && (e.ctrlKey || e.metaKey) && appStore.activeTool === 'select') {
				e.preventDefault();
				e.stopPropagation();
				marqueeSelecting = true;
				const pos = getCanvasPos(e);
				marqueeStart = pos;
				marqueeCurrent = pos;
				window.addEventListener('mousemove', handleMarqueeMove);
				window.addEventListener('mouseup', handleMarqueeEnd);
			}
		}, true);

		try {
			const webview = getCurrentWebviewWindow();
			unlistenDragDrop = await webview.onDragDropEvent(async (event) => {
				if (event.payload.type === 'over') {
					isDragOver = true;
				} else if (event.payload.type === 'leave') {
					isDragOver = false;
				} else if (event.payload.type === 'drop') {
					isDragOver = false;
					const paths = event.payload.paths;
					if (!paths || paths.length === 0 || !appStore.activeProjectId || !appStore.activeVibeId) return;

					const rect = viewport?.getBoundingClientRect();
					const pos = event.payload.position;
					const dropX = pos ? (pos.x - panX) / zoom : ((rect?.width ?? 800) / 2 - panX) / zoom;
					const dropY = pos ? (pos.y - panY) / zoom : ((rect?.height ?? 600) / 2 - panY) / zoom;

					const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'];

					for (let i = 0; i < paths.length; i++) {
						const filePath = paths[i];
						const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
						if (!imageExts.includes(ext)) continue;

						try {
							const filename: string = await invoke('copy_image', {
								sourcePath: filePath,
								projectId: appStore.activeProjectId
							});
							const size = await getImageSize(appStore.activeProjectId!, filename);

							const maxZ = Math.max(...(appStore.elements.map((el) => el.zIndex) ?? [0]), 0);
							const element: CanvasElement = {
								id: generateId(),
								type: 'image',
								x: dropX + (i % 4) * (size.w + 20) + Math.floor(i / 4) * 30,
								y: dropY + Math.floor(i / 4) * (size.h + 20) + (i % 4) * 15,
								width: size.w,
								height: size.h,
								zIndex: maxZ + 1 + i,
								data: { filename }
							};
							appStore.addElement(element);
						} catch (err) {
							console.error('Failed to add image:', err);
						}
					}
				}
			});
		} catch (e) {
			console.error('Failed to setup drag-drop listener:', e);
		}
	});

	onDestroy(() => {
		if (unlistenDragDrop) unlistenDragDrop();
		if (zoomTooltipTimeout) clearTimeout(zoomTooltipTimeout);
		if (resizeObserver) resizeObserver.disconnect();
	});

	// ── Clipboard paste (Ctrl+V) ────────────────────────────

	async function pasteImageBlob(blob: Blob): Promise<boolean> {
		const arrayBuf = await blob.arrayBuffer();
		const bytes = Array.from(new Uint8Array(arrayBuf));

		const filename: string = await invoke('save_image_bytes', {
			projectId: appStore.activeProjectId,
			data: bytes,
			ext: 'png'
		});
		const size = await getImageSize(appStore.activeProjectId!, filename);

		const rect = viewport?.getBoundingClientRect();
		const cx = ((rect?.width ?? 800) / 2 - panX) / zoom;
		const cy = ((rect?.height ?? 600) / 2 - panY) / zoom;

		const maxZ = Math.max(...(appStore.elements.map((el) => el.zIndex) ?? [0]), 0);
		const element: CanvasElement = {
			id: generateId(),
			type: 'image',
			x: cx - size.w / 2,
			y: cy - size.h / 2,
			width: size.w,
			height: size.h,
			zIndex: maxZ + 1,
			data: { filename }
		};
		appStore.addElement(element);
		return true;
	}

	async function pasteImageUrl(url: string): Promise<boolean> {
		try {
			const filename: string = await invoke('download_image_url', {
				projectId: appStore.activeProjectId,
				url
			});
			const size = await getImageSize(appStore.activeProjectId!, filename);

			const rect = viewport?.getBoundingClientRect();
			const cx = ((rect?.width ?? 800) / 2 - panX) / zoom;
			const cy = ((rect?.height ?? 600) / 2 - panY) / zoom;

			const maxZ = Math.max(...(appStore.elements.map((el) => el.zIndex) ?? [0]), 0);
			const element: CanvasElement = {
				id: generateId(),
				type: 'image',
				x: cx - size.w / 2,
				y: cy - size.h / 2,
				width: size.w,
				height: size.h,
				zIndex: maxZ + 1,
				data: { filename }
			};
			appStore.addElement(element);
			return true;
		} catch (e) {
			console.warn('[paste] URL download failed:', e);
			return false;
		}
	}

	const IMAGE_URL_RE = /^https?:\/\/\S+$/i;

	async function handlePaste(): Promise<boolean> {
		if (!appStore.activeProjectId || !appStore.activeVibeId) return false;

		// 1. Try Tauri clipboard plugin for image data
		try {
			const img = await readImage();
			const rgba = await img.rgba();
			const { width, height } = await img.size();
			if (rgba && rgba.length > 0) {
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext('2d')!;
				const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
				ctx.putImageData(imageData, 0, 0);

				const blob = await new Promise<Blob | null>((resolve) =>
					canvas.toBlob(resolve, 'image/png')
				);
				if (blob) return await pasteImageBlob(blob);
			}
		} catch (e) {
			console.warn('[paste] Tauri readImage failed:', e);
		}

		// 2. Try Tauri clipboard plugin for text (URL)
		try {
			const text = await readText();
			if (text && IMAGE_URL_RE.test(text.trim())) {
				return await pasteImageUrl(text.trim());
			}
		} catch (e) {
			console.warn('[paste] Tauri readText failed:', e);
		}

		// 3. Fallback: browser Clipboard API
		try {
			const items = await navigator.clipboard.read();
			for (const item of items) {
				const imageType = item.types.find((t) => t.startsWith('image/'));
				if (imageType) {
					const blob = await item.getType(imageType);
					return await pasteImageBlob(blob);
				}
				if (item.types.includes('text/plain')) {
					const textBlob = await item.getType('text/plain');
					const text = (await textBlob.text()).trim();
					if (IMAGE_URL_RE.test(text)) {
						return await pasteImageUrl(text);
					}
				}
			}
		} catch (e) {
			console.warn('[paste] Browser clipboard API failed:', e);
		}

		return false;
	}

	// ── Native paste event (captures clipboard images from OS) ──

	async function handleNativePaste(e: ClipboardEvent) {
		if (!appStore.activeProjectId || !appStore.activeVibeId) return;
		const items = e.clipboardData?.items;
		if (!items) return;

		for (const item of Array.from(items)) {
			if (item.type.startsWith('image/')) {
				e.preventDefault();
				const blob = item.getAsFile();
				if (blob) {
					const pasted = await pasteImageBlob(blob);
					if (!pasted) console.warn('[paste] Failed to paste image from native event');
				}
				return;
			}
			if (item.type === 'text/plain') {
				item.getAsString(async (text) => {
					const trimmed = text.trim();
					if (IMAGE_URL_RE.test(trimmed)) {
						e.preventDefault();
						await pasteImageUrl(trimmed);
					}
				});
				return;
			}
		}
	}

	// ── HTML5 drop fallback ─────────────────────────────────

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;

		if (!e.dataTransfer || !appStore.activeProjectId || !appStore.activeVibeId) return;

		const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
		if (files.length === 0) return;

		const rect = viewport?.getBoundingClientRect();
		const dropX = (e.clientX - (rect?.left ?? 0) - panX) / zoom;
		const dropY = (e.clientY - (rect?.top ?? 0) - panY) / zoom;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			try {
				const filePath = (file as any).path || file.name;
				const filename: string = await invoke('copy_image', {
					sourcePath: filePath,
					projectId: appStore.activeProjectId
				});
				const size = await getImageSize(appStore.activeProjectId!, filename);

				const maxZ = Math.max(...(appStore.elements.map((el) => el.zIndex) ?? [0]), 0);
				const element: CanvasElement = {
					id: generateId(),
					type: 'image',
					x: dropX + i * 20,
					y: dropY + i * 20,
					width: size.w,
					height: size.h,
					zIndex: maxZ + 1 + i,
					data: { filename }
				};
				appStore.addElement(element);
			} catch (err) {
				console.error('Failed to add image (HTML5):', err);
			}
		}
	}

	// ── Canvas click (deselect) ─────────────────────────────

	function handleCanvasClick(e: MouseEvent) {
		if (panning) return;
		if (skipNextClick) { skipNextClick = false; return; }
		if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvas === 'true') {
			appStore.selectElement(null);
		}
	}

	// ── Drawing tools ───────────────────────────────────────

	function getCanvasPos(e: MouseEvent): { x: number; y: number } {
		const rect = viewport?.getBoundingClientRect();
		return {
			x: (e.clientX - (rect?.left ?? 0) - panX) / zoom,
			y: (e.clientY - (rect?.top ?? 0) - panY) / zoom
		};
	}

	function handleDrawMove(e: MouseEvent) {
		if (!drawing) return;
		drawCurrent = getCanvasPos(e);
	}

	function handleDrawEnd() {
		if (!drawing) return;
		drawing = false;
		window.removeEventListener('mousemove', handleDrawMove);
		window.removeEventListener('mouseup', handleDrawEnd);

		const dx = drawCurrent.x - drawStart.x;
		const dy = drawCurrent.y - drawStart.y;

		if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;

		const maxZ = Math.max(...(appStore.elements.map((el) => el.zIndex) ?? [0]), 0);

		if (appStore.activeTool === 'arrow') {
			const element: CanvasElement = {
				id: generateId(),
				type: 'arrow',
				x: Math.min(drawStart.x, drawCurrent.x),
				y: Math.min(drawStart.y, drawCurrent.y),
				width: Math.abs(dx),
				height: Math.abs(dy),
				zIndex: maxZ + 1,
				data: { endX: dx, endY: dy, color: appStore.shapeColor, strokeWidth: 3 } as ArrowData
			};
			appStore.addElement(element);
		} else if (appStore.activeTool === 'circle') {
			const element: CanvasElement = {
				id: generateId(),
				type: 'circle',
				x: Math.min(drawStart.x, drawCurrent.x),
				y: Math.min(drawStart.y, drawCurrent.y),
				width: Math.abs(dx),
				height: Math.abs(dy),
				zIndex: maxZ + 1,
				data: { color: appStore.shapeColor, strokeWidth: 3, fill: 'transparent' } as CircleData
			};
			appStore.addElement(element);
		}
	}

	// ── Keyboard shortcuts ──────────────────────────────────

	function handleKeydown(e: KeyboardEvent) {
		// Track space for pan mode
		if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable)) {
			e.preventDefault();
			spaceHeld = true;
		}

		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if ((e.target as HTMLElement)?.isContentEditable) return;

		// Ctrl+Z = undo
		if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
			e.preventDefault();
			appStore.undo();
			return;
		}

		// Ctrl+C = copy, Ctrl+X = cut, Ctrl+V = paste
		if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
			e.preventDefault();
			appStore.copyElements();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
			e.preventDefault();
			appStore.cutElements();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
			// Don't preventDefault here — let the native 'paste' event fire
			// so handleNativePaste can access clipboardData.
			// handlePaste tries Tauri plugin + browser Clipboard API as fallbacks.
			handlePaste().then((pasted) => {
				if (!pasted) appStore.pasteElements();
			});
			return;
		}

		if ((e.key === 'Delete' || e.key === 'Backspace') && appStore.selectedElementIds.size > 0) {
			e.preventDefault();
			// Safe delete: only remove image files if no other elements reference them
			const imageElements = appStore.selectedElements.filter(e => e.type === 'image');
			appStore.safeDeleteImageFiles(imageElements, appStore.selectedElementIds);
			appStore.removeSelectedElements();
		}

		if (e.key === 'Escape') {
			if (appStore.tagGridViewId) { appStore.closeTagGridView(); return; }
			if (appStore.activeTagId) { appStore.setActiveTag(null); return; }
			if (appStore.focusMode) { appStore.toggleFocusMode(); return; }
			appStore.selectElement(null);
			appStore.setTool('select');
		}

		// Reset zoom/pan
		if ((e.ctrlKey || e.metaKey) && e.key === '0') {
			e.preventDefault();
			zoom = 1;
			panX = 0;
			panY = 0;
			showZoomTooltip = true;
			if (zoomTooltipTimeout) clearTimeout(zoomTooltipTimeout);
			zoomTooltipTimeout = setTimeout(() => { showZoomTooltip = false; }, 1500);
		}
	}

	// ── Drawing preview ─────────────────────────────────────

	const previewX = $derived(Math.min(drawStart.x, drawCurrent.x));
	const previewY = $derived(Math.min(drawStart.y, drawCurrent.y));
	const previewW = $derived(Math.abs(drawCurrent.x - drawStart.x));
	const previewH = $derived(Math.abs(drawCurrent.y - drawStart.y));

	// Marquee rect
	const mqX = $derived(Math.min(marqueeStart.x, marqueeCurrent.x));
	const mqY = $derived(Math.min(marqueeStart.y, marqueeCurrent.y));
	const mqW = $derived(Math.abs(marqueeCurrent.x - marqueeStart.x));
	const mqH = $derived(Math.abs(marqueeCurrent.y - marqueeStart.y));

	// Cursor logic
	const cursorStyle = $derived(
		panning ? 'grabbing' :
		spaceHeld ? 'grab' :
		appStore.activeTool !== 'select' ? 'crosshair' :
		'default'
	);
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={(e) => { if (e.code === 'Space') spaceHeld = false; }} onpaste={handleNativePaste} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={viewport}
	class="relative flex-1 overflow-hidden"
	class:ring-2={isDragOver}
	class:ring-accent={isDragOver}
	class:ring-inset={isDragOver}
	ondragover={handleDragOver}
	ondrop={handleDrop}
	onmousedown={handleViewportMouseDown}
	onwheel={handleWheel}
	role="application"
	style="cursor: {cursorStyle}; background-color: var(--color-canvas-bg);"
>
	<!-- Zoom tooltip -->
	{#if showZoomTooltip}
		<div class="pointer-events-none absolute right-4 top-4 z-[99999] rounded-lg bg-bg-secondary/90 px-4 py-2 text-sm font-medium text-text-primary shadow-lg backdrop-blur-sm">
			{Math.round(zoom * 100)}%
		</div>
	{/if}

	<!-- Transformed canvas layer -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="absolute"
		style="transform: {appStore.gpuLayer ? `translate3d(${panX}px, ${panY}px, 0)` : `translate(${panX}px, ${panY}px)`} scale({zoom}); transform-origin: 0 0; width: {CANVAS_SIZE}px; height: {CANVAS_SIZE}px; background-image: radial-gradient(circle, var(--color-canvas-grid) 1px, transparent 1px); background-size: 30px 30px; box-shadow: inset 0 0 0 2px var(--ui-border); will-change: {appStore.gpuLayer ? 'transform' : 'auto'};"
		data-canvas="true"
		onclick={handleCanvasClick}
	>
		<!-- Render elements -->
		{#each visibleElements as element (element.id)}
			{#if element.type === 'image'}
				<ImageElement {element} scrollContainer={viewport} {zoom} />
			{:else if element.type === 'arrow'}
				<ArrowElement {element} {zoom} />
			{:else if element.type === 'circle'}
				<CircleElement {element} {zoom} />
			{:else if element.type === 'text'}
				<TextElement {element} {zoom} autoEdit={newTextElementId === element.id} onEditStarted={() => { newTextElementId = null; }} />
			{/if}
		{/each}

		<!-- Drawing preview -->
		{#if drawing}
			{#if appStore.activeTool === 'arrow'}
				<svg class="pointer-events-none absolute left-0 top-0" width={CANVAS_SIZE} height={CANVAS_SIZE} style="z-index: 99999;">
					<line x1={drawStart.x} y1={drawStart.y} x2={drawCurrent.x} y2={drawCurrent.y} stroke={appStore.shapeColor} stroke-width="3" stroke-dasharray="8 4" />
				</svg>
			{:else if appStore.activeTool === 'circle'}
				<div class="pointer-events-none absolute border-2 border-dashed rounded-full" style="left: {previewX}px; top: {previewY}px; width: {previewW}px; height: {previewH}px; border-color: {appStore.shapeColor}; z-index: 99999;"></div>
			{/if}
		{/if}

		<!-- Marquee selection rectangle -->
		{#if marqueeSelecting && mqW > 2 && mqH > 2}
			<div style="position:absolute; left:{mqX}px; top:{mqY}px; width:{mqW}px; height:{mqH}px; border:2px dashed var(--ui-accent); background:rgba(99,102,241,0.08); border-radius:4px; z-index:99999; pointer-events:none;"></div>
		{/if}
	</div>

	<!-- Drop overlay -->
	{#if isDragOver}
		<div class="pointer-events-none absolute inset-0 z-[99999] flex items-center justify-center bg-accent/10">
			<div class="rounded-lg border-2 border-dashed border-accent bg-bg-primary/80 px-8 py-6 text-center">
				<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-2 text-accent"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
				<p class="text-base font-medium text-text-primary">Drop images here</p>
			</div>
		</div>
	{/if}
</div>
