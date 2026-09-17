import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Board, BoardElement, Folder } from '../types/board';

const STORAGE_KEY = 'canvasly.boards.v1';
const FOLDERS_KEY = 'canvasly.folders.v1';

const FOLDER_COLORS = ['#FF7A59', '#7A5CFF', '#3CC8B4', '#FFC85C', '#FF5B8B', '#5CC8FF'];

function loadBoards(): Record<string, Board> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persist(boards: Record<string, Board>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  } catch (e) {
    console.error('Failed to save boards', e);
  }
}

function loadFolders(): Record<string, Folder> {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistFolders(folders: Record<string, Folder>) {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  } catch (e) {
    console.error('Failed to save folders', e);
  }
}

interface BoardsState {
  boards: Record<string, Board>;
  folders: Record<string, Folder>;
  createBoard: (name?: string, folderId?: string | null) => string;
  deleteBoard: (id: string) => void;
  renameBoard: (id: string, name: string) => void;
  duplicateBoard: (id: string) => string;
  getBoard: (id: string) => Board | undefined;
  updateElements: (id: string, elements: BoardElement[]) => void;
  updateCamera: (id: string, camera: Board['camera']) => void;
  updateThumbnail: (id: string, thumbnail: string) => void;
  moveBoardToFolder: (id: string, folderId: string | null) => void;
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
}

export const useBoardsStore = create<BoardsState>((set, get) => ({
  boards: loadBoards(),
  folders: loadFolders(),

  createBoard: (name, folderId = null) => {
    const id = nanoid(10);
    const now = Date.now();
    const board: Board = {
      id,
      name: name?.trim() || 'Untitled board',
      createdAt: now,
      updatedAt: now,
      elements: [],
      camera: { x: 0, y: 0, scale: 1 },
      folderId: folderId ?? null,
    };
    const boards = { ...get().boards, [id]: board };
    set({ boards });
    persist(boards);
    return id;
  },

  deleteBoard: (id) => {
    const boards = { ...get().boards };
    delete boards[id];
    set({ boards });
    persist(boards);
  },

  renameBoard: (id, name) => {
    const boards = { ...get().boards };
    if (!boards[id]) return;
    boards[id] = { ...boards[id], name: name.trim() || 'Untitled board', updatedAt: Date.now() };
    set({ boards });
    persist(boards);
  },

  duplicateBoard: (id) => {
    const src = get().boards[id];
    if (!src) return '';
    const newId = nanoid(10);
    const now = Date.now();
    const boards = {
      ...get().boards,
      [newId]: { ...src, id: newId, name: `${src.name} copy`, createdAt: now, updatedAt: now },
    };
    set({ boards });
    persist(boards);
    return newId;
  },

  getBoard: (id) => get().boards[id],

  updateElements: (id, elements) => {
    const boards = { ...get().boards };
    if (!boards[id]) return;
    boards[id] = { ...boards[id], elements, updatedAt: Date.now() };
    set({ boards });
    persist(boards);
  },

  updateCamera: (id, camera) => {
    const boards = { ...get().boards };
    if (!boards[id]) return;
    boards[id] = { ...boards[id], camera };
    set({ boards });
    persist(boards);
  },

  updateThumbnail: (id, thumbnail) => {
    const boards = { ...get().boards };
    if (!boards[id]) return;
    boards[id] = { ...boards[id], thumbnail };
    set({ boards });
    persist(boards);
  },

  moveBoardToFolder: (id, folderId) => {
    const boards = { ...get().boards };
    if (!boards[id]) return;
    boards[id] = { ...boards[id], folderId };
    set({ boards });
    persist(boards);
  },

  createFolder: (name) => {
    const id = nanoid(8);
    const folders = { ...get().folders };
    const color = FOLDER_COLORS[Object.keys(folders).length % FOLDER_COLORS.length];
    folders[id] = { id, name: name.trim() || 'New section', createdAt: Date.now(), color };
    set({ folders });
    persistFolders(folders);
    return id;
  },

  renameFolder: (id, name) => {
    const folders = { ...get().folders };
    if (!folders[id]) return;
    folders[id] = { ...folders[id], name: name.trim() || folders[id].name };
    set({ folders });
    persistFolders(folders);
  },

  deleteFolder: (id) => {
    const folders = { ...get().folders };
    delete folders[id];
    const boards = { ...get().boards };
    for (const boardId of Object.keys(boards)) {
      if (boards[boardId].folderId === id) {
        boards[boardId] = { ...boards[boardId], folderId: null };
      }
    }
    set({ folders, boards });
    persistFolders(folders);
    persist(boards);
  },
}));
