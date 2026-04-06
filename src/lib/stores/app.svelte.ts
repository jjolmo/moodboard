import { invoke } from '@tauri-apps/api/core';
import type { AppState, Project, Vibe, CanvasElement, Tool, Theme, Tag, MoodImageData } from '$lib/types';
import { generateId, now } from '$lib/utils/ids';
import { debounce } from '$lib/utils/debounce';

const VIBE_COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6','#f97316','#06b6d4'];

function randomColor(): string {
	return VIBE_COLORS[Math.floor(Math.random() * VIBE_COLORS.length)];
}

// ── App state ───────────────────────────────────────────────

let projects = $state<Project[]>([]);
let undoStack = $state<string[]>([]); // JSON snapshots of active vibe's elements
const MAX_UNDO = 50;
let activeProjectId = $state<string | null>(null);
let activeVibeId = $state<string | null>(null);
let activeTool = $state<Tool>('select');
let selectedElementIds = $state<Set<string>>(new Set());
let shapeColor = $state('#6366f1');
let theme = $state<Theme>('light');
let initialized = $state(false);
let showSettings = $state(false);
let sidebarCollapsed = $state(false);
let animateGifs = $state(true);
let snapEnabled = $state(false);
let snapDistance = $state(5);
let focusMode = $state(false);
let lightboxElementId = $state<string | null>(null);
let roundedCorners = $state(true);
let zoomSensitivity = $state(5); // 1-10, maps to zoom factor
let imageContextMenu = $state<{ x: number; y: number; elementId: string } | null>(null);
let clipboard = $state<{ elements: CanvasElement[]; isCut: boolean }>({ elements: [], isCut: false });
let activeTagId = $state<string | null>(null);
let tagGridViewId = $state<string | null>(null);

// ── Derived ─────────────────────────────────────────────────

const activeProject = $derived(projects.find((p) => p.id === activeProjectId) ?? null);
const activeVibe = $derived(activeProject?.vibes.find((v) => v.id === activeVibeId) ?? null);
const elements = $derived(activeVibe?.elements ?? []);
const selectedElements = $derived(elements.filter((e) => selectedElementIds.has(e.id)));
const tags = $derived(activeProject?.tags ?? []);

// ── Persistence ─────────────────────────────────────────────

async function loadAppState(): Promise<void> {
	try {
		const state: AppState = await invoke('get_app_state');
		const loadedProjects: Project[] = await invoke('list_projects');
		projects = loadedProjects;

		// Restore settings
		setTheme(state.theme === 'dark' ? 'dark' : 'light');
		if (state.snapEnabled !== undefined) snapEnabled = state.snapEnabled;
		if (state.snapDistance !== undefined) snapDistance = state.snapDistance;
		if (state.animateGifs !== undefined) animateGifs = state.animateGifs;
		if (state.roundedCorners !== undefined) roundedCorners = state.roundedCorners;
		if (state.sidebarCollapsed !== undefined) sidebarCollapsed = state.sidebarCollapsed;
		if ((state as any).zoomSensitivity !== undefined) zoomSensitivity = (state as any).zoomSensitivity;

		if (state.lastProjectId && projects.some((p) => p.id === state.lastProjectId)) {
			activeProjectId = state.lastProjectId;
			const project = projects.find((p) => p.id === state.lastProjectId)!;
			if (project.lastOpenedVibeId && project.vibes.some((v) => v.id === project.lastOpenedVibeId)) {
				activeVibeId = project.lastOpenedVibeId;
			} else if (project.vibes.length > 0) {
				activeVibeId = project.vibes[0].id;
			}
		} else if (projects.length > 0) {
			activeProjectId = projects[0].id;
			if (projects[0].vibes.length > 0) {
				activeVibeId = projects[0].vibes[0].id;
			}
		}

		if (projects.length === 0) {
			await createProject('My Project');
		}

		initialized = true;
	} catch (e) {
		console.error('Failed to load app state:', e);
		setTheme('light');
		await createProject('My Project');
		initialized = true;
	}
}

const debouncedSave = debounce(async () => {
	if (!activeProject) return;
	try {
		const projectToSave = { ...activeProject, updatedAt: now() };
		await invoke('save_project', { project: projectToSave });
		await invoke('save_app_state', {
			state: {
				lastProjectId: activeProjectId, theme,
				snapEnabled, snapDistance, animateGifs, roundedCorners, sidebarCollapsed, zoomSensitivity
			} as AppState
		});
	} catch (e) {
		console.error('Failed to save:', e);
	}
}, 500);

function triggerSave() { debouncedSave(); }

function pushUndo(): void {
	if (!activeVibe) return;
	const snapshot = JSON.stringify(activeVibe.elements);
	// Don't push if identical to last snapshot
	if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snapshot) return;
	undoStack = [...undoStack.slice(-MAX_UNDO + 1), snapshot];
}

function undo(): void {
	if (!activeProjectId || !activeVibeId || undoStack.length === 0) return;
	const snapshot = undoStack[undoStack.length - 1];
	undoStack = undoStack.slice(0, -1);
	const elements = JSON.parse(snapshot) as CanvasElement[];
	projects = projects.map((p) =>
		p.id === activeProjectId ? { ...p, vibes: p.vibes.map((v) =>
			v.id === activeVibeId ? { ...v, elements, updatedAt: now() } : v
		), updatedAt: now() } : p
	);
	selectedElementIds = new Set();
	triggerSave();
}

// ── Project actions ─────────────────────────────────────────

async function createProject(name: string): Promise<string> {
	const vibeId = generateId();
	const project: Project = {
		id: generateId(),
		name,
		lastOpenedVibeId: vibeId,
		vibes: [{
			id: vibeId, name: 'Vibe 1', color: randomColor(),
			elements: [], createdAt: now(), updatedAt: now()
		}],
		createdAt: now(), updatedAt: now()
	};
	await invoke('save_project', { project });
	projects = [...projects, project];
	activeProjectId = project.id;
	activeVibeId = vibeId;
	triggerSave();
	return project.id;
}

async function deleteProject(id: string): Promise<void> {
	await invoke('delete_project', { id });
	projects = projects.filter((p) => p.id !== id);
	if (activeProjectId === id) {
		if (projects.length > 0) {
			activeProjectId = projects[0].id;
			activeVibeId = projects[0].vibes[0]?.id ?? null;
		} else {
			activeProjectId = null; activeVibeId = null;
			await createProject('My Project');
		}
	}
	triggerSave();
}

function renameProject(id: string, name: string): void {
	projects = projects.map((p) => (p.id === id ? { ...p, name, updatedAt: now() } : p));
	triggerSave();
}

function selectProject(id: string): void {
	activeProjectId = id;
	const project = projects.find((p) => p.id === id);
	if (project) {
		activeVibeId = project.lastOpenedVibeId && project.vibes.some((v) => v.id === project.lastOpenedVibeId)
			? project.lastOpenedVibeId : project.vibes[0]?.id ?? null;
	}
	selectedElementIds = new Set();
	triggerSave();
}

// ── Vibe actions ────────────────────────────────────────────

function createVibe(projectId: string, name: string): string {
	const vibe: Vibe = {
		id: generateId(), name, color: randomColor(),
		elements: [], createdAt: now(), updatedAt: now()
	};
	projects = projects.map((p) =>
		p.id === projectId ? { ...p, vibes: [...p.vibes, vibe], lastOpenedVibeId: vibe.id, updatedAt: now() } : p
	);
	activeVibeId = vibe.id;
	selectedElementIds = new Set();
	triggerSave();
	return vibe.id;
}

function deleteVibe(projectId: string, vibeId: string): void {
	const project = projects.find((p) => p.id === projectId);
	if (!project || project.vibes.length <= 1) return;
	projects = projects.map((p) =>
		p.id === projectId ? { ...p, vibes: p.vibes.filter((v) => v.id !== vibeId), updatedAt: now() } : p
	);
	if (activeVibeId === vibeId) {
		activeVibeId = projects.find((p) => p.id === projectId)?.vibes[0]?.id ?? null;
	}
	selectedElementIds = new Set();
	triggerSave();
}

function renameVibe(projectId: string, vibeId: string, name: string): void {
	projects = projects.map((p) =>
		p.id === projectId ? { ...p, vibes: p.vibes.map((v) => (v.id === vibeId ? { ...v, name, updatedAt: now() } : v)), updatedAt: now() } : p
	);
	triggerSave();
}

function updateVibeColor(projectId: string, vibeId: string, color: string): void {
	projects = projects.map((p) =>
		p.id === projectId ? { ...p, vibes: p.vibes.map((v) => (v.id === vibeId ? { ...v, color } : v)), updatedAt: now() } : p
	);
	triggerSave();
}

function selectVibe(vibeId: string): void {
	activeVibeId = vibeId;
	selectedElementIds = new Set();
	if (activeProjectId) {
		projects = projects.map((p) => p.id === activeProjectId ? { ...p, lastOpenedVibeId: vibeId } : p);
	}
	triggerSave();
}

// ── Element actions ─────────────────────────────────────────

function addElement(element: CanvasElement): void {
	if (!activeProjectId || !activeVibeId) return;
	pushUndo();
	projects = projects.map((p) =>
		p.id === activeProjectId ? { ...p, vibes: p.vibes.map((v) =>
			v.id === activeVibeId ? { ...v, elements: [...v.elements, element], updatedAt: now() } : v
		), updatedAt: now() } : p
	);
	selectedElementIds = new Set([element.id]);
	triggerSave();
}

function updateElement(elementId: string, updates: Partial<CanvasElement>): void {
	if (!activeProjectId || !activeVibeId) return;
	projects = projects.map((p) =>
		p.id === activeProjectId ? { ...p, vibes: p.vibes.map((v) =>
			v.id === activeVibeId ? { ...v, elements: v.elements.map((e) =>
				e.id === elementId ? { ...e, ...updates } : e
			), updatedAt: now() } : v
		), updatedAt: now() } : p
	);
	triggerSave();
}

function updateSelectedElements(updates: Partial<CanvasElement>): void {
	if (!activeProjectId || !activeVibeId) return;
	projects = projects.map((p) =>
		p.id === activeProjectId ? { ...p, vibes: p.vibes.map((v) =>
			v.id === activeVibeId ? { ...v, elements: v.elements.map((e) =>
				selectedElementIds.has(e.id) ? { ...e, ...updates } : e
			), updatedAt: now() } : v
		), updatedAt: now() } : p
	);
	triggerSave();
}

function removeElement(elementId: string): void {
	if (!activeProjectId || !activeVibeId) return;
	pushUndo();
	projects = projects.map((p) =>
		p.id === activeProjectId ? { ...p, vibes: p.vibes.map((v) =>
			v.id === activeVibeId ? { ...v, elements: v.elements.filter((e) => e.id !== elementId), updatedAt: now() } : v
		), updatedAt: now() } : p
	);
	selectedElementIds = new Set([...selectedElementIds].filter(id => id !== elementId));
	triggerSave();
}

function removeSelectedElements(): void {
	if (!activeProjectId || !activeVibeId) return;
	pushUndo();
	projects = projects.map((p) =>
		p.id === activeProjectId ? { ...p, vibes: p.vibes.map((v) =>
			v.id === activeVibeId ? { ...v, elements: v.elements.filter((e) => !selectedElementIds.has(e.id)), updatedAt: now() } : v
		), updatedAt: now() } : p
	);
	selectedElementIds = new Set();
	triggerSave();
}

function bringToFront(elementId: string): void {
	if (!activeVibe) return;
	const el = activeVibe.elements.find(e => e.id === elementId);
	if (!el) return;
	if (el.alwaysOnTop) {
		const topZs = activeVibe.elements.filter(e => e.alwaysOnTop && e.id !== elementId).map(e => e.zIndex);
		updateElement(elementId, { zIndex: Math.max(100000, ...topZs) + 1 });
	} else {
		// Normal elements stay in 1-99999 range, never above always-on-top
		const normalZs = activeVibe.elements.filter(e => !e.alwaysOnTop && e.id !== elementId).map(e => e.zIndex);
		const newZ = Math.min(99999, Math.max(1, ...normalZs) + 1);
		updateElement(elementId, { zIndex: newZ });
	}
}

function arrangeInGrid(): void {
	if (!activeVibe || selectedElementIds.size < 2) return;
	pushUndo();
	const selected = activeVibe.elements.filter(e => selectedElementIds.has(e.id));
	if (selected.length < 2) return;

	// Find top-left of selection as anchor
	const minX = Math.min(...selected.map(e => e.x));
	const minY = Math.min(...selected.map(e => e.y));
	const maxW = Math.max(...selected.map(e => e.width));
	const maxH = Math.max(...selected.map(e => e.height));
	const gap = 20;
	const cols = Math.ceil(Math.sqrt(selected.length));

	// Sort by current position (top-to-bottom, left-to-right)
	const sorted = [...selected].sort((a, b) => (a.y - b.y) || (a.x - b.x));

	for (let i = 0; i < sorted.length; i++) {
		const col = i % cols;
		const row = Math.floor(i / cols);
		updateElement(sorted[i].id, {
			x: minX + col * (maxW + gap),
			y: minY + row * (maxH + gap),
			rotation: 0
		});
	}
}

function selectElement(id: string | null, addToSelection = false): void {
	if (id === null) {
		selectedElementIds = new Set();
	} else if (addToSelection) {
		const newSet = new Set(selectedElementIds);
		if (newSet.has(id)) newSet.delete(id);
		else newSet.add(id);
		selectedElementIds = newSet;
	} else {
		selectedElementIds = new Set([id]);
	}
}

function isSelected(id: string): boolean {
	return selectedElementIds.has(id);
}

function copyElements(): void {
	if (selectedElementIds.size === 0) return;
	clipboard = { elements: JSON.parse(JSON.stringify(selectedElements)), isCut: false };
}

function cutElements(): void {
	if (selectedElementIds.size === 0) return;
	clipboard = { elements: JSON.parse(JSON.stringify(selectedElements)), isCut: true };
	removeSelectedElements();
}

function pasteElements(): void {
	if (clipboard.elements.length === 0 || !activeProjectId || !activeVibeId) return;
	pushUndo();
	const offset = clipboard.isCut ? 0 : 20;
	const maxZ = Math.max(...(elements.map(e => e.zIndex) ?? [0]), 0);
	const newIds: string[] = [];
	for (let i = 0; i < clipboard.elements.length; i++) {
		const src = clipboard.elements[i];
		const newId = generateId();
		newIds.push(newId);
		const el: CanvasElement = {
			...src,
			id: newId,
			x: src.x + offset,
			y: src.y + offset,
			zIndex: maxZ + 1 + i
		};
		// Add without pushUndo (already pushed above)
		projects = projects.map((p) =>
			p.id === activeProjectId ? { ...p, vibes: p.vibes.map((v) =>
				v.id === activeVibeId ? { ...v, elements: [...v.elements, el], updatedAt: now() } : v
			), updatedAt: now() } : p
		);
	}
	selectedElementIds = new Set(newIds);
	if (clipboard.isCut) clipboard = { elements: [], isCut: false };
	// Shift clipboard offset for successive pastes
	if (!clipboard.isCut) {
		clipboard = { ...clipboard, elements: clipboard.elements.map(e => ({ ...e, x: e.x + offset, y: e.y + offset })) };
	}
	triggerSave();
}

function setTool(tool: Tool): void {
	activeTool = tool;
	if (tool !== 'select') selectedElementIds = new Set();
}

function setShapeColor(color: string): void { shapeColor = color; }
function toggleSidebar(): void { sidebarCollapsed = !sidebarCollapsed; }
function toggleAnimateGifs(): void { animateGifs = !animateGifs; }
function setZoomSensitivity(v: number): void { zoomSensitivity = Math.max(1, Math.min(30, v)); }
function toggleSnap(): void { snapEnabled = !snapEnabled; }
function setSnapDistance(d: number): void { snapDistance = Math.max(1, Math.min(50, d)); }
function toggleFocusMode(): void { focusMode = !focusMode; }
function toggleRoundedCorners(): void { roundedCorners = !roundedCorners; }
function openLightbox(elementId: string): void { lightboxElementId = elementId; }
function closeLightbox(): void { lightboxElementId = null; }
function openImageContextMenu(x: number, y: number, elementId: string): void { imageContextMenu = { x, y, elementId }; }
function closeImageContextMenu(): void { imageContextMenu = null; }
function toggleAlwaysOnTop(elementId: string): void {
	if (!activeVibe) return;
	const el = activeVibe.elements.find(e => e.id === elementId);
	if (!el) return;
	if (el.alwaysOnTop) {
		// Move to top of normal layer
		const normalZs = activeVibe.elements.filter(e => !e.alwaysOnTop).map(e => e.zIndex);
		updateElement(elementId, { alwaysOnTop: false, zIndex: Math.min(99999, Math.max(1, ...normalZs) + 1) });
	} else {
		// Move to always-on-top layer (100000+)
		const topZs = activeVibe.elements.filter(e => e.alwaysOnTop).map(e => e.zIndex);
		updateElement(elementId, { alwaysOnTop: true, zIndex: Math.max(100000, ...topZs) + 1 });
	}
}

// ── Viewport persistence ────────────────────────────────────

function saveViewport(pX: number, pY: number, z: number): void {
	if (!activeProjectId || !activeVibeId) return;
	projects = projects.map((p) =>
		p.id === activeProjectId ? { ...p, vibes: p.vibes.map((v) =>
			v.id === activeVibeId ? { ...v, panX: pX, panY: pY, zoom: z } : v
		) } : p
	);
	triggerSave();
}

function getViewport(): { panX: number; panY: number; zoom: number } {
	return {
		panX: activeVibe?.panX ?? 0,
		panY: activeVibe?.panY ?? 0,
		zoom: activeVibe?.zoom ?? 1,
	};
}

// ── Snap logic ──────────────────────────────────────────────

function snapPosition(elementId: string, x: number, y: number, w: number, h: number): { x: number; y: number } {
	if (!snapEnabled || !activeVibe) return { x, y };
	const d = snapDistance;
	let sx = x, sy = y;
	for (const other of activeVibe.elements) {
		if (other.id === elementId) continue;
		if (selectedElementIds.has(other.id)) continue;
		if (other.rotation && other.rotation !== 0) continue;
		const ox = other.x, oy = other.y, ow = other.width, oh = other.height;
		// Snap left edge to left/right edges of other
		if (Math.abs(x - ox) < d) sx = ox;
		if (Math.abs(x - (ox + ow)) < d) sx = ox + ow;
		// Snap right edge
		if (Math.abs((x + w) - ox) < d) sx = ox - w;
		if (Math.abs((x + w) - (ox + ow)) < d) sx = ox + ow - w;
		// Snap top edge to top/bottom of other
		if (Math.abs(y - oy) < d) sy = oy;
		if (Math.abs(y - (oy + oh)) < d) sy = oy + oh;
		// Snap bottom edge
		if (Math.abs((y + h) - oy) < d) sy = oy - h;
		if (Math.abs((y + h) - (oy + oh)) < d) sy = oy + oh - h;
	}
	return { x: sx, y: sy };
}

// ── Theme ───────────────────────────────────────────────────

function setTheme(t: Theme): void {
	theme = t;
	if (typeof document !== 'undefined') {
		document.documentElement.classList.toggle('dark', t === 'dark');
	}
	triggerSave();
}

function toggleSettings(): void { showSettings = !showSettings; }

// ── .moo Export/Import ──────────────────────────────────────

async function exportMoo(): Promise<void> {
	if (!activeProjectId || !activeProject) return;
	const { save } = await import('@tauri-apps/plugin-dialog');
	const path = await save({
		defaultPath: `${activeProject.name}.moo`,
		filters: [{ name: 'Moodboard', extensions: ['moo'] }]
	});
	if (!path) return;
	await invoke('export_moo', { projectId: activeProjectId, destPath: path });
}

async function importMoo(): Promise<void> {
	const { open } = await import('@tauri-apps/plugin-dialog');
	const path = await open({ filters: [{ name: 'Moodboard', extensions: ['moo'] }], multiple: false });
	if (!path) return;
	const project: Project = await invoke('import_moo', { sourcePath: path });
	projects = [...projects, project];
	activeProjectId = project.id;
	if (project.vibes.length > 0) activeVibeId = project.vibes[0].id;
	triggerSave();
}

// ── Safe image deletion ─────────────────────────────────────

function countFilenameUsages(filename: string, excludeElementId?: string): number {
	if (!activeProject) return 0;
	let count = 0;
	for (const vibe of activeProject.vibes) {
		for (const el of vibe.elements) {
			if (el.type === 'image' && (el.data as MoodImageData).filename === filename && el.id !== excludeElementId) {
				count++;
			}
		}
	}
	return count;
}

function safeDeleteImageFiles(imageElements: CanvasElement[], excludeIds: Set<string>): void {
	if (!activeProjectId) return;
	for (const el of imageElements) {
		if (el.type !== 'image') continue;
		const filename = (el.data as MoodImageData).filename;
		if (countFilenameUsages(filename, el.id) === 0) {
			// Check no other element in excludeIds uses this filename
			const otherUsesIt = imageElements.some(other => other.id !== el.id && other.type === 'image' && (other.data as MoodImageData).filename === filename);
			if (!otherUsesIt) {
				invoke('delete_image', { projectId: activeProjectId, filename }).catch(console.error);
			}
		}
	}
}

// ── Tag actions ─────────────────────────────────────────────

function createTag(name: string): string {
	if (!activeProjectId) return '';
	const tag: Tag = { id: generateId(), name, color: randomColor(), createdAt: now() };
	projects = projects.map((p) =>
		p.id === activeProjectId ? { ...p, tags: [...(p.tags ?? []), tag], updatedAt: now() } : p
	);
	triggerSave();
	return tag.id;
}

function deleteTag(tagId: string): void {
	if (!activeProjectId) return;
	// Remove tag from project and from all elements across all vibes
	projects = projects.map((p) => {
		if (p.id !== activeProjectId) return p;
		return {
			...p,
			tags: (p.tags ?? []).filter((t) => t.id !== tagId),
			vibes: p.vibes.map((v) => ({
				...v,
				elements: v.elements.map((e) =>
					e.tagIds?.includes(tagId) ? { ...e, tagIds: e.tagIds.filter((id) => id !== tagId) } : e
				)
			})),
			updatedAt: now()
		};
	});
	if (activeTagId === tagId) activeTagId = null;
	if (tagGridViewId === tagId) tagGridViewId = null;
	triggerSave();
}

function renameTag(tagId: string, name: string): void {
	if (!activeProjectId) return;
	projects = projects.map((p) =>
		p.id === activeProjectId ? { ...p, tags: (p.tags ?? []).map((t) => t.id === tagId ? { ...t, name } : t), updatedAt: now() } : p
	);
	triggerSave();
}

function updateTagColor(tagId: string, color: string): void {
	if (!activeProjectId) return;
	projects = projects.map((p) =>
		p.id === activeProjectId ? { ...p, tags: (p.tags ?? []).map((t) => t.id === tagId ? { ...t, color } : t), updatedAt: now() } : p
	);
	triggerSave();
}

function setActiveTag(tagId: string | null): void {
	activeTagId = activeTagId === tagId ? null : tagId;
}

function toggleTagOnElement(elementId: string, tagId: string): void {
	if (!activeProjectId || !activeVibeId) return;
	projects = projects.map((p) =>
		p.id === activeProjectId ? { ...p, vibes: p.vibes.map((v) =>
			v.id === activeVibeId ? { ...v, elements: v.elements.map((e) => {
				if (e.id !== elementId) return e;
				const tags = e.tagIds ?? [];
				return { ...e, tagIds: tags.includes(tagId) ? tags.filter((id) => id !== tagId) : [...tags, tagId] };
			}), updatedAt: now() } : v
		), updatedAt: now() } : p
	);
	triggerSave();
}

function openTagGridView(tagId: string): void { tagGridViewId = tagId; }
function closeTagGridView(): void { tagGridViewId = null; }

function getTaggedImages(tagId: string): { element: CanvasElement; vibeId: string; vibeName: string }[] {
	if (!activeProject) return [];
	const results: { element: CanvasElement; vibeId: string; vibeName: string }[] = [];
	for (const vibe of activeProject.vibes) {
		for (const el of vibe.elements) {
			if (el.type === 'image' && el.tagIds?.includes(tagId)) {
				results.push({ element: el, vibeId: vibe.id, vibeName: vibe.name });
			}
		}
	}
	return results;
}

function getTagUsageCount(tagId: string): number {
	if (!activeProject) return 0;
	let count = 0;
	for (const vibe of activeProject.vibes) {
		for (const el of vibe.elements) {
			if (el.tagIds?.includes(tagId)) count++;
		}
	}
	return count;
}

// ── Reference copy ──────────────────────────────────────────

function copyAsReference(): void {
	if (selectedElementIds.size === 0) return;
	const refs = JSON.parse(JSON.stringify(selectedElements)) as CanvasElement[];
	for (const el of refs) {
		if (el.type === 'image') el.isReference = true;
	}
	clipboard = { elements: refs, isCut: false };
}

// ── Export store ─────────────────────────────────────────────

export const appStore = {
	get projects() { return projects; },
	get activeProjectId() { return activeProjectId; },
	get activeVibeId() { return activeVibeId; },
	get activeProject() { return activeProject; },
	get activeVibe() { return activeVibe; },
	get elements() { return elements; },
	get activeTool() { return activeTool; },
	get selectedElementIds() { return selectedElementIds; },
	get selectedElements() { return selectedElements; },
	get shapeColor() { return shapeColor; },
	get theme() { return theme; },
	get showSettings() { return showSettings; },
	get sidebarCollapsed() { return sidebarCollapsed; },
	get animateGifs() { return animateGifs; },
	get snapEnabled() { return snapEnabled; },
	get snapDistance() { return snapDistance; },
	get zoomSensitivity() { return zoomSensitivity; },
	get focusMode() { return focusMode; },
	get lightboxElementId() { return lightboxElementId; },
	get lightboxElement() { return lightboxElementId ? elements.find(e => e.id === lightboxElementId) ?? null : null; },
	get roundedCorners() { return roundedCorners; },
	get imageContextMenu() { return imageContextMenu; },
	get initialized() { return initialized; },
	get tags() { return tags; },
	get activeTagId() { return activeTagId; },
	get tagGridViewId() { return tagGridViewId; },

	loadAppState, triggerSave,
	createProject, deleteProject, renameProject, selectProject,
	createVibe, deleteVibe, renameVibe, updateVibeColor, selectVibe,
	addElement, updateElement, updateSelectedElements, removeElement, removeSelectedElements,
	bringToFront, selectElement, isSelected, arrangeInGrid, copyElements, cutElements, pasteElements,
	setTool, setShapeColor, toggleSidebar, toggleAnimateGifs,
	toggleSnap, setSnapDistance, setZoomSensitivity, snapPosition,
	toggleFocusMode, toggleRoundedCorners, openLightbox, closeLightbox, toggleAlwaysOnTop, openImageContextMenu, closeImageContextMenu,
	saveViewport, getViewport,
	pushUndo, undo,
	setTheme, toggleSettings, exportMoo, importMoo,
	createTag, deleteTag, renameTag, updateTagColor, setActiveTag, toggleTagOnElement,
	openTagGridView, closeTagGridView, getTaggedImages, getTagUsageCount,
	copyAsReference, safeDeleteImageFiles, countFilenameUsages
};
