export interface AppState {
	lastProjectId: string | null;
	theme?: string;
	snapEnabled?: boolean;
	snapDistance?: number;
	animateGifs?: boolean;
	roundedCorners?: boolean;
	sidebarCollapsed?: boolean;
}

export interface Project {
	id: string;
	name: string;
	lastOpenedVibeId: string | null;
	vibes: Vibe[];
	createdAt: number;
	updatedAt: number;
}

export interface Vibe {
	id: string;
	name: string;
	color: string;
	elements: CanvasElement[];
	panX?: number;
	panY?: number;
	zoom?: number;
	createdAt: number;
	updatedAt: number;
}

export interface CanvasElement {
	id: string;
	type: 'image' | 'arrow' | 'circle' | 'text';
	x: number;
	y: number;
	width: number;
	height: number;
	zIndex: number;
	rotation?: number;
	alwaysOnTop?: boolean;
	data: MoodImageData | ArrowData | CircleData | TextData;
}

export interface MoodImageData {
	filename: string;
}

export interface ArrowData {
	endX: number;
	endY: number;
	color: string;
	strokeWidth: number;
}

export interface CircleData {
	color: string;
	strokeWidth: number;
	fill: string;
}

export interface TextData {
	text: string;
	fontSize: number;
	fontFamily: string;
	color: string;
	align: 'left' | 'center' | 'right';
}

export type Tool = 'select' | 'arrow' | 'circle' | 'text';
export type Theme = 'light' | 'dark';
