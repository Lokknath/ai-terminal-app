import { useState, useEffect, useCallback, useRef } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'
import {
  Folder,
  Home,
  Monitor,
  FileText,
  Download,
  ChevronRight,
  ArrowUp,
  X,
  Compass,
  FolderOpen
} from 'lucide-react'
import { DirectoryItem, SystemFolder } from '../types'

interface FolderExplorerModalProps {
  initialPath?: string
  title?: string
  onSelect: (path: string) => void
  onClose: () => void
}

export default function FolderExplorerModal({
  initialPath = '~',
  title = 'Select Working Directory',
  onSelect,
  onClose
}: FolderExplorerModalProps): JSX.Element {
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [selectedPath, setSelectedPath] = useState(initialPath)
  const [systemFolders, setSystemFolders] = useState<SystemFolder[]>([])
  const [subFolders, setSubFolders] = useState<DirectoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef, onClose)

  // Load system root folders
  useEffect(() => {
    window.api
      .getSystemFolders()
      .then((folders) => {
        setSystemFolders(folders)
        if (initialPath === '~' && folders.length > 0) {
          setCurrentPath(folders[0].path)
          setSelectedPath(folders[0].path)
        }
      })
      .catch(() =>
        setError('Could not load folder shortcuts. You can still choose a folder in Finder.')
      )
  }, [initialPath])

  // Load subfolders when currentPath changes
  const loadDirectory = useCallback(async (dirPath: string) => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const items = await window.api.readDirectory(dirPath)
      if (currentRequest === requestId.current) setSubFolders(items)
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setSubFolders([])
        setError(cause instanceof Error ? cause.message : 'Could not open this folder.')
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDirectory(currentPath)
    }
  }, [currentPath, loadDirectory])

  const navigateTo = (path: string): void => {
    setCurrentPath(path)
    setSelectedPath(path)
  }

  const isWindows = /^[a-zA-Z]:[/\\]/.test(currentPath)
  const rootPrefix = isWindows ? currentPath.slice(0, 2) + '\\' : '/'
  const pathParts = currentPath
    .replace(/^[a-zA-Z]:[/\\]/, '')
    .split(/[/\\]/)
    .filter(Boolean)

  const navigateUp = (): void => {
    if (pathParts.length > 1) {
      const parent = isWindows
        ? currentPath.slice(0, 2) + '\\' + pathParts.slice(0, -1).join('\\')
        : '/' + pathParts.slice(0, -1).join('/')
      navigateTo(parent)
    } else if (pathParts.length === 1) {
      navigateTo(rootPrefix)
    }
  }

  const openNativeFinder = async (): Promise<void> => {
    try {
      const result = await window.api.selectDirectory(currentPath)
      if (result) onSelect(result)
    } catch {
      setError('Could not open Finder. Try selecting a folder from the list.')
    }
  }

  const getShortcutIcon = (iconName?: string): JSX.Element => {
    switch (iconName || 'folder') {
      case 'home':
        return <Home size={16} />
      case 'documents':
        return <FileText size={16} />
      case 'desktop':
        return <Monitor size={16} />
      case 'downloads':
        return <Download size={16} />
      default:
        return <Folder size={16} />
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: '740px',
          height: '520px',
          backgroundColor: '#16161a',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 25px 70px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {error && (
          <div className="folder-error" role="alert">
            {error}
          </div>
        )}
        {/* Top Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderOpen size={18} color="#8baeff" />
            <span style={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>{title}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close folder picker"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              display: 'flex'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation & Breadcrumbs Bar */}
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(255,255,255,0.02)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
            <button
              onClick={navigateUp}
              disabled={currentPath === rootPrefix || currentPath === '/' || pathParts.length === 0}
              title="Go to Parent Folder"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color:
                  currentPath === rootPrefix || currentPath === '/' || pathParts.length === 0
                    ? '#444'
                    : '#bbb',
                cursor:
                  currentPath === rootPrefix || currentPath === '/' || pathParts.length === 0
                    ? 'default'
                    : 'pointer',
                borderRadius: '6px',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ArrowUp size={14} />
            </button>

            {/* Breadcrumb Trail */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                color: '#888',
                overflowX: 'auto',
                whiteSpace: 'nowrap'
              }}
            >
              <button
                onClick={() => navigateTo(rootPrefix)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#aaa',
                  cursor: 'pointer',
                  padding: '2px 4px'
                }}
              >
                {rootPrefix}
              </button>
              {pathParts.map((part, index) => {
                const subPath = isWindows
                  ? currentPath.slice(0, 2) + '\\' + pathParts.slice(0, index + 1).join('\\')
                  : '/' + pathParts.slice(0, index + 1).join('/')
                const isLast = index === pathParts.length - 1
                return (
                  <div key={subPath} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ChevronRight size={12} color="#555" />
                    <button
                      onClick={() => navigateTo(subPath)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isLast ? '#8baeff' : '#aaa',
                        fontWeight: isLast ? 600 : 400,
                        cursor: 'pointer',
                        padding: '2px 4px'
                      }}
                    >
                      {part}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Native Finder Button */}
          <button
            onClick={openNativeFinder}
            title="Browse in macOS Finder"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: 'rgba(117, 157, 255, 0.1)',
              border: '1px solid rgba(117, 157, 255, 0.25)',
              color: '#8baeff',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s'
            }}
          >
            <Compass size={14} /> Open in Finder...
          </button>
        </div>

        {/* Main 2-Column Area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Shortcuts Sidebar */}
          <div
            style={{
              width: '180px',
              minWidth: '180px',
              borderRight: '1px solid rgba(255,255,255,0.06)',
              padding: '10px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              backgroundColor: 'rgba(0,0,0,0.2)'
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#555',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                padding: '4px 8px'
              }}
            >
              Places
            </div>
            {systemFolders.map((f) => {
              const active = currentPath === f.path
              return (
                <button
                  key={f.path}
                  onClick={() => navigateTo(f.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: active ? 'rgba(117, 157, 255, 0.12)' : 'transparent',
                    color: active ? '#8baeff' : '#bbb',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '13px',
                    fontWeight: active ? 600 : 400,
                    transition: 'all 0.1s'
                  }}
                  onMouseOver={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseOut={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <span style={{ color: active ? '#8baeff' : '#888' }}>
                    {getShortcutIcon(f.icon)}
                  </span>
                  <span>{f.name}</span>
                </button>
              )
            })}
          </div>

          {/* Right Subfolders Grid/List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '10px',
              alignContent: 'flex-start'
            }}
          >
            {loading ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '40px',
                  color: '#a3afbd',
                  fontSize: '13px'
                }}
              >
                Scanning directories...
              </div>
            ) : subFolders.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '50px 20px',
                  color: '#555'
                }}
              >
                <Folder size={32} color="#333" style={{ marginBottom: '8px' }} />
                <p style={{ margin: 0, fontSize: '13px' }}>No subfolders found</p>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#444' }}>
                  You can select this folder below
                </p>
              </div>
            ) : (
              subFolders.map((folder) => {
                const isSelected = selectedPath === folder.path
                return (
                  <button
                    key={folder.path}
                    onClick={() => setSelectedPath(folder.path)}
                    onDoubleClick={() => navigateTo(folder.path)}
                    title={`Single click to select, double click to open\n${folder.path}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '12px 8px',
                      borderRadius: '10px',
                      border: isSelected
                        ? '1px solid rgba(117, 157, 255, 0.4)'
                        : '1px solid rgba(255,255,255,0.04)',
                      backgroundColor: isSelected
                        ? 'rgba(117, 157, 255, 0.12)'
                        : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      gap: '8px',
                      transition: 'all 0.1s'
                    }}
                    onMouseOver={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseOut={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'
                    }}
                  >
                    <Folder
                      size={34}
                      color={isSelected ? '#8baeff' : '#4ba3e3'}
                      fill={isSelected ? '#8baeff22' : '#4ba3e322'}
                    />
                    <span
                      style={{
                        fontSize: '12px',
                        color: isSelected ? '#fff' : '#ccc',
                        wordBreak: 'break-word',
                        lineHeight: 1.3,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}
                    >
                      {folder.name}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            backgroundColor: 'rgba(0,0,0,0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: '#888',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '450px',
              fontFamily: 'monospace'
            }}
          >
            Selected: <span style={{ color: '#8baeff' }}>{selectedPath}</span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#aaa',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => onSelect(selectedPath)}
              style={{
                padding: '8px 18px',
                background: 'linear-gradient(135deg, #5579db, #3e5fb6)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '13px',
                boxShadow: '0 2px 10px rgba(0, 122, 204, 0.4)'
              }}
            >
              Choose Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
