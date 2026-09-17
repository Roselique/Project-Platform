import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBoardsStore } from '../store/boardsStore';
import './Home.css';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return 'just now';
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function Home() {
  const boards = useBoardsStore((s) => s.boards);
  const folders = useBoardsStore((s) => s.folders);
  const createBoard = useBoardsStore((s) => s.createBoard);
  const deleteBoard = useBoardsStore((s) => s.deleteBoard);
  const renameBoard = useBoardsStore((s) => s.renameBoard);
  const duplicateBoard = useBoardsStore((s) => s.duplicateBoard);
  const moveBoardToFolder = useBoardsStore((s) => s.moveBoardToFolder);
  const createFolder = useBoardsStore((s) => s.createFolder);
  const renameFolder = useBoardsStore((s) => s.renameFolder);
  const deleteFolder = useBoardsStore((s) => s.deleteFolder);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState<string | null>('all');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');

  const folderList = useMemo(
    () => Object.values(folders).sort((a, b) => a.createdAt - b.createdAt),
    [folders]
  );

  const allBoards = useMemo(() => Object.values(boards), [boards]);

  const boardList = useMemo(
    () =>
      allBoards
        .filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
        .filter((b) => {
          if (activeFolder === 'all') return true;
          if (activeFolder === 'unfiled') return !b.folderId;
          return b.folderId === activeFolder;
        })
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [allBoards, query, activeFolder]
  );

  function handleCreate() {
    const id = createBoard(undefined, activeFolder && activeFolder !== 'all' && activeFolder !== 'unfiled' ? activeFolder : null);
    navigate(`/board/${id}`);
  }

  function commitRename(id: string) {
    if (renameValue.trim()) renameBoard(id, renameValue);
    setRenamingId(null);
  }

  function handleCreateFolder() {
    const name = prompt('Section name');
    if (name && name.trim()) {
      const id = createFolder(name);
      setActiveFolder(id);
    }
  }

  function commitFolderRename(id: string) {
    if (folderRenameValue.trim()) renameFolder(id, folderRenameValue);
    setRenamingFolderId(null);
  }

  return (
    <div className="home">
      <div className="home__aurora" aria-hidden="true" />

      <header className="home__header">
        <div className="home__brand">
          <span className="home__logo">◆</span>
          <span className="home__brand-name">Canvasly</span>
        </div>
        <div className="home__search">
          <input
            type="text"
            placeholder="Search boards…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="home__new-btn" onClick={handleCreate}>
          <span className="home__new-btn-icon">+</span> New board
        </button>
      </header>

      <div className="home__body">
        <aside className="home__sidebar">
          <button
            className={`home__sidebar-item ${activeFolder === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveFolder('all')}
          >
            <span className="home__sidebar-dot" style={{ background: '#8a8f98' }} />
            All boards
            <span className="home__sidebar-count">{allBoards.length}</span>
          </button>
          <button
            className={`home__sidebar-item ${activeFolder === 'unfiled' ? 'is-active' : ''}`}
            onClick={() => setActiveFolder('unfiled')}
          >
            <span className="home__sidebar-dot" style={{ background: '#5b5f68' }} />
            Unfiled
            <span className="home__sidebar-count">{allBoards.filter((b) => !b.folderId).length}</span>
          </button>

          <div className="home__sidebar-heading">
            <span>Sections</span>
            <button className="home__sidebar-add" onClick={handleCreateFolder} title="New section">
              +
            </button>
          </div>

          {folderList.map((folder) => (
            <div key={folder.id} className={`home__sidebar-item home__sidebar-item--folder ${activeFolder === folder.id ? 'is-active' : ''}`}>
              <button className="home__sidebar-item-btn" onClick={() => setActiveFolder(folder.id)}>
                <span className="home__sidebar-dot" style={{ background: folder.color }} />
                {renamingFolderId === folder.id ? (
                  <input
                    autoFocus
                    className="home__sidebar-rename-input"
                    value={folderRenameValue}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setFolderRenameValue(e.target.value)}
                    onBlur={() => commitFolderRename(folder.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitFolderRename(folder.id);
                      if (e.key === 'Escape') setRenamingFolderId(null);
                    }}
                  />
                ) : (
                  <span className="home__sidebar-label">{folder.name}</span>
                )}
                <span className="home__sidebar-count">{allBoards.filter((b) => b.folderId === folder.id).length}</span>
              </button>
              <details className="home__sidebar-menu">
                <summary>⋯</summary>
                <div className="home__sidebar-menu-items">
                  <button
                    onClick={() => {
                      setRenamingFolderId(folder.id);
                      setFolderRenameValue(folder.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="board-card__menu-danger"
                    onClick={() => {
                      if (confirm(`Delete section "${folder.name}"? Boards inside will move to Unfiled.`)) {
                        if (activeFolder === folder.id) setActiveFolder('all');
                        deleteFolder(folder.id);
                      }
                    }}
                  >
                    Delete section
                  </button>
                </div>
              </details>
            </div>
          ))}
        </aside>

        <main className="home__main">
          <div className="home__intro">
            <h1>
              Your <em>infinite</em> canvas, always at hand.
            </h1>
            <p>Sketch ideas, drop sticky notes, and map out anything — then pick up exactly where you left off.</p>
          </div>

          {boardList.length === 0 ? (
            <div className="home__empty">
              <div className="home__empty-illustration">
                <div className="home__empty-note home__empty-note--a" />
                <div className="home__empty-note home__empty-note--b" />
                <div className="home__empty-note home__empty-note--c" />
              </div>
              <h2>{query ? 'No boards match your search' : 'No boards here yet'}</h2>
              {!query && (
                <>
                  <p>Create a board to start sketching, planning, or brainstorming.</p>
                  <button className="home__new-btn home__new-btn--large" onClick={handleCreate}>
                    <span className="home__new-btn-icon">+</span> Create a board
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="home__grid">
              <button className="board-card board-card--create" onClick={handleCreate}>
                <div className="board-card--create-icon">+</div>
                <span>New board</span>
              </button>

              {boardList.map((board) => (
                <div className="board-card" key={board.id} onClick={() => navigate(`/board/${board.id}`)}>
                  <div className="board-card__thumb">
                    {board.thumbnail ? (
                      <img src={board.thumbnail} alt="" />
                    ) : (
                      <div className="board-card__thumb-placeholder">
                        <span>{board.name.slice(0, 1).toUpperCase()}</span>
                      </div>
                    )}
                    {board.folderId && folders[board.folderId] && (
                      <span
                        className="board-card__folder-tag"
                        style={{ background: folders[board.folderId].color }}
                      >
                        {folders[board.folderId].name}
                      </span>
                    )}
                  </div>
                  <div className="board-card__footer">
                    {renamingId === board.id ? (
                      <input
                        className="board-card__rename-input"
                        autoFocus
                        value={renameValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(board.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(board.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                    ) : (
                      <span className="board-card__name">{board.name}</span>
                    )}
                    <span className="board-card__time">Edited {timeAgo(board.updatedAt)}</span>
                  </div>

                  <div className="board-card__menu" onClick={(e) => e.stopPropagation()}>
                    <details>
                      <summary>⋯</summary>
                      <div className="board-card__menu-items">
                        <button
                          onClick={() => {
                            setRenamingId(board.id);
                            setRenameValue(board.name);
                          }}
                        >
                          Rename
                        </button>
                        <button onClick={() => navigate(`/board/${duplicateBoard(board.id)}`)}>Duplicate</button>
                        {folderList.length > 0 && (
                          <div className="board-card__menu-submenu">
                            <span className="board-card__menu-submenu-label">Move to…</span>
                            <button onClick={() => moveBoardToFolder(board.id, null)}>Unfiled</button>
                            {folderList.map((f) => (
                              <button key={f.id} onClick={() => moveBoardToFolder(board.id, f.id)}>
                                <span className="home__sidebar-dot" style={{ background: f.color }} />
                                {f.name}
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          className="board-card__menu-danger"
                          onClick={() => {
                            if (confirm(`Delete "${board.name}"? This can't be undone.`)) {
                              deleteBoard(board.id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
