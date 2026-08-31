export const PAGE_PRESETS = {
  a3: { label: 'A3 · 297 × 420 mm', width: 297, height: 420, group: 'ISO 纸张' },
  a4: { label: 'A4 · 210 × 297 mm', width: 210, height: 297, group: 'ISO 纸张' },
  a5: { label: 'A5 · 148 × 210 mm', width: 148, height: 210, group: 'ISO 纸张' },
  b4: { label: 'B4 · 250 × 353 mm', width: 250, height: 353, group: 'ISO 纸张' },
  b5: { label: 'B5 · 176 × 250 mm', width: 176, height: 250, group: 'ISO 纸张' },
  letter: { label: 'Letter · 216 × 279 mm', width: 215.9, height: 279.4, group: '美制纸张' },
  legal: { label: 'Legal · 216 × 356 mm', width: 215.9, height: 355.6, group: '美制纸张' },
  photo4x6: { label: '照片 4 × 6 英寸', width: 101.6, height: 152.4, group: '照片与方形' },
  photo5x7: { label: '照片 5 × 7 英寸', width: 127, height: 177.8, group: '照片与方形' },
  square: { label: '方形 · 210 × 210 mm', width: 210, height: 210, group: '照片与方形' },
  screen16x9: { label: '16:9 / 9:16 · 320 × 180 mm', width: 180, height: 320, group: '屏幕比例' },
  screen4x3: { label: '4:3 / 3:4 · 280 × 210 mm', width: 210, height: 280, group: '屏幕比例' },
}

export const PAGE_PRESET_GROUPS = [...new Set(Object.values(PAGE_PRESETS).map(preset => preset.group))]

export const CROP_FOCUS_OPTIONS = {
  center: { label: '居中', x: 0.5, y: 0.5 },
  top: { label: '顶部', x: 0.5, y: 0 },
  bottom: { label: '底部', x: 0.5, y: 1 },
  left: { label: '左侧', x: 0, y: 0.5 },
  right: { label: '右侧', x: 1, y: 0.5 },
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export function getPageSize(settings) {
  const preset = PAGE_PRESETS[settings.pagePreset] || PAGE_PRESETS.a4
  return settings.landscape ? { width: preset.height, height: preset.width } : { width: preset.width, height: preset.height }
}

export function getImageSize(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = url
  })
}

export function fitInBox(element, box, mode = 'contain', focus = element.cropFocus || 'center') {
  const scale = mode === 'cover'
    ? Math.max(box.width / element.pixelWidth, box.height / element.pixelHeight)
    : Math.min(box.width / element.pixelWidth, box.height / element.pixelHeight)
  const width = element.pixelWidth * scale
  const height = element.pixelHeight * scale
  const anchor = mode === 'cover' ? CROP_FOCUS_OPTIONS[focus] || CROP_FOCUS_OPTIONS.center : CROP_FOCUS_OPTIONS.center
  return { x: box.x + (box.width - width) * anchor.x, y: box.y + (box.height - height) * anchor.y, w: width, h: height }
}

export function fitElement(element, pageSize, margin, mode = 'contain', focus = element.cropFocus || 'center') {
  if (mode === 'original') {
    const width = element.pixelWidth * 25.4 / 300
    const height = element.pixelHeight * 25.4 / 300
    const maxScale = Math.min(1, (pageSize.width - margin * 2) / width, (pageSize.height - margin * 2) / height)
    return { x: (pageSize.width - width * maxScale) / 2, y: (pageSize.height - height * maxScale) / 2, w: width * maxScale, h: height * maxScale }
  }
  return fitInBox(element, { x: margin, y: margin, width: pageSize.width - margin * 2, height: pageSize.height - margin * 2 }, mode, focus)
}

export function gridElements(elements, pageSize, margin, mode = 'contain') {
  if (!elements.length) return []
  const columns = Math.ceil(Math.sqrt(elements.length))
  const rows = Math.ceil(elements.length / columns)
  const gap = elements.length > 1 ? 5 : 0
  const cellWidth = (pageSize.width - margin * 2 - gap * (columns - 1)) / columns
  const cellHeight = (pageSize.height - margin * 2 - gap * (rows - 1)) / rows
  return elements.map((element, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    return { ...element, rotation: 0, placement: fitInBox(element, { x: margin + column * (cellWidth + gap), y: margin + row * (cellHeight + gap), width: cellWidth, height: cellHeight }, mode, element.cropFocus) }
  })
}

export function calculateDpi(element) {
  if (!element?.placement?.w || !element?.placement?.h) return 0
  return Math.round(Math.min(element.pixelWidth / (element.placement.w / 25.4), element.pixelHeight / (element.placement.h / 25.4)))
}

export function estimateMegabytes(pages) {
  const characters = pages.reduce((total, page) => total + page.elements.reduce((subtotal, element) => subtotal + (element.dataUrl?.length || 0), 0), 0)
  return Math.max(0.1, characters * 0.75 / 1024 / 1024).toFixed(1)
}

const DB_NAME = 'original-page-pdf-studio'
const STORE_NAME = 'projects'

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveProject(project) {
  const database = await openDatabase()
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(project, 'current')
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export async function loadProject() {
  const database = await openDatabase()
  const project = await new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get('current')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return project
}
