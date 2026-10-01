export type ElementType =
  | 'sticky'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'frame'
  | 'image'
  | 'arrow'
  | 'line';

export interface GradientFill {
  from: string;
  to: string;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  fillOpacity?: number;
  fillGradient?: GradientFill | null;
  stroke?: string;
  draggable: boolean;
  groupId?: string | null;
}

export interface CharFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface TextStyle {
  /** @deprecated whole-element fallback, superseded by per-character `formatting` */
  bold?: boolean;
  /** @deprecated whole-element fallback, superseded by per-character `formatting` */
  italic?: boolean;
  /** @deprecated whole-element fallback, superseded by per-character `formatting` */
  underline?: boolean;
  fontFamily?: string;
  /** Per-character bold/italic/underline, parallel array to `text` (index i describes text[i]). */
  formatting?: CharFormat[];
}

export interface StickyElement extends BaseElement, TextStyle {
  type: 'sticky';
  text: string;
  fontSize: number;
}

export interface TextElement extends BaseElement, TextStyle {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
}

export interface ShapeElement extends BaseElement {
  type: 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'star';
  strokeWidth: number;
  cornerRadius?: number;
}

export interface FrameElement extends BaseElement {
  type: 'frame';
  strokeWidth: number;
  label: string;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
}

export interface LineElement extends BaseElement {
  type: 'arrow' | 'line';
  points: number[];
  strokeWidth: number;
}

export type BoardElement = StickyElement | TextElement | ShapeElement | FrameElement | ImageElement | LineElement;

export interface Board {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  elements: BoardElement[];
  camera: { x: number; y: number; scale: number };
  folderId?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  color: string;
}
