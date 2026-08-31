import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlignCenterHorizontal, AlignCenterVertical, ArrowDown, ArrowUp, BringToFront,
  Check, ChevronDown, ChevronLeft, ChevronRight, Download, Eye, FileImage, FileText, GripVertical,
  HelpCircle, Image as ImageIcon, ImagePlus, LayoutGrid, Maximize, Minus,
  Move, Plus, Redo2, RotateCcw, RotateCw, Save, SendToBack, Trash2, Undo2,
  X, ZoomIn,
} from 'lucide-react'
import { useHistory } from './hooks/useHistory'
import {
  PAGE_PRESET_GROUPS, PAGE_PRESETS, calculateDpi, estimateMegabytes, fitElement, getImageSize,
  getPageSize, gridElements, loadProject, saveProject, uid,
} from './lib/project'
import './styles.css'

const DEFAULT_SETTINGS = { pagePreset: 'a4', landscape: false, margin: 12, fitMode: 'contain' }
const IMAGE_TYPES = /image\/(jpeg|png|webp)/
const MIN_ZOOM = 35
const MAX_ZOOM = 200
const DEFAULT_ZOOM = 100

function PageThumbnail({ page, index, active, onSelect, onRemove, onDrop, onDragStart }) {
  return <article className={`thumb-row ${active ? 'selected' : ''}`} draggable onDragStart={onDragStart} onDragOver={event => event.preventDefault()} onDrop={onDrop} onClick={onSelect}>
    <GripVertical className="drag-icon" />
    <span className="page-number">{index + 1}</span>
    <div className="page-thumb-preview">{page.elements.map(element => <img key={element.id} src={element.dataUrl} alt="" />)}</div>
    <span className="element-count" title={page.landscape ? '横向页面' : '纵向页面'}>{page.landscape ? '横' : '竖'}·{page.elements.length}</span>
    <button className="trash" title="删除页面" onClick={event => { event.stopPropagation(); onRemove() }}><Trash2 /></button>
  </article>
}

function EditorCanvas({ page, pageSize, pageLandscape, selectedId, onSelect, onPointerDrag, zoom, onZoomChange, onToggleOrientation, onDropFiles }) {
  const canvasWidth = Math.min(740, window.innerWidth * .5) * zoom / 100
  const canvasHeight = canvasWidth * pageSize.height / pageSize.width
  return <section className="editor">
    <div className="ruler top-ruler"><span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>mm</span></div>
    <div className="ruler side-ruler"><span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>250</span></div>
    <div className="editor-quick-tools">
      <div className="zoom-control editor-zoom-control" aria-label="预览大小">
        <button aria-label="缩小预览" onClick={() => onZoomChange(Math.max(MIN_ZOOM, zoom - 10))}><Minus /></button>
        <span>{zoom}%</span>
        <button aria-label="放大预览" onClick={() => onZoomChange(Math.min(MAX_ZOOM, zoom + 10))}><Plus /></button>
      </div>
      <button className="quick-orientation-button" aria-label={pageLandscape ? '切换为纵向' : '切换为横向'} onClick={() => onToggleOrientation(!pageLandscape)}>
        <FileText className={pageLandscape ? '' : 'rotate-icon'} />
        {pageLandscape ? '切换纵向' : '切换横向'}
      </button>
    </div>
    <div className="canvas-wrap" onDragOver={event => event.preventDefault()} onDrop={onDropFiles}>
      <div className="page-canvas" style={{ width: canvasWidth, height: canvasHeight }} onPointerDown={() => onSelect(null)}>
        {page?.elements.map(element => {
          const selected = element.id === selectedId
          return <div key={element.id} className={`placed-image ${selected ? 'selected-object' : ''}`} style={{ left: `${element.placement.x / pageSize.width * 100}%`, top: `${element.placement.y / pageSize.height * 100}%`, width: `${element.placement.w / pageSize.width * 100}%`, height: `${element.placement.h / pageSize.height * 100}%`, zIndex: selected ? 20 : 1 }} onPointerDown={event => { event.stopPropagation(); onSelect(element.id); onPointerDrag(event, element, 'move', canvasWidth) }}>
            <img src={element.dataUrl} alt={element.name} draggable="false" style={{ transform: `rotate(${element.rotation || 0}deg)` }} />
            {selected ? <>
              {['tl', 'tr', 'bl'].map(position => <i key={position} className={`handle ${position}`} />)}
              <i className="handle br" onPointerDown={event => { event.stopPropagation(); onPointerDrag(event, element, 'resize', canvasWidth) }} />
              <span className="image-meta">{element.pixelWidth} × {element.pixelHeight} px</span>
            </> : null}
          </div>
        })}
        {!page?.elements.length ? <div className="canvas-empty"><FileImage /><strong>把图片拖到这里</strong><span>或从左侧选择文件开始</span></div> : null}
      </div>
    </div>
  </section>
}

function Inspector({ settings, page, pageLandscape, selected, updateElement, alignElement, layerElement, applyFitMode, applyAllFitMode, changePagePreset, changePageOrientation, dpi }) {
  const dpiTone = dpi >= 300 ? 'good' : dpi >= 150 ? 'medium' : 'low'
  return <aside className="sidebar inspector">
    <h2>页面设置</h2>
    <div className="settings-row">
      <div><label className="field-label">页面尺寸</label><div className="select-wrap"><select value={settings.pagePreset} onChange={event => changePagePreset(event.target.value)}>{PAGE_PRESET_GROUPS.map(group => <optgroup key={group} label={group}>{Object.entries(PAGE_PRESETS).filter(([, preset]) => preset.group === group).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}</optgroup>)}</select><ChevronDown /></div></div>
      <div><label className="field-label">边距</label><div className="compact-number"><input type="number" min="0" max="40" value={settings.margin} onChange={event => setSettings(current => ({ ...current, margin: Number(event.target.value) }))} /><span>mm</span></div></div>
    </div>
    <div className="section-title page-direction-title"><span>当前页方向</span><small>{page ? '仅修改此页' : '新页面默认'}</small></div>
    <div className="segmented two compact-segmented">
      <button className={!pageLandscape ? 'active' : ''} onClick={() => changePageOrientation(false)}><FileText /> 纵向</button>
      <button className={pageLandscape ? 'active' : ''} onClick={() => changePageOrientation(true)}><FileText className="rotate-icon" /> 横向</button>
    </div>
    <div className="section-title"><span>图像放置</span><button title="重新适配" onClick={() => applyFitMode(settings.fitMode)}><RotateCcw /></button></div>
    <div className="segmented three">
      <button className={settings.fitMode === 'contain' ? 'active' : ''} onClick={() => applyFitMode('contain')}><Maximize /> 适应</button>
      <button className={settings.fitMode === 'cover' ? 'active' : ''} onClick={() => applyFitMode('cover')}><LayoutGrid /> 铺满</button>
      <button className={settings.fitMode === 'original' ? 'active' : ''} onClick={() => applyFitMode('original')}><ZoomIn /> 300DPI</button>
    </div>
    <div className="bulk-fit-actions">
      <button onClick={() => applyAllFitMode('contain')}><Maximize /> 全部适应</button>
      <button onClick={() => applyAllFitMode('cover')}><LayoutGrid /> 全部铺满</button>
    </div>
    {selected ? <>
      <div className="section-title"><span>选中图片</span><small>{page.elements.findIndex(item => item.id === selected.id) + 1}/{page.elements.length}</small></div>
      <div className="object-tools">
        <button title="水平居中" onClick={() => alignElement('horizontal')}><AlignCenterHorizontal /></button>
        <button title="垂直居中" onClick={() => alignElement('vertical')}><AlignCenterVertical /></button>
        <button title="旋转 90°" onClick={() => updateElement({ rotation: ((selected.rotation || 0) + 90) % 360 })}><RotateCw /></button>
        <button title="置于顶层" onClick={() => layerElement('front')}><BringToFront /></button>
        <button title="置于底层" onClick={() => layerElement('back')}><SendToBack /></button>
      </div>
      <div className="position-grid">{[['X', 'x'], ['Y', 'y'], ['宽', 'w'], ['高', 'h']].map(([label, key]) => <label key={key}>{label}<input type="number" value={selected.placement[key].toFixed(1)} onChange={event => updateElement({ placement: { ...selected.placement, [key]: Math.max(key === 'w' || key === 'h' ? 1 : -999, Number(event.target.value)) } })} /><span>mm</span></label>)}</div>
      <div className={`dpi-card ${dpiTone}`}><span className="dpi-value">{dpi}</span><div><strong>DPI</strong><small>{dpi >= 300 ? '适合高清打印' : dpi >= 150 ? '清晰度尚可' : '放大过多，建议缩小'}</small></div></div>
    </> : <div className="selection-hint"><Move /><span>选择画布中的图片后，可精确定位、旋转和调整图层。</span></div>}
  </aside>
}

function PreviewModal({ pages, settings, onClose, onExport, estimate, onMovePage, onMoveImage }) {
  const [dragItem, setDragItem] = useState(null)
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="preview-modal" onMouseDown={event => event.stopPropagation()}>
      <header><div><h2>导出前总览</h2><p>{pages.length} 页 · 预计约 {estimate} MB</p></div><button onClick={onClose}><X /></button></header>
      <div className="preview-pages">{pages.map((page, index) => {
        const previewPageSize = getPageSize({ ...settings, landscape: page.landscape ?? settings.landscape })
        return <article key={page.id} className="preview-page-card" draggable onDragStart={() => setDragItem({ type: 'page', index })} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (dragItem?.type === 'page') onMovePage(dragItem.index, index); setDragItem(null) }}>
        <div className="mini-page" style={{ aspectRatio: `${previewPageSize.width}/${previewPageSize.height}` }}>{page.elements.map(element => <img key={element.id} src={element.dataUrl} alt={element.name} style={{ left: `${element.placement.x / previewPageSize.width * 100}%`, top: `${element.placement.y / previewPageSize.height * 100}%`, width: `${element.placement.w / previewPageSize.width * 100}%`, height: `${element.placement.h / previewPageSize.height * 100}%`, transform: `rotate(${element.rotation || 0}deg)` }} />)}</div>
        <span className="preview-page-label"><GripVertical /> 第 {index + 1} 页 · {page.landscape ? '横向' : '纵向'} · {page.elements.length} 张 <span className="page-order-buttons"><button aria-label={`第 ${index + 1} 页前移`} disabled={index === 0} onClick={event => { event.stopPropagation(); onMovePage(index, index - 1) }}><ChevronLeft /></button><button aria-label={`第 ${index + 1} 页后移`} disabled={index === pages.length - 1} onClick={event => { event.stopPropagation(); onMovePage(index, index + 1) }}><ChevronRight /></button></span></span>
        {page.elements.length > 1 ? <div className="preview-order-area"><small>拖动图片，或用箭头调整顺序</small><div className="preview-order-strip">{page.elements.map((element, elementIndex) => <div key={element.id} className="preview-order-item" draggable onDragStart={event => { event.stopPropagation(); setDragItem({ type: 'image', pageId: page.id, index: elementIndex }) }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); if (dragItem?.type === 'image' && dragItem.pageId === page.id) onMoveImage(page.id, dragItem.index, elementIndex); setDragItem(null) }}><GripVertical /><img src={element.dataUrl} alt={element.name} /><span>{elementIndex + 1}</span><div className="preview-order-actions"><button aria-label={`第 ${elementIndex + 1} 张前移`} disabled={elementIndex === 0} onClick={event => { event.stopPropagation(); onMoveImage(page.id, elementIndex, elementIndex - 1) }}><ChevronLeft /></button><button aria-label={`第 ${elementIndex + 1} 张后移`} disabled={elementIndex === page.elements.length - 1} onClick={event => { event.stopPropagation(); onMoveImage(page.id, elementIndex, elementIndex + 1) }}><ChevronRight /></button></div></div>)}</div></div> : null}
      </article>})}</div>
      <footer><span><Check /> 所有内容仅在本地处理</span><button className="primary" onClick={onExport}><Download /> 导出高清 PDF</button></footer>
    </section>
  </div>
}

function App() {
  const history = useHistory([])
  const pages = history.value
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [activePageId, setActivePageId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [layoutMode, setLayoutMode] = useState('pages')
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [draggingPageId, setDraggingPageId] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [storageReady, setStorageReady] = useState(false)
  const [saved, setSaved] = useState(true)
  const fileInput = useRef(null)
  const activePageIndex = pages.findIndex(page => page.id === activePageId)
  const activePage = pages[activePageIndex]
  const pageLandscape = activePage?.landscape ?? settings.landscape
  const pageSize = useMemo(() => getPageSize({ ...settings, landscape: pageLandscape }), [settings, pageLandscape])
  const selected = activePage?.elements.find(element => element.id === selectedId)
  const dpi = useMemo(() => calculateDpi(selected), [selected])
  const estimate = useMemo(() => estimateMegabytes(pages), [pages])
  const imageCount = useMemo(() => pages.reduce((sum, page) => sum + page.elements.length, 0), [pages])

  useEffect(() => {
    let mounted = true
    loadProject().then(project => {
      if (!mounted) return
      if (project?.pages?.length && project.pages.every(page => Array.isArray(page.elements))) {
        const restoredPages = project.pages.map(page => ({
          ...page,
          landscape: typeof page.landscape === 'boolean'
            ? page.landscape
            : Boolean(page.elements[0] && page.elements[0].pixelWidth > page.elements[0].pixelHeight),
        }))
        history.replace(restoredPages)
        setSettings(project.settings || DEFAULT_SETTINGS)
        setActivePageId(restoredPages[0].id)
      }
      setStorageReady(true)
    }).catch(() => setStorageReady(true))
    return () => { mounted = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!storageReady) return
    setSaved(false)
    const timer = setTimeout(() => saveProject({ pages, settings, savedAt: Date.now() }).then(() => setSaved(true)).catch(() => setSaved(false)), 500)
    return () => clearTimeout(timer)
  }, [pages, settings, storageReady])

  useEffect(() => {
    if (!pages.length) { setActivePageId(null); setSelectedId(null); return }
    if (!pages.some(page => page.id === activePageId)) setActivePageId(pages[0].id)
  }, [pages, activePageId])

  const updateSelected = useCallback((patch, transient = false) => {
    if (!activePageId || !selectedId) return
    const updater = current => current.map(page => page.id !== activePageId ? page : { ...page, elements: page.elements.map(element => element.id !== selectedId ? element : { ...element, ...patch, placement: patch.placement || element.placement }) })
    if (transient) history.replace(updater(pages)); else history.commit(updater)
  }, [activePageId, selectedId, history, pages])

  useEffect(() => {
    const onKeyDown = event => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) history.redo(); else history.undo()
        return
      }
      if (!selected) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        history.commit(current => current.map(page => page.id !== activePageId ? page : { ...page, elements: page.elements.filter(element => element.id !== selectedId) }))
        setSelectedId(null)
        return
      }
      const delta = event.shiftKey ? 5 : 1
      const movement = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] }[event.key]
      if (movement) {
        event.preventDefault()
        updateSelected({ placement: { ...selected.placement, x: selected.placement.x + movement[0], y: selected.placement.y + movement[1] } })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [history, activePageId, selectedId, selected, updateSelected])

  async function readFiles(fileList) {
    const files = [...fileList].filter(file => IMAGE_TYPES.test(file.type))
    if (!files.length) throw new Error('请选择 JPG、PNG 或 WebP 图片')
    return Promise.all(files.map(async file => {
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(file)
      })
      const size = await getImageSize(dataUrl)
      const base = { id: uid(), name: file.name, dataUrl, pixelWidth: size.width, pixelHeight: size.height, type: file.type, rotation: 0 }
      return { ...base, placement: fitElement(base, pageSize, settings.margin, settings.fitMode) }
    }))
  }

  async function importFiles(fileList) {
    setBusy(true)
    try {
      const elements = await readFiles(fileList)
      if (layoutMode === 'pages') {
        const newPages = elements.map(element => {
          const landscape = element.pixelWidth > element.pixelHeight
          const imagePageSize = getPageSize({ ...settings, landscape })
          return { id: uid(), landscape, elements: [{ ...element, placement: fitElement(element, imagePageSize, settings.margin, settings.fitMode) }] }
        })
        history.commit(current => [...current, ...newPages])
        setActivePageId(newPages[0].id)
        setSelectedId(elements[0].id)
      } else if (layoutMode === 'grid') {
        const id = uid()
        const landscape = settings.landscape
        const newPageSize = getPageSize({ ...settings, landscape })
        const newPage = { id, landscape, elements: gridElements(elements, newPageSize, settings.margin) }
        history.commit(current => [...current, newPage])
        setActivePageId(id)
        setSelectedId(newPage.elements[0].id)
      } else {
        const pageId = activePageId || uid()
        const landscape = activePage?.landscape ?? (elements[0]?.pixelWidth > elements[0]?.pixelHeight)
        const freePageSize = getPageSize({ ...settings, landscape })
        const positioned = elements.map((element, index) => ({ ...element, placement: { ...element.placement, x: settings.margin + index * 6, y: settings.margin + index * 6 } }))
        const fitted = positioned.map(element => ({ ...element, placement: fitElement(element, freePageSize, settings.margin, settings.fitMode) }))
        history.commit(current => activePageId ? current.map(page => page.id === activePageId ? { ...page, elements: [...page.elements, ...fitted] } : page) : [...current, { id: pageId, landscape, elements: fitted }])
        setActivePageId(pageId)
        setSelectedId(positioned.at(-1).id)
      }
      setNotice(`已导入 ${elements.length} 张原图`)
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusy(false)
      setTimeout(() => setNotice(''), 2400)
    }
  }

  function changeLayout(mode) {
    setLayoutMode(mode)
    if (!pages.length || mode === 'free') return
    const allElements = pages.flatMap(page => page.elements)
    if (mode === 'pages') {
      const next = allElements.map(element => {
        const landscape = element.pixelWidth > element.pixelHeight
        const imagePageSize = getPageSize({ ...settings, landscape })
        return { id: uid(), landscape, elements: [{ ...element, placement: fitElement(element, imagePageSize, settings.margin, settings.fitMode) }] }
      })
      history.commit(next)
      setActivePageId(next[0]?.id)
    } else {
      const landscape = activePage?.landscape ?? settings.landscape
      const gridPageSize = getPageSize({ ...settings, landscape })
      const page = { id: uid(), landscape, elements: gridElements(allElements, gridPageSize, settings.margin) }
      history.commit([page])
      setActivePageId(page.id)
    }
  }

  function pointerDrag(event, element, kind, canvasWidth) {
    event.preventDefault()
    const startPages = pages
    const startX = event.clientX
    const startY = event.clientY
    const start = { ...element.placement }
    const scale = pageSize.width / canvasWidth
    const move = moveEvent => {
      const dx = (moveEvent.clientX - startX) * scale
      const dy = (moveEvent.clientY - startY) * scale
      if (kind === 'move') updateSelected({ placement: { ...start, x: start.x + dx, y: start.y + dy } }, true)
      else {
        const ratio = start.w / start.h
        const width = Math.max(8, start.w + dx)
        updateSelected({ placement: { ...start, w: width, h: width / ratio } }, true)
      }
    }
    const up = () => {
      history.checkpoint(startPages)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function alignElement(axis) {
    if (!selected) return
    updateSelected({ placement: { ...selected.placement, x: axis === 'horizontal' ? (pageSize.width - selected.placement.w) / 2 : selected.placement.x, y: axis === 'vertical' ? (pageSize.height - selected.placement.h) / 2 : selected.placement.y } })
  }

  function layerElement(direction) {
    history.commit(current => current.map(page => {
      if (page.id !== activePageId) return page
      const element = page.elements.find(item => item.id === selectedId)
      const rest = page.elements.filter(item => item.id !== selectedId)
      return { ...page, elements: direction === 'front' ? [...rest, element] : [element, ...rest] }
    }))
  }

  function movePage(from, to) {
    if (from < 0 || to < 0 || from === to) return
    history.commit(current => {
      const next = [...current]
      const [page] = next.splice(from, 1)
      next.splice(to, 0, page)
      return next
    })
  }

  function moveImage(pageId, from, to) {
    if (from < 0 || to < 0 || from === to) return
    history.commit(current => current.map(page => {
      if (page.id !== pageId) return page
      const placements = page.elements.map(element => element.placement)
      const reordered = [...page.elements]
      const [element] = reordered.splice(from, 1)
      reordered.splice(to, 0, element)
      return { ...page, elements: reordered.map((item, index) => ({ ...item, placement: placements[index] })) }
    }))
  }

  function applyFitMode(mode) {
    setSettings(current => ({ ...current, fitMode: mode }))
    if (selected) updateSelected({ placement: fitElement(selected, pageSize, settings.margin, mode) })
  }

  function applyAllFitMode(mode) {
    setSettings(current => ({ ...current, fitMode: mode }))
    history.commit(current => current.map(page => {
      const currentPageSize = getPageSize({ ...settings, landscape: page.landscape ?? settings.landscape })
      if (page.elements.length > 1) {
        return { ...page, elements: gridElements(page.elements, currentPageSize, settings.margin, mode) }
      }
      return { ...page, elements: page.elements.map(element => ({ ...element, placement: fitElement(element, currentPageSize, settings.margin, mode) })) }
    }))
    setNotice(mode === 'cover' ? '所有页面已铺满' : '所有页面已适应')
    setTimeout(() => setNotice(''), 2200)
  }

  function changePageOrientation(landscape) {
    if (!activePage) {
      setSettings(current => ({ ...current, landscape }))
      return
    }
    if (pageLandscape === landscape) return
    const nextPageSize = getPageSize({ ...settings, landscape })
    history.commit(current => current.map(page => {
      if (page.id !== activePageId) return page
      if (page.elements.length > 1) {
        return { ...page, landscape, elements: gridElements(page.elements, nextPageSize, settings.margin, settings.fitMode) }
      }
      return { ...page, landscape, elements: page.elements.map(element => ({ ...element, placement: fitElement(element, nextPageSize, settings.margin, settings.fitMode) })) }
    }))
  }

  function changePagePreset(pagePreset) {
    if (pagePreset === settings.pagePreset || !PAGE_PRESETS[pagePreset]) return
    const nextSettings = { ...settings, pagePreset }
    setSettings(nextSettings)
    if (pages.length) {
      history.commit(current => current.map(page => {
        const nextPageSize = getPageSize({ ...nextSettings, landscape: page.landscape ?? nextSettings.landscape })
        if (page.elements.length > 1) {
          return { ...page, elements: gridElements(page.elements, nextPageSize, nextSettings.margin, nextSettings.fitMode) }
        }
        return { ...page, elements: page.elements.map(element => ({ ...element, placement: fitElement(element, nextPageSize, nextSettings.margin, nextSettings.fitMode) })) }
      }))
    }
    setNotice(`页面尺寸已切换为 ${PAGE_PRESETS[pagePreset].label.split(' · ')[0]}`)
    setTimeout(() => setNotice(''), 2200)
  }

  async function exportPdf() {
    if (!pages.length) return
    setBusy(true)
    try {
      const { jsPDF } = await import('jspdf')
      const firstPageSize = getPageSize({ ...settings, landscape: pages[0].landscape ?? settings.landscape })
      const firstOrientation = firstPageSize.width > firstPageSize.height ? 'landscape' : 'portrait'
      const pdf = new jsPDF({ orientation: firstOrientation, unit: 'mm', format: [firstPageSize.width, firstPageSize.height], compress: false })
      pages.forEach((page, pageIndex) => {
        const currentPageSize = getPageSize({ ...settings, landscape: page.landscape ?? settings.landscape })
        const orientation = currentPageSize.width > currentPageSize.height ? 'landscape' : 'portrait'
        if (pageIndex) pdf.addPage([currentPageSize.width, currentPageSize.height], orientation)
        page.elements.forEach(element => {
          const format = element.type.includes('png') ? 'PNG' : element.type.includes('webp') ? 'WEBP' : 'JPEG'
          const placement = element.placement
          pdf.addImage(element.dataUrl, format, placement.x, placement.y, placement.w, placement.h, undefined, 'NONE', element.rotation || 0)
        })
      })
      pdf.save(`原页-${pages.length}页-${imageCount}张.pdf`)
      setPreviewOpen(false)
      setNotice('高清 PDF 已导出')
    } catch (error) {
      console.error(error)
      setNotice('导出失败，请检查图片格式或可用内存')
    } finally {
      setBusy(false)
      setTimeout(() => setNotice(''), 3000)
    }
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark" /><strong>原页</strong><span className="divider" /><span>图片转 PDF</span></div>
      <div className="header-actions"><span className={`save-state ${saved ? 'saved' : ''}`}><Save />{saved ? '已自动保存' : '正在保存'}</span><button className="icon-button" title="撤销 ⌘Z" disabled={!history.canUndo} onClick={history.undo}><Undo2 /></button><button className="icon-button" title="重做 ⇧⌘Z" disabled={!history.canRedo} onClick={history.redo}><Redo2 /></button><button className="preview-button header-preview-button" disabled={!pages.length} onClick={() => setPreviewOpen(true)}><Eye />导出总览</button><span className="divider" /><button className="help-button" title="快捷键：方向键微调，Shift 加速，Delete 删除"><HelpCircle /> 帮助</button></div>
    </header>
    <main className="workspace">
      <aside className="sidebar left-sidebar">
        <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={event => importFiles(event.target.files)} />
        <button className="primary import-button" onClick={() => fileInput.current?.click()} disabled={busy}><ImagePlus />{busy ? '处理中…' : '添加图片'}</button>
        <div className="layout-switch" aria-label="排版方式"><button className={layoutMode === 'pages' ? 'active' : ''} onClick={() => changeLayout('pages')} title="每张图片单独一页"><FileText />单图</button><button className={layoutMode === 'grid' ? 'active' : ''} onClick={() => changeLayout('grid')} title="所有图片自动排列到一页"><LayoutGrid />网格</button><button className={layoutMode === 'free' ? 'active' : ''} onClick={() => changeLayout('free')} title="继续添加到当前页面"><Move />自由</button></div>
        <div className="rail-caption"><GripVertical /> 拖拽调整页序</div>
        <div className="thumb-list">{pages.map((page, index) => <PageThumbnail key={page.id} page={page} index={index} active={page.id === activePageId} onSelect={() => { setActivePageId(page.id); setSelectedId(page.elements[0]?.id || null) }} onRemove={() => history.commit(current => current.filter(item => item.id !== page.id))} onDragStart={() => setDraggingPageId(page.id)} onDrop={() => { movePage(pages.findIndex(item => item.id === draggingPageId), index); setDraggingPageId(null) }} />)}{!pages.length ? <button className="empty-import" onClick={() => fileInput.current?.click()}><span className="empty-icon"><ImageIcon /></span><strong>导入你的图片</strong><small>支持 JPG、PNG、WebP<br />可一次选择多张</small></button> : null}</div>
      </aside>
      <EditorCanvas page={activePage} pageSize={pageSize} pageLandscape={pageLandscape} selectedId={selectedId} onSelect={setSelectedId} onPointerDrag={pointerDrag} zoom={zoom} onZoomChange={setZoom} onToggleOrientation={changePageOrientation} onDropFiles={event => { event.preventDefault(); if (event.dataTransfer.files.length) importFiles(event.dataTransfer.files) }} />
      <Inspector settings={settings} page={activePage} pageLandscape={pageLandscape} selected={selected} updateElement={updateSelected} alignElement={alignElement} layerElement={layerElement} applyFitMode={applyFitMode} applyAllFitMode={applyAllFitMode} changePagePreset={changePagePreset} changePageOrientation={changePageOrientation} dpi={dpi} />
    </main>
    <footer className="statusbar"><div><ImageIcon /><strong>{imageCount}</strong> 张图片 · <strong>{pages.length}</strong> 页 · 约 {estimate} MB</div><div className="pagination"><button disabled={activePageIndex <= 0} onClick={() => setActivePageId(pages[activePageIndex - 1]?.id)}><ArrowUp /></button><span>{pages.length ? activePageIndex + 1 : 0}</span><small>/ {pages.length}</small><button disabled={activePageIndex >= pages.length - 1} onClick={() => setActivePageId(pages[activePageIndex + 1]?.id)}><ArrowDown /></button></div></footer>
    {previewOpen ? <PreviewModal pages={pages} settings={settings} estimate={estimate} onClose={() => setPreviewOpen(false)} onExport={exportPdf} onMovePage={movePage} onMoveImage={moveImage} /> : null}
    {notice ? <div className="toast"><Check />{notice}<button onClick={() => setNotice('')}><X /></button></div> : null}
  </div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
