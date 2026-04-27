import { Controller } from "@hotwired/stimulus";
import * as THREE from "three";

const DRAG_ROTATION_SPEED = 0.01;
const MAX_VERTICAL_ROTATION = Math.PI / 2;
const VERTICAL_DRAG_THRESHOLD = 8;
const CUBE_SPACING = 0.96;
const AXIS_MOVE_DAMPING = 18;
const ORTHOGRAPHIC_VIEW_SIZE = 7;
const DEFAULT_CAMERA_DISTANCE = 10;
const MIN_CAMERA_ZOOM = 0.5;
const MAX_CAMERA_ZOOM = 1.45;
const ZOOM_SPEED = 0.0025;
const DEFAULT_MATRIX_COUNT = 3;
const SLICE_FOCUS_DELAY = 1700;
const SLICE_SWITCH_DELAY = 400;
const SLICE_CLEAR_DELAY = 700;
const NEIGHBOR_SLICE_OPACITY = 0.2;
const SECOND_NEIGHBOR_SLICE_OPACITY = 0.1;
const INVISIBLE_SLICE_OPACITY = 0;
const SLICE_OPACITY_DAMPING = 18;
const FOCUS_PIE_VISIBLE_DELAY = 700;

export default class extends Controller {
  static targets = ["canvas", "focusPie"];
  static values = {
    xCount: Number,
    yCount: Number,
    zCount: Number,
    axes: { type: Boolean, default: true }
  };

  connect() {
    this.dragging = false;
    this.pointerId = null;
    this.previousPointer = { x: 0, y: 0 };
    this.pendingVerticalDrag = 0;
    this.clock = new THREE.Clock();
    this.sliceFocusActive = false;
    this.activeSlice = null;
    this.hoveredSlice = null;
    this.pendingSlice = null;
    this.pendingSliceStartedAt = null;
    this.lastMatrixHoverEndedAt = null;
    this.focusPieProgress = 0;

    this.setupScene();
    this.setupEvents();
    this.setupThemeObserver();
    this.resize();
    this.animate();
  }

  disconnect() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();

    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerUp);
    this.element.removeEventListener("pointerleave", this.onPointerLeave);
    this.element.removeEventListener("wheel", this.onWheel);

    this.geometry?.dispose();
    this.whiteMaterial?.dispose();
    this.disposeWhiteCubeMaterials();
    this.limeMaterial?.dispose();
    this.yellowMaterial?.dispose();
    this.renderer?.dispose();
  }

  updateDimensions(xCount, yCount, zCount) {
    this.xCountValue = xCount;
    this.yCountValue = yCount;
    this.zCountValue = zCount;
    this.rebuildCubes();
    this.clearSliceFocus();
    this.camera.zoom = this.defaultCameraZoom();
    this.camera.updateProjectionMatrix();
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.updateCoordinateRanges();

    this.camera = new THREE.OrthographicCamera(
      -ORTHOGRAPHIC_VIEW_SIZE / 2,
      ORTHOGRAPHIC_VIEW_SIZE / 2,
      ORTHOGRAPHIC_VIEW_SIZE / 2,
      -ORTHOGRAPHIC_VIEW_SIZE / 2,
      0.1,
      100
    );
    this.camera.position.set(0, 0, DEFAULT_CAMERA_DISTANCE);
    this.camera.zoom = this.defaultCameraZoom();
    this.camera.updateProjectionMatrix();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasTarget,
      antialias: true,
      alpha: true
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.geometry = new THREE.BoxGeometry(0.72, 0.72, 0.72);
    this.whiteMaterial = new THREE.MeshStandardMaterial({ color: this.matrixCubeColor(), roughness: 0.42, metalness: 0.02, transparent: true });
    this.limeMaterial = new THREE.MeshStandardMaterial({ color: 0x40ff00, roughness: 0.44, metalness: 0.02 });
    this.yellowMaterial = new THREE.MeshStandardMaterial({ color: 0xffe100, roughness: 0.44, metalness: 0.02 });
    this.cube = new THREE.Group();

    this.cube.rotation.set(0.45, 0.55, 0);
    this.rebuildCubes(true);
    this.scene.add(this.cube);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.1));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(3, 4, 5);
    this.scene.add(keyLight);
  }

  rebuildCubes(immediate = false) {
    this.disposeWhiteCubeMaterials();
    this.cube.clear();
    this.updateCoordinateRanges();
    this.yAxisCubes = [];
    this.xAxisCubes = [];
    this.zAxisCubes = [];
    this.axisCubes = [];
    this.whiteCubes = [];
    this.whiteCubeMaterials = [];
    this.clearSliceFocus();

    this.addWhiteCubes();

    if (this.axesValue) {
      this.addAxisCubes();
      this.updateAxisPositions(immediate);
    }
  }

  updateCoordinateRanges() {
    this.xCoordinates = this.coordinateRange(this.countValue("x"));
    this.yCoordinates = this.coordinateRange(this.countValue("y"));
    this.zCoordinates = this.coordinateRange(this.countValue("z"));
  }

  addWhiteCubes() {
    this.xCoordinates.forEach((x) => {
      this.yCoordinates.forEach((y) => {
        this.zCoordinates.forEach((z) => {
          this.addWhiteCube(x, y, z);
        });
      });
    });
  }

  addWhiteCube(x, y, z) {
    const material = this.whiteMaterial.clone();
    const cubelet = this.addCube(material, x, y, z);

    material.transparent = true;
    material.opacity = 1;
    material.depthWrite = true;
    this.whiteCubeMaterials.push(material);
    this.whiteCubes.push(cubelet);
    cubelet.userData.matrixSlice = z;
    cubelet.userData.targetOpacity = 1;

    return cubelet;
  }

  addAxisCubes() {
    this.yCoordinates.forEach(() => {
      this.yAxisCubes.push(this.addAxisCube(this.limeMaterial, 0, 0, 0));
    });

    this.xCoordinates.forEach(() => {
      this.xAxisCubes.push(this.addAxisCube(this.yellowMaterial, 0, 0, 0));
    });

    this.zCoordinates.forEach(() => {
      this.zAxisCubes.push(this.addAxisCube(this.limeMaterial, 0, 0, 0));
    });
  }

  addCube(material, x, y, z) {
    const cubelet = new THREE.Mesh(this.geometry, material);

    this.positionCube(cubelet, x, y, z);
    this.cube.add(cubelet);

    return cubelet;
  }

  addAxisCube(material, x, y, z) {
    const cubelet = this.addCube(material, x, y, z);

    cubelet.userData.targetPosition = cubelet.position.clone();
    this.axisCubes.push(cubelet);

    return cubelet;
  }

  positionCube(cubelet, x, y, z) {
    cubelet.position.set(
      x * CUBE_SPACING,
      y * CUBE_SPACING,
      z * CUBE_SPACING
    );
  }

  updateAxisPositions(immediate = false) {
    if (!this.axesValue) return;

    const closestCorner = this.closestCorner();
    const yAxisCorner = this.leftmostVisibleVerticalCorner(closestCorner);
    const outsideX = this.outsideCoordinate("x");
    const outsideY = this.outsideCoordinate("y");
    const outsideZ = this.outsideCoordinate("z");

    this.yAxisCubes.forEach((cubelet, index) => {
      this.setAxisTarget(cubelet, yAxisCorner.x * outsideX, this.yCoordinates[index], yAxisCorner.z * outsideZ, immediate);
    });

    this.xAxisCubes.forEach((cubelet, index) => {
      this.setAxisTarget(cubelet, this.xCoordinates[index], -outsideY, closestCorner.z * outsideZ, immediate);
    });

    this.zAxisCubes.forEach((cubelet, index) => {
      this.setAxisTarget(cubelet, closestCorner.x * outsideX, -outsideY, this.zCoordinates[index], immediate);
    });
  }

  setAxisTarget(cubelet, x, y, z, immediate = false) {
    const targetPosition = cubelet.userData.targetPosition;

    targetPosition.set(
      x * CUBE_SPACING,
      y * CUBE_SPACING,
      z * CUBE_SPACING
    );

    if (immediate) cubelet.position.copy(targetPosition);
  }

  updateAnimatedAxisPositions(delta) {
    if (!this.axesValue) return;

    this.axisCubes.forEach((cubelet) => {
      cubelet.position.x = THREE.MathUtils.damp(cubelet.position.x, cubelet.userData.targetPosition.x, AXIS_MOVE_DAMPING, delta);
      cubelet.position.y = THREE.MathUtils.damp(cubelet.position.y, cubelet.userData.targetPosition.y, AXIS_MOVE_DAMPING, delta);
      cubelet.position.z = THREE.MathUtils.damp(cubelet.position.z, cubelet.userData.targetPosition.z, AXIS_MOVE_DAMPING, delta);
    });
  }

  disposeWhiteCubeMaterials() {
    this.whiteCubeMaterials?.forEach((material) => material.dispose());
  }

  closestCorner() {
    const rotationY = this.cube.rotation.y;
    const corners = this.outerCorners();

    return corners.reduce((closestCorner, corner) => {
      const visibleDepth = this.rotatedDepth(corner, rotationY);
      const currentDepth = this.rotatedDepth(closestCorner, rotationY);

      return visibleDepth > currentDepth ? corner : closestCorner;
    });
  }

  leftmostVisibleVerticalCorner(closestCorner) {
    const rotationY = this.cube.rotation.y;
    const farthestDepth = Math.min(
      ...this.outerCorners().map((corner) => this.rotatedDepth(corner, rotationY))
    );
    const visibleCorners = this.outerCorners().filter((corner) => {
      const sameAsClosest = corner.x === closestCorner.x && corner.z === closestCorner.z;

      return !sameAsClosest && this.rotatedDepth(corner, rotationY) > farthestDepth;
    });

    return visibleCorners.reduce((leftmostCorner, corner) => {
      const screenX = this.rotatedScreenX(corner, rotationY);
      const currentScreenX = this.rotatedScreenX(leftmostCorner, rotationY);

      return screenX < currentScreenX ? corner : leftmostCorner;
    });
  }

  outerCorners() {
    return [
      { x: -1, z: 1 },
      { x: 1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: -1 }
    ];
  }

  rotatedDepth(corner, rotationY) {
    return -corner.x * Math.sin(rotationY) + corner.z * Math.cos(rotationY);
  }

  rotatedScreenX(corner, rotationY) {
    return corner.x * Math.cos(rotationY) + corner.z * Math.sin(rotationY);
  }

  coordinateRange(count) {
    const centerOffset = (count - 1) / 2;

    return Array.from({ length: count }, (_value, index) => index - centerOffset);
  }

  countValue(axis) {
    const value = this[`${axis}CountValue`];

    return Number.isInteger(value) && value > 0 ? value : DEFAULT_MATRIX_COUNT;
  }

  outsideCoordinate(axis) {
    const coordinates = this[`${axis}Coordinates`];
    const furthestCoordinate = Math.max(...coordinates.map((coordinate) => Math.abs(coordinate)));

    return furthestCoordinate + 1;
  }

  defaultCameraZoom() {
    const furthestCoordinate = Math.max(
      this.outsideCoordinate("x"),
      this.outsideCoordinate("y"),
      this.outsideCoordinate("z")
    );
    const objectRadius = furthestCoordinate * CUBE_SPACING + 0.4;
    const fittedZoom = ORTHOGRAPHIC_VIEW_SIZE / (objectRadius * 2.2);

    return THREE.MathUtils.clamp(fittedZoom, MIN_CAMERA_ZOOM, 1);
  }

  setupEvents() {
    this.onPointerDown = (event) => {
      this.dragging = true;
      this.pointerId = event.pointerId;
      this.previousPointer = { x: event.clientX, y: event.clientY };
      this.pendingVerticalDrag = 0;
      this.resetSliceHoverTimers();
      this.element.classList.add("is-dragging");
      this.element.setPointerCapture(event.pointerId);
    };

    this.onPointerMove = (event) => {
      if (!this.dragging) {
        this.updateHoveredMatrixSlice(event);
        return;
      }

      if (event.pointerId !== this.pointerId) return;

      const deltaX = event.clientX - this.previousPointer.x;
      const deltaY = event.clientY - this.previousPointer.y;

      this.cube.rotation.y += deltaX * DRAG_ROTATION_SPEED;
      this.updateAxisPositions();
      this.applyVerticalDrag(deltaY);
      this.previousPointer = { x: event.clientX, y: event.clientY };
    };

    this.onPointerUp = (event) => {
      if (event.pointerId !== this.pointerId) return;

      this.dragging = false;
      this.pointerId = null;
      this.element.classList.remove("is-dragging");
      this.updateHoveredMatrixSlice(event);

      if (this.element.hasPointerCapture(event.pointerId)) {
        this.element.releasePointerCapture(event.pointerId);
      }
    };

    this.onPointerLeave = () => {
      if (!this.dragging) this.markMatrixHoverEnded();
    };

    this.onWheel = (event) => {
      event.preventDefault();
      this.zoom(event.deltaY);
    };

    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerUp);
    this.element.addEventListener("pointercancel", this.onPointerUp);
    this.element.addEventListener("pointerleave", this.onPointerLeave);
    this.element.addEventListener("wheel", this.onWheel, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.element);
  }

  setupThemeObserver() {
    this.themeObserver = new MutationObserver(() => this.syncTheme());
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    this.syncTheme();
  }

  syncTheme() {
    this.whiteMaterial?.color.set(this.matrixCubeColor());
    this.whiteCubeMaterials?.forEach((material) => material.color.set(this.matrixCubeColor()));
  }

  matrixCubeColor() {
    return getComputedStyle(document.body).getPropertyValue("--matrix-cube-color").trim() || "#d8d8d8";
  }

  updateHoveredMatrixSlice(event) {
    if (!this.sliceFocusAllowed()) return;

    const hit = this.matrixCubeHit(event);

    if (!hit) {
      this.markMatrixHoverEnded();
      return;
    }

    const slice = hit.object.userData.matrixSlice;
    this.hoveredSlice = slice;
    this.lastMatrixHoverEndedAt = null;

    if (this.sliceFocusActive && this.activeSlice === slice) {
      this.pendingSlice = null;
      this.pendingSliceStartedAt = null;
      return;
    }

    if (this.pendingSlice !== slice) {
      this.pendingSlice = slice;
      this.pendingSliceStartedAt = performance.now();
    }
  }

  matrixCubeHit(event) {
    if (!this.whiteCubes?.length) return null;

    const bounds = this.canvasTarget.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.cube.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    return this.raycaster.intersectObjects(this.whiteCubes, false)[0] || null;
  }

  markMatrixHoverEnded() {
    this.hoveredSlice = null;
    this.pendingSlice = null;
    this.pendingSliceStartedAt = null;

    if (this.sliceFocusActive && !this.lastMatrixHoverEndedAt) {
      this.lastMatrixHoverEndedAt = performance.now();
    }
  }

  resetSliceHoverTimers() {
    this.pendingSlice = null;
    this.pendingSliceStartedAt = null;
    this.lastMatrixHoverEndedAt = null;
    this.setFocusPieProgress(0);
  }

  updateSliceFocus() {
    if (!this.sliceFocusAllowed()) {
      this.clearSliceFocus();
      return;
    }

    if (this.dragging) return;

    const now = performance.now();

    if (!this.sliceFocusActive) {
      if (this.hoveredSlice === null || this.pendingSlice === null) return;
      if (now - this.pendingSliceStartedAt >= SLICE_FOCUS_DELAY) this.enableSliceFocus(this.pendingSlice);
      return;
    }

    if (this.hoveredSlice === null) {
      if (this.lastMatrixHoverEndedAt && now - this.lastMatrixHoverEndedAt >= SLICE_CLEAR_DELAY) {
        this.clearSliceFocus();
      }
      return;
    }

    if (this.hoveredSlice !== this.activeSlice && this.pendingSlice === this.hoveredSlice && now - this.pendingSliceStartedAt >= SLICE_SWITCH_DELAY) {
      this.enableSliceFocus(this.pendingSlice);
    }
  }

  updateFocusPieProgress() {
    if (!this.hasFocusPieTarget) return;

    if (!this.sliceFocusAllowed() || this.dragging || this.sliceFocusActive || this.hoveredSlice === null || this.pendingSlice === null || !this.pendingSliceStartedAt) {
      this.setFocusPieProgress(0);
      return;
    }

    const elapsed = performance.now() - this.pendingSliceStartedAt;

    if (elapsed < FOCUS_PIE_VISIBLE_DELAY) {
      this.setFocusPieProgress(0);
      return;
    }

    const progress = (elapsed - FOCUS_PIE_VISIBLE_DELAY) / (SLICE_FOCUS_DELAY - FOCUS_PIE_VISIBLE_DELAY);
    this.setFocusPieProgress(THREE.MathUtils.clamp(progress, 0, 1));
  }

  setFocusPieProgress(progress) {
    if (!this.hasFocusPieTarget || this.focusPieProgress === progress) return;

    this.focusPieProgress = progress;
    this.focusPieTarget.style.setProperty("--matrix-focus-progress", `${progress * 100}%`);
    this.focusPieTarget.classList.toggle("is-visible", progress > 0);
  }

  enableSliceFocus(slice) {
    this.sliceFocusActive = true;
    this.activeSlice = slice;
    this.pendingSlice = null;
    this.pendingSliceStartedAt = null;
    this.lastMatrixHoverEndedAt = null;
    this.applySliceOpacity();
  }

  clearSliceFocus() {
    this.sliceFocusActive = false;
    this.activeSlice = null;
    this.pendingSlice = null;
    this.pendingSliceStartedAt = null;
    this.lastMatrixHoverEndedAt = null;
    this.applySliceOpacity();
  }

  applySliceOpacity() {
    this.whiteCubes?.forEach((cubelet) => {
      cubelet.userData.targetOpacity = this.targetOpacityForCube(cubelet);
    });
  }

  sliceFocusAllowed() {
    return this.countValue("x") > 2 && this.countValue("y") > 2 && this.countValue("z") > 2;
  }

  targetOpacityForCube(cubelet) {
    if (!this.sliceFocusActive) return 1;

    const distance = Math.abs(cubelet.userData.matrixSlice - this.activeSlice);

    if (distance === 0) return 1;
    if (distance === 1) return NEIGHBOR_SLICE_OPACITY;
    if (distance === 2) return SECOND_NEIGHBOR_SLICE_OPACITY;

    return INVISIBLE_SLICE_OPACITY;
  }

  updateSliceOpacity(delta) {
    this.whiteCubes?.forEach((cubelet) => {
      const targetOpacity = cubelet.userData.targetOpacity ?? 1;

      cubelet.material.opacity = THREE.MathUtils.damp(cubelet.material.opacity, targetOpacity, SLICE_OPACITY_DAMPING, delta);
      cubelet.material.depthWrite = cubelet.material.opacity > 0.92;
    });
  }

  applyVerticalDrag(deltaY) {
    this.pendingVerticalDrag += deltaY;

    if (Math.abs(this.pendingVerticalDrag) < VERTICAL_DRAG_THRESHOLD) return;

    const activeDrag = this.pendingVerticalDrag - Math.sign(this.pendingVerticalDrag) * VERTICAL_DRAG_THRESHOLD;
    const nextRotation = this.cube.rotation.x + activeDrag * DRAG_ROTATION_SPEED;

    this.cube.rotation.x = THREE.MathUtils.clamp(
      nextRotation,
      -MAX_VERTICAL_ROTATION,
      MAX_VERTICAL_ROTATION
    );
    this.pendingVerticalDrag = Math.sign(this.pendingVerticalDrag) * VERTICAL_DRAG_THRESHOLD;
  }

  zoom(deltaY) {
    this.camera.zoom = THREE.MathUtils.clamp(
      this.camera.zoom - deltaY * ZOOM_SPEED,
      MIN_CAMERA_ZOOM,
      MAX_CAMERA_ZOOM
    );
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const { width, height } = this.element.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));

    this.renderer.setSize(nextWidth, nextHeight, false);
    const aspect = nextWidth / nextHeight;

    this.camera.left = -ORTHOGRAPHIC_VIEW_SIZE * aspect / 2;
    this.camera.right = ORTHOGRAPHIC_VIEW_SIZE * aspect / 2;
    this.camera.top = ORTHOGRAPHIC_VIEW_SIZE / 2;
    this.camera.bottom = -ORTHOGRAPHIC_VIEW_SIZE / 2;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    const delta = this.clock.getDelta();

    this.updateSliceFocus();
    this.updateFocusPieProgress();
    this.updateSliceOpacity(delta);
    this.updateAnimatedAxisPositions(delta);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }
}
