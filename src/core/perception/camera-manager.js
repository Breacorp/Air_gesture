/**
 * CameraManager - Multimodal Multi-Camera Ingestion Manager
 * 
 * Manages physical & logical camera sources:
 * - Front camera (user facing, body, face, head pose, aerial hands)
 * - Desk View camera (Continuity Camera Desk View / overhead / table)
 * - Multi-camera simultaneous streams & device discovery
 */

import { CameraSource } from './camera-source.js';

export class CameraManager {
  constructor() {
    this.sources = new Map(); // id -> CameraSource
    this.activeRoleIds = {
      front: null,
      desk: null,
      secondary: null
    };

    this.onDevicesChangedCallback = null;
    this.isSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
  }

  /**
   * Discovers and enumerates all available video input devices
   * Detects desk view cameras based on system labels
   * @returns {Promise<Array<{deviceId: string, label: string, isDeskView: boolean, isContinuity: boolean}>>}
   */
  async enumerateDevices() {
    if (!this.isSupported || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');

      return videoInputs.map(device => {
        const labelLower = (device.label || '').toLowerCase();
        const isDeskView = labelLower.includes('desk') || 
                           labelLower.includes('escritorio') || 
                           labelLower.includes('overhead') ||
                           labelLower.includes('cenital');
        const isContinuity = labelLower.includes('iphone') || 
                             labelLower.includes('continuity') || 
                             labelLower.includes('continuidad');

        return {
          deviceId: device.deviceId,
          label: device.label || `Cámara ${device.deviceId.slice(0, 8)}`,
          groupId: device.groupId,
          isDeskView,
          isContinuity
        };
      });
    } catch (err) {
      console.warn('[CameraManager] Device enumeration failed:', err);
      return [];
    }
  }

  /**
   * Starts a camera source with the given configuration
   * @param {Object} options
   * @param {'front'|'desk'|'secondary'} [options.role='front']
   * @param {string} [options.deviceId]
   * @param {HTMLVideoElement} options.videoElement
   * @param {Object} [options.customConstraints]
   * @returns {Promise<CameraSource>}
   */
  async startCamera(options = {}) {
    const role = options.role || 'front';
    const sourceId = `cam-${role}`;

    // Stop existing camera for this role if running
    if (this.sources.has(sourceId)) {
      this.stopCamera(sourceId);
    }

    const constraints = {
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 60, min: 30 },
        ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
        ...(role === 'front' && !options.deviceId ? { facingMode: 'user' } : {}),
        ...(role === 'desk' && !options.deviceId ? { facingMode: 'environment' } : {}),
        ...(options.customConstraints || {})
      },
      audio: false
    };

    let stream = null;
    if (this.isSupported && navigator.mediaDevices.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // Fallback without deviceId / facingMode constraints if initial request fails
        console.warn(`[CameraManager] Specialized constraint failed for ${role}, retrying generic:`, err);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      }
    }

    const videoEl = options.videoElement;
    if (videoEl && stream) {
      videoEl.srcObject = stream;
      await new Promise((resolve) => {
        const onReady = () => {
          videoEl.removeEventListener('loadedmetadata', onReady);
          videoEl.removeEventListener('loadeddata', onReady);
          videoEl.removeEventListener('canplay', onReady);
          videoEl.play().catch(e => console.warn('[CameraManager] play() error:', e)).finally(() => resolve());
        };

        if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
          videoEl.play().catch(() => {}).finally(() => resolve());
          return;
        }

        videoEl.addEventListener('loadedmetadata', onReady, { once: true });
        videoEl.addEventListener('loadeddata', onReady, { once: true });
        videoEl.addEventListener('canplay', onReady, { once: true });

        // Safety fallback timeout
        setTimeout(() => {
          onReady();
        }, 3000);
      });
    }

    const source = new CameraSource({
      id: sourceId,
      name: options.name || (role === 'desk' ? 'Desk View Camera' : 'FaceTime Camera'),
      role,
      videoElement: videoEl,
      stream,
      calibration: options.calibration
    });

    source.isActive = true;
    source.updateResolution();

    this.sources.set(sourceId, source);
    this.activeRoleIds[role] = sourceId;

    return source;
  }

  /**
   * Starts simultaneous dual-camera mode (Front Camera + Desk View Camera)
   * @param {Object} config
   * @param {HTMLVideoElement} config.frontVideo
   * @param {HTMLVideoElement} config.deskVideo
   * @param {string} [config.frontDeviceId]
   * @param {string} [config.deskDeviceId]
   * @returns {Promise<{frontSource: CameraSource, deskSource: CameraSource}>}
   */
  async startDualCamera(config = {}) {
    const frontSource = await this.startCamera({
      role: 'front',
      videoElement: config.frontVideo,
      deviceId: config.frontDeviceId
    });

    const deskSource = await this.startCamera({
      role: 'desk',
      videoElement: config.deskVideo,
      deviceId: config.deskDeviceId
    });

    return { frontSource, deskSource };
  }

  /**
   * Retrieves active CameraSource by role ('front', 'desk') or ID
   * @param {'front'|'desk'|'secondary'|string} roleOrId
   * @returns {CameraSource|null}
   */
  getSource(roleOrId) {
    if (this.sources.has(roleOrId)) {
      return this.sources.get(roleOrId);
    }
    const roleId = this.activeRoleIds[roleOrId];
    return roleId ? (this.sources.get(roleId) || null) : null;
  }

  /**
   * Returns list of all active sources
   * @returns {CameraSource[]}
   */
  getActiveSources() {
    return Array.from(this.sources.values()).filter(s => s.isActive);
  }

  /**
   * Stops a specific camera
   * @param {string} sourceId
   */
  stopCamera(sourceId) {
    const source = this.sources.get(sourceId);
    if (source) {
      source.stop();
      this.sources.delete(sourceId);
      for (const [role, id] of Object.entries(this.activeRoleIds)) {
        if (id === sourceId) {
          this.activeRoleIds[role] = null;
        }
      }
    }
  }

  /**
   * Stops all active camera streams
   */
  stopAll() {
    for (const source of this.sources.values()) {
      source.stop();
    }
    this.sources.clear();
    this.activeRoleIds = { front: null, desk: null, secondary: null };
  }
}
