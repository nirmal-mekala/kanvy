// Long edge, in pixels, an image is downsized to before it's base64-encoded
// and stored — keeps the JSON (and localStorage) reasonable for anything
// pasted/dropped straight from a screenshot or camera roll.
export const MAX_IMAGE_DIMENSION = 1200

// Reads a File, downsizing it through a canvas if it's larger than
// MAX_IMAGE_DIMENSION on its long edge. Resolves { dataUri, width, height }
// — width/height are the *final* (possibly downsized) pixel dimensions.
export function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode image'))
      img.onload = () => {
        const { naturalWidth: width, naturalHeight: height } = img
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height))
        if (scale >= 1) {
          // Already small enough — keep the original bytes as-is rather
          // than re-encoding (and possibly losing quality) for no reason.
          resolve({ dataUri: reader.result, width, height })
          return
        }
        const outW = Math.max(1, Math.round(width * scale))
        const outH = Math.max(1, Math.round(height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = outW
        canvas.height = outH
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, outW, outH)
        const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
        resolve({ dataUri: canvas.toDataURL(mime, mime === 'image/jpeg' ? 0.9 : undefined), width: outW, height: outH })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// The first image file in a paste event's clipboard data, if any.
export function getImageFileFromClipboard(clipboardData) {
  if (!clipboardData) return null
  for (const item of clipboardData.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }
  return null
}

// Every image file in a drop event's dataTransfer.
export function getImageFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer?.files) return []
  return [...dataTransfer.files].filter((f) => f.type.startsWith('image/'))
}

// Whether a drag carries files at all — checkable during dragover (unlike
// file type/content, which isn't readable until drop), just enough to
// decide whether to preventDefault and allow the drop.
export function dataTransferHasFiles(dataTransfer) {
  return !!dataTransfer && Array.from(dataTransfer.types ?? []).includes('Files')
}
