export type ElementType = 'sticky' | 'text' | 'rect' | 'ellipse' | 'image' | 'arrow' | 'line';

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke?: string;
  draggable: boolean;
}

export interface StickyElement extends BaseElement {
  type: 'sticky';
  text: string;
  fontSize: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
}

export interface ShapeElement extends BaseElement {
  type: 'rect' | 'ellipse';
  strokeWidth: number;
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

export type BoardElement = StickyElement | TextElement | ShapeElement | ImageElement | LineElement;

export interface Board {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  elements: BoardElement[];
  camera: { x: number; y: number; scale: number };
}
