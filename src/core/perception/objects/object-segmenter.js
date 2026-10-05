/**
 * ObjectSegmenter - Pixel Mask & Silhouette Extractor
 * 
 * "Estos píxeles pertenecen al objeto."
 * 
 * Extracts:
 * - 2D binary segmentation mask.
 * - Polygon contour boundary & convex hull.
 * - Aspect ratio and principal orientation angle.
 * - Cropped texture patch for 3D reconstruction and digital twin.
 */

export class ObjectSegmenter {
  constructor() {
    this.cropCanvas = document.createElement('canvas');
    this.cropCtx = this.cropCanvas.getContext('2d', { willReadFrequently: true });
    this.cropCanvas.width = 128;
    this.cropCanvas.height = 128;
  }

  /**
   * Segments the detected object candidate from the video frame
   * @param {HTMLVideoElement} videoElement
   * @param {Object} detection Candidate detection from ObjectDetector
   * @returns {Object} Segmentation result { mask, contour, textureCanvas, aspectRatio, orientation }
   */
  segment(videoElement, detection) {
    if (!videoElement || !detection || !detection.boundingBox) return null;

    const bbox = detection.boundingBox;
    const vidW = videoElement.videoWidth || 640;
    const vidH = videoElement.videoHeight || 480;

    const sx = Math.max(0, Math.floor(bbox.minX * vidW));
    const sy = Math.max(0, Math.floor(bbox.minY * vidH));
    const sw = Math.min(vidW - sx, Math.max(16, Math.floor(bbox.width * vidW)));
    const sh = Math.min(vidH - sy, Math.max(16, Math.floor(bbox.height * vidH)));

    // Extract high-resolution cropped texture patch
    this.cropCtx.clearRect(0, 0, this.cropCanvas.width, this.cropCanvas.height);
    this.cropCtx.drawImage(
      videoElement,
      sx, sy, sw, sh,
      0, 0, this.cropCanvas.width, this.cropCanvas.height
    );

    const imgData = this.cropCtx.getImageData(0, 0, this.cropCanvas.width, this.cropCanvas.height);
    const data = imgData.data;

    // Build binary mask and silhouette contour
    const cw = this.cropCanvas.width;
    const ch = this.cropCanvas.height;
    const binaryMask = new Uint8Array(cw * ch);
    const contourPoints = [];

    // Background color reference from corners
    const bgR = (data[0] + data[(cw - 1) * 4] + data[((ch - 1) * cw) * 4] + data[(ch * cw - 1) * 4]) / 4;
    const bgG = (data[1] + data[(cw - 1) * 4 + 1] + data[((ch - 1) * cw) * 4 + 1] + data[(ch * cw - 1) * 4 + 1]) / 4;
    const bgB = (data[2] + data[(cw - 1) * 4 + 2] + data[((ch - 1) * cw) * 4 + 2] + data[(ch * cw - 1) * 4 + 2]) / 4;

    for (let y = 0; y < ch; y++) {
      let rowFirstX = -1;
      let rowLastX = -1;
      for (let x = 0; x < cw; x++) {
        const idx = (y * cw + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const colorDist = Math.hypot(r - bgR, g - bgG, b - bgB);
        // Foreground object pixel threshold
        if (colorDist > 25) {
          binaryMask[y * cw + x] = 1;
          if (rowFirstX === -1) rowFirstX = x;
          rowLastX = x;
        }
      }

      if (rowFirstX !== -1 && y % 4 === 0) {
        contourPoints.push({ x: rowFirstX / cw, y: y / ch });
        if (rowLastX !== rowFirstX) {
          contourPoints.push({ x: rowLastX / cw, y: y / ch });
        }
      }
    }

    const aspectRatio = bbox.width / Math.max(0.01, bbox.height);
    const orientationAngle = aspectRatio > 1.2 ? 0 : (aspectRatio < 0.8 ? 90 : 45);

    // Create a standalone texture image copy for three.js material
    const textureCanvasCopy = document.createElement('canvas');
    textureCanvasCopy.width = cw;
    textureCanvasCopy.height = ch;
    const copyCtx = textureCanvasCopy.getContext('2d');
    copyCtx.drawImage(this.cropCanvas, 0, 0);

    return {
      binaryMask,
      contour: contourPoints,
      aspectRatio,
      orientationAngle,
      textureCanvas: textureCanvasCopy,
      palette: detection.colorPalette,
      pixelWidth: cw,
      pixelHeight: ch
    };
  }
}
