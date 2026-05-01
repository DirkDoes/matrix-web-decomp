import { Controller } from "@hotwired/stimulus";
import * as THREE from "three";

const DRAG_ROTATION_SPEED = 0.01;
const MAX_VERTICAL_ROTATION = Math.PI / 2;
const VERTICAL_DRAG_THRESHOLD = 8;
const CUBE_SPACING = 0.96;
const AXIS_MOVE_DAMPING = 18;
const ORTHOGRAPHIC_VIEW_SIZE = 7;
const DEFAULT_CAMERA_DISTANCE = 10;
const CAMERA_CLIP_MARGIN = 10;
const MIN_CAMERA_ZOOM = 0.09;
const MAX_CAMERA_ZOOM = 1.45;
const ZOOM_SPEED = 0.00125;
const DEFAULT_VIEW_FIT_PADDING = 1.45;
const FOCUSED_VIEW_MAX_ZOOM = 0.72;
const DEFAULT_TENSOR_COUNT = 3;
const BUTTON_OPACITY_DAMPING = 9;
const BUTTON_VISIBLE_DELAY = 1000;
const BUTTON_HIDDEN_DELAY = 1000;
const CLICK_DRAG_THRESHOLD = 6;
const RESET_VIEW_DAMPING = 8;
const BUTTON_SIZE = 0.46;
const CUBE_SIZE = 0.72;
const BUTTON_SIDE_OFFSET = 0.82;
const BUTTON_WALL_GAP = 0.26;
const BUTTON_WALL_OFFSET = (CUBE_SIZE / 2 + BUTTON_SIZE / 2 + BUTTON_WALL_GAP) / CUBE_SPACING;
const BUTTON_BACK_EDGE_OFFSET = CUBE_SIZE / 2 / CUBE_SPACING;
const BUTTON_HALF_OFFSET = BUTTON_SIZE / 2 / CUBE_SPACING;
const BUTTON_GAP_OFFSET = BUTTON_WALL_GAP / CUBE_SPACING;
const EYE_ICON_PATH = "/icons/eye-solid-full.svg";
const EYE_SLASH_ICON_PATH = "/icons/eye-slash-solid-full.svg";
const TENSOR_AXES = ["x", "y", "z"];
const TENSOR_VALUE_COLORS = {
  "-1": "#00346b",
  0: null,
  1: "#ff9500"
};
const TENSOR_VALUE_KEYS = ["-1", "0", "1"];
const SELECTED_TENSOR_CUBE_COLOR = 0xffe600;
const DEFAULT_CUBE_ROTATION = { x: 0.45, y: 0.55, z: 0 };

export default class extends Controller {
  static targets = ["canvas"];
  static values = {
    xCount: Number,
    yCount: Number,
    zCount: Number,
    tensor: Array,
    editable: { type: Boolean, default: false },
    axes: { type: Boolean, default: true },
    interactive: { type: Boolean, default: true },
    focusSelector: String,
    resetAlways: { type: Boolean, default: false }
  };

  connect() {
    this.dragging = false;
    this.dragMode = null;
    this.pointerId = null;
    this.previousPointer = { x: 0, y: 0 };
    this.pendingVerticalDrag = 0;
    this.clock = new THREE.Clock();
    this.pointerInside = false;
    this.pointerEnteredAt = null;
    this.pointerLeftAt = null;
    this.selectedTensorCubes = new Set();
    this.selectedTensorOutlines = new Map();
    this.pendingTensorCube = null;
    this.pointerStart = null;
    this.pendingTensorCubeAdditive = false;
    this.viewChanged = false;
    this.resetViewTarget = null;
    this.currentTensor = this.normalizedTensor(this.tensorValue);

    this.setupScene();
    if (this.interactiveValue) {
      this.createResetViewButton();
      this.setupEvents();
    }
    this.setupResizeObserver();
    this.setupThemeObserver();
    this.resize();
    this.animate();
  }

  disconnect() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();

    if (this.interactiveValue) {
      this.element.removeEventListener("pointerdown", this.onPointerDown);
      this.element.removeEventListener("pointermove", this.onPointerMove);
      this.element.removeEventListener("pointerup", this.onPointerUp);
      this.element.removeEventListener("pointercancel", this.onPointerCancel);
      this.element.removeEventListener("pointerenter", this.onPointerEnter);
      this.element.removeEventListener("pointerleave", this.onPointerLeave);
      this.element.removeEventListener("wheel", this.onWheel);
      this.element.removeEventListener("contextmenu", this.onContextMenu);
      window.removeEventListener("scroll", this.onWindowScroll);
    }
    this.resetViewButton?.removeEventListener("pointerdown", this.stopResetButtonPointerDown);
    this.resetViewButton?.removeEventListener("click", this.onResetViewClick);
    this.resetViewButton?.remove();
    this.colorPopup?.remove();

    this.geometry?.dispose();
    this.whiteMaterial?.dispose();
    this.disposeWhiteCubeInstances();
    this.disposeButtonMaterials();
    this.buttonGeometry?.dispose();
    this.selectedOutlineGeometry?.dispose();
    this.selectedOutlineMaterial?.dispose();
    this.orangeMaterial?.dispose();
    this.blueMaterial?.dispose();
    this.limeMaterial?.dispose();
    this.yellowMaterial?.dispose();
    this.renderer?.dispose();
    this.disposeIconTextures();
  }

  updateDimensions(xCount, yCount, zCount) {
    this.xCountValue = xCount;
    this.yCountValue = yCount;
    this.zCountValue = zCount;
    this.currentTensor = this.blankTensor(xCount, yCount, zCount);
    this.rebuildCubes();
    this.camera.zoom = this.defaultCameraZoom();
    this.resetCameraPosition({ immediate: true });
    this.camera.updateProjectionMatrix();
  }

  updateTensor(tensor) {
    this.currentTensor = this.normalizedTensor(tensor);
    this.syncTensorCubeColors();
    this.renderOnce();
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
      1000
    );
    this.syncCameraClipping();
    this.camera.position.copy(this.defaultCameraPosition());
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
    this.buttonGeometry = new THREE.PlaneGeometry(BUTTON_SIZE, BUTTON_SIZE);
    this.selectedOutlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.8, 0.8, 0.8));
    this.selectedOutlineMaterial = new THREE.LineBasicMaterial({ color: SELECTED_TENSOR_CUBE_COLOR, transparent: true, opacity: 0.95 });
    this.textureLoader = new THREE.TextureLoader();
    this.instanceTransform = new THREE.Object3D();
    this.iconTextureColor = null;
    this.updateIconTextures();
    this.whiteMaterial = new THREE.MeshStandardMaterial({ color: this.tensorCubeColor(), roughness: 0.42, metalness: 0.02 });
    this.orangeMaterial = new THREE.MeshStandardMaterial({ color: TENSOR_VALUE_COLORS[1], roughness: 0.42, metalness: 0.02 });
    this.blueMaterial = new THREE.MeshStandardMaterial({ color: TENSOR_VALUE_COLORS["-1"], roughness: 0.42, metalness: 0.02 });
    this.limeMaterial = new THREE.MeshStandardMaterial({ color: 0x40ff00, roughness: 0.44, metalness: 0.02 });
    this.yellowMaterial = new THREE.MeshStandardMaterial({ color: 0xffe100, roughness: 0.44, metalness: 0.02 });
    this.cube = new THREE.Group();

    this.cube.rotation.set(DEFAULT_CUBE_ROTATION.x, DEFAULT_CUBE_ROTATION.y, DEFAULT_CUBE_ROTATION.z);
    this.rebuildCubes(true);
    this.scene.add(this.cube);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.1));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(3, 4, 5);
    this.scene.add(keyLight);
  }

  createResetViewButton() {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "btn btn-secondary tensor-view-reset-button";
    button.setAttribute("aria-label", "Center tensor view");
    button.textContent = "Center";

    this.stopResetButtonPointerDown = (event) => event.stopPropagation();
    this.onResetViewClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.resetCameraPosition();
      this.renderOnce();
    };

    button.addEventListener("pointerdown", this.stopResetButtonPointerDown);
    button.addEventListener("click", this.onResetViewClick);
    this.element.append(button);
    this.resetViewButton = button;
    this.syncResetViewButton();
  }

  rebuildCubes(immediate = false) {
    this.disposeWhiteCubeInstances();
    this.disposeButtonMaterials();
    this.cube.clear();
    this.updateCoordinateRanges();
    this.resetSliceVisibility();
    this.yAxisCubes = [];
    this.xAxisCubes = [];
    this.zAxisCubes = [];
    this.axisCubes = [];
    this.whiteCubes = [];
    this.whiteCubeByDrawId = this.emptyTensorDrawMap();
    this.visibilityButtons = [];
    this.visibilityButtonMaterials = [];
    this.clearTensorSelection();

    this.addWhiteCubes();
    if (this.interactiveValue) {
      this.addVisibilityButtons();
    }

    if (this.axesValue) {
      this.addAxisCubes();
      this.updateAxisPositions(immediate);
    }

    this.updateVisibilityButtonPositions(immediate);
    this.applyTensorVisibility();
  }

  updateCoordinateRanges() {
    this.xCoordinates = this.coordinateRange(this.countValue("x"));
    this.yCoordinates = this.coordinateRange(this.countValue("y"));
    this.zCoordinates = this.coordinateRange(this.countValue("z"));
  }

  resetSliceVisibility() {
    this.sliceVisibility = Object.fromEntries(
      TENSOR_AXES.map((axis) => [axis, this.coordinatesFor(axis).map(() => true)])
    );
  }

  addWhiteCubes() {
    const cubeCount = this.xCoordinates.length * this.yCoordinates.length * this.zCoordinates.length;

    this.tensorInstancedMeshes = {
      "-1": this.buildTensorInstancedMesh(cubeCount, this.blueMaterial, -1),
      "0": this.buildTensorInstancedMesh(cubeCount, this.whiteMaterial, 0),
      "1": this.buildTensorInstancedMesh(cubeCount, this.orangeMaterial, 1)
    };

    this.xCoordinates.forEach((x) => {
      this.yCoordinates.forEach((y) => {
        this.zCoordinates.forEach((z) => {
          this.addWhiteCube(x, y, z);
        });
      });
    });

    this.rebuildVisibleTensorInstances();
  }

  buildTensorInstancedMesh(cubeCount, material, tensorValue) {
    const mesh = new THREE.InstancedMesh(this.geometry, material, cubeCount);

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.tensorCubeInstances = true;
    mesh.userData.tensorValue = tensorValue;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.cube.add(mesh);

    return mesh;
  }

  addWhiteCube(x, y, z) {
    const instanceId = this.whiteCubes.length;
    const position = new THREE.Vector3(
      x * CUBE_SPACING,
      y * CUBE_SPACING,
      z * CUBE_SPACING
    );
    const cubelet = {
      position,
      visible: true,
      userData: {
        instanceId,
        tensorIndices: {
          x: this.coordinateIndex(this.xCoordinates, x),
          y: this.coordinateIndex(this.yCoordinates, y),
          z: this.coordinateIndex(this.zCoordinates, z)
        },
        targetOpacity: 1
      }
    };

    this.whiteCubes.push(cubelet);
    cubelet.userData.drawId = instanceId;
    cubelet.userData.drawKey = "0";

    return cubelet;
  }

  addVisibilityButtons() {
    TENSOR_AXES.forEach((axis) => {
      this.coordinatesFor(axis).forEach((_coordinate, index) => {
        this.visibilityButtons.push(this.addVisibilityButton(axis, index));
      });
    });
  }

  addVisibilityButton(axis, index) {
    const material = this.visibilityButtonMaterial(true);
    const button = new THREE.Mesh(this.buttonGeometry, material);

    button.userData.visibilityButton = true;
    button.userData.axis = axis;
    button.userData.index = index;
    button.userData.targetOpacity = 0;
    this.visibilityButtonMaterials.push(material);
    this.cube.add(button);

    return button;
  }

  visibilityButtonMaterial(visible) {
    return new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: visible ? this.eyeTexture : this.eyeSlashTexture,
      transparent: true,
      alphaTest: 0.28,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  loadIconTexture(path) {
    const texture = this.textureLoader.load(path, () => this.renderOnce());

    this.configureIconTexture(texture);

    return texture;
  }

  loadColoredIconTexture(path, color) {
    return fetch(path)
      .then((response) => response.text())
      .then((svg) => new Promise((resolve) => {
        const url = URL.createObjectURL(new Blob([this.coloredIconSvg(svg, color)], { type: "image/svg+xml" }));

        this.textureLoader.load(url, (texture) => {
          URL.revokeObjectURL(url);
          this.configureIconTexture(texture);
          resolve(texture);
        });
      }));
  }

  coloredIconSvg(svg, color) {
    return svg.replace(/<path\b([^>]*)>/g, (_match, attributes) => {
      const pathAttributes = attributes.replace(/\sfill="[^"]*"/g, "");

      return `<path fill="${color}"${pathAttributes}>`;
    });
  }

  configureIconTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
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

  syncTensorCubeMatrix(cubelet) {
    const mesh = this.tensorInstancedMeshForCubelet(cubelet);

    if (!mesh) return;

    this.instanceTransform.position.copy(cubelet.position);
    this.instanceTransform.rotation.set(0, 0, 0);
    this.instanceTransform.scale.setScalar(1);
    this.instanceTransform.updateMatrix();
    if (cubelet.userData.drawId == null) return;

    mesh.setMatrixAt(cubelet.userData.drawId, this.instanceTransform.matrix);
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

  updateVisibilityButtonPositions(immediate = false) {
    const context = this.visibilityButtonLayoutContext();

    this.visibilityButtons.forEach((button) => {
      const transform = this.visibilityButtonTransform(button, context, immediate);

      this.setButtonTransform(button, transform, immediate);
    });
  }

  visibilityButtonLayoutContext() {
    const closestCorner = this.closestCorner();
    const yAxisCorner = this.leftmostVisibleVerticalCorner(closestCorner);

    return {
      closestCorner,
      yAxisCorner,
      anchor: {
        x: this.visibilityButtonAnchorCoordinate("x"),
        y: this.visibilityButtonAnchorCoordinate("y"),
        z: this.visibilityButtonAnchorCoordinate("z")
      }
    };
  }

  visibilityButtonTransform(button, context, immediate) {
    const { axis, index } = button.userData;

    if (axis === "x") return this.xVisibilityButtonTransform(index, context);
    if (axis === "z") return this.zVisibilityButtonTransform(index, context);

    return this.yVisibilityButtonTransform(index, button.rotation.y, context, immediate);
  }

  xVisibilityButtonTransform(index, { closestCorner, anchor }) {
    return {
      x: this.coordinatesFor("x")[index],
      y: -anchor.y - CUBE_SIZE / 2,
      z: closestCorner.z * (anchor.z + BUTTON_SIDE_OFFSET),
      rotationX: -Math.PI / 2,
      rotationY: 0,
      rotationZ: closestCorner.z > 0 ? 0 : Math.PI
    };
  }

  zVisibilityButtonTransform(index, { closestCorner, anchor }) {
    return {
      x: closestCorner.x * (anchor.x + BUTTON_SIDE_OFFSET),
      y: -anchor.y - CUBE_SIZE / 2,
      z: this.coordinatesFor("z")[index],
      rotationX: -Math.PI / 2,
      rotationY: 0,
      rotationZ: closestCorner.x > 0 ? Math.PI / 2 : -Math.PI / 2
    };
  }

  visibilityButtonAnchorCoordinate(axis) {
    return this.axesValue ? this.outsideCoordinate(axis) : this.edgeCoordinate(axis);
  }

  yVisibilityButtonTransform(index, currentRotationY, { closestCorner, yAxisCorner, anchor }, immediate) {
    const offsetDirection = this.rightSideDirectionForYButton(closestCorner, yAxisCorner);
    const backDirection = this.directionFromClosestCorner(closestCorner, yAxisCorner);
    const basePosition = {
      x: yAxisCorner.x * anchor.x + offsetDirection.x * BUTTON_WALL_OFFSET + backDirection.x * BUTTON_BACK_EDGE_OFFSET,
      z: yAxisCorner.z * anchor.z + offsetDirection.z * BUTTON_WALL_OFFSET + backDirection.z * BUTTON_BACK_EDGE_OFFSET
    };
    const directionToPillar = { x: -offsetDirection.x, z: -offsetDirection.z };
    const faceDirection = this.yButtonFaceDirection(directionToPillar);
    const rotationY = this.rotationYForLocalXDirection(faceDirection);

    return {
      ...this.yButtonPosition(basePosition, directionToPillar, faceDirection),
      y: this.coordinatesFor("y")[index],
      rotationX: 0,
      rotationY: immediate ? rotationY : this.closestEquivalentAngle(currentRotationY, rotationY),
      rotationZ: 0
    };
  }

  yButtonFaceDirection(directionToPillar) {
    if (this.yRotatedButtonViewPreferred(directionToPillar)) return this.rotateDirectionRight(directionToPillar);

    return directionToPillar;
  }

  yButtonPosition(basePosition, directionToPillar, faceDirection) {
    if (this.sameDirection(faceDirection, directionToPillar)) return basePosition;

    const hingeX = basePosition.x + directionToPillar.x * BUTTON_HALF_OFFSET;
    const hingeZ = basePosition.z + directionToPillar.z * BUTTON_HALF_OFFSET;
    const pivotX = hingeX + directionToPillar.x * BUTTON_GAP_OFFSET;
    const pivotZ = hingeZ + directionToPillar.z * BUTTON_GAP_OFFSET;

    return {
      x: pivotX - faceDirection.x * (BUTTON_HALF_OFFSET + BUTTON_GAP_OFFSET),
      z: pivotZ - faceDirection.z * (BUTTON_HALF_OFFSET + BUTTON_GAP_OFFSET)
    };
  }

  yRotatedButtonViewPreferred(directionToPillar) {
    const baseRotation = this.rotationYForLocalXDirection(directionToPillar);
    const rotatedRotation = this.rotationYForLocalXDirection(this.rotateDirectionRight(directionToPillar));

    return this.buttonFacingScore(rotatedRotation) > this.buttonFacingScore(baseRotation);
  }

  rotateDirectionRight(direction) {
    return { x: -direction.z, z: direction.x };
  }

  sameDirection(firstDirection, secondDirection) {
    return firstDirection.x === secondDirection.x && firstDirection.z === secondDirection.z;
  }

  buttonFacingScore(rotationY) {
    const normal = { x: Math.sin(rotationY), z: Math.cos(rotationY) };
    const viewDirection = { x: Math.sin(this.cube.rotation.y), z: -Math.cos(this.cube.rotation.y) };

    return Math.abs(normal.x * viewDirection.x + normal.z * viewDirection.z);
  }

  directionFromClosestCorner(closestCorner, yAxisCorner) {
    const xDirection = yAxisCorner.x - closestCorner.x;
    const zDirection = yAxisCorner.z - closestCorner.z;

    if (xDirection !== 0 && zDirection === 0) return { x: Math.sign(xDirection), z: 0 };
    if (zDirection !== 0 && xDirection === 0) return { x: 0, z: Math.sign(zDirection) };

    return { x: yAxisCorner.x, z: 0 };
  }

  rightSideDirectionForYButton(closestCorner, yAxisCorner) {
    const backDirection = this.directionFromClosestCorner(closestCorner, yAxisCorner);

    if (backDirection.x !== 0) return { x: 0, z: yAxisCorner.z };
    if (backDirection.z !== 0) return { x: yAxisCorner.x, z: 0 };

    return { x: yAxisCorner.x, z: 0 };
  }

  rotationYForLocalXDirection(direction) {
    return Math.atan2(-direction.z, direction.x);
  }

  closestEquivalentAngle(currentAngle, targetAngle) {
    return currentAngle + THREE.MathUtils.euclideanModulo(targetAngle - currentAngle + Math.PI, Math.PI * 2) - Math.PI;
  }

  setButtonTransform(button, transform, immediate = false) {
    if (!button.userData.targetPosition) button.userData.targetPosition = new THREE.Vector3();
    if (!button.userData.targetRotation) button.userData.targetRotation = new THREE.Euler();

    button.userData.targetPosition.set(transform.x * CUBE_SPACING, transform.y * CUBE_SPACING, transform.z * CUBE_SPACING);
    button.userData.targetRotation.set(transform.rotationX, transform.rotationY, transform.rotationZ);

    if (immediate) {
      button.position.copy(button.userData.targetPosition);
      button.rotation.copy(button.userData.targetRotation);
    }
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

  updateAnimatedButtonTransforms(delta) {
    this.visibilityButtons.forEach((button) => {
      button.position.x = THREE.MathUtils.damp(button.position.x, button.userData.targetPosition.x, AXIS_MOVE_DAMPING, delta);
      button.position.y = THREE.MathUtils.damp(button.position.y, button.userData.targetPosition.y, AXIS_MOVE_DAMPING, delta);
      button.position.z = THREE.MathUtils.damp(button.position.z, button.userData.targetPosition.z, AXIS_MOVE_DAMPING, delta);
      button.rotation.x = THREE.MathUtils.damp(button.rotation.x, button.userData.targetRotation.x, AXIS_MOVE_DAMPING, delta);
      button.rotation.y = THREE.MathUtils.damp(button.rotation.y, button.userData.targetRotation.y, AXIS_MOVE_DAMPING, delta);
      button.rotation.z = THREE.MathUtils.damp(button.rotation.z, button.userData.targetRotation.z, AXIS_MOVE_DAMPING, delta);
    });
  }

  disposeWhiteCubeInstances() {
    this.tensorInstancedMeshes = null;
    this.whiteCubeByDrawId = this.emptyTensorDrawMap();
  }

  disposeButtonMaterials() {
    this.visibilityButtonMaterials?.forEach((material) => material.dispose());
  }

  disposeIconTextures() {
    this.eyeTexture?.dispose();
    this.eyeSlashTexture?.dispose();
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

    return Number.isInteger(value) && value > 0 ? value : DEFAULT_TENSOR_COUNT;
  }

  coordinatesFor(axis) {
    return this[`${axis}Coordinates`];
  }

  outsideCoordinate(axis) {
    const coordinates = this.coordinatesFor(axis);
    const furthestCoordinate = Math.max(...coordinates.map((coordinate) => Math.abs(coordinate)));

    return furthestCoordinate + 1;
  }

  edgeCoordinate(axis) {
    const coordinates = this.coordinatesFor(axis);

    return Math.max(...coordinates.map((coordinate) => Math.abs(coordinate)));
  }

  defaultCameraZoom() {
    const furthestCoordinate = Math.max(
      this.outsideCoordinate("x"),
      this.outsideCoordinate("y"),
      this.outsideCoordinate("z")
    );
    const objectRadius = furthestCoordinate * CUBE_SPACING + 0.4;
    const focusedZoom = this.focusedCameraZoom(objectRadius);
    const fittedZoom = focusedZoom || ORTHOGRAPHIC_VIEW_SIZE / (objectRadius * 2.9);
    const maxZoom = focusedZoom ? FOCUSED_VIEW_MAX_ZOOM : 1;

    return THREE.MathUtils.clamp(fittedZoom, MIN_CAMERA_ZOOM, maxZoom);
  }

  sceneBoundingRadius() {
    const xRadius = this.outsideCoordinate("x") * CUBE_SPACING;
    const yRadius = this.outsideCoordinate("y") * CUBE_SPACING;
    const zRadius = this.outsideCoordinate("z") * CUBE_SPACING;

    return Math.hypot(xRadius, yRadius, zRadius) + 1.5;
  }

  cameraDistance() {
    return Math.max(DEFAULT_CAMERA_DISTANCE, this.sceneBoundingRadius() + CAMERA_CLIP_MARGIN);
  }

  syncCameraClipping() {
    if (!this.camera) return;

    const radius = this.sceneBoundingRadius();
    const distance = this.cameraDistance();

    this.camera.near = 0.1;
    this.camera.far = distance + radius + CAMERA_CLIP_MARGIN;
  }

  focusedCameraZoom(objectRadius) {
    const focusElement = this.focusElement();

    if (!focusElement || !this.element.isConnected) return null;

    const bounds = this.element.getBoundingClientRect();
    const focusBounds = focusElement.getBoundingClientRect();

    if (bounds.width <= 0 || bounds.height <= 0 || focusBounds.width <= 0 || focusBounds.height <= 0) {
      return null;
    }

    const aspect = bounds.width / bounds.height;
    const objectDiameter = objectRadius * 2 * DEFAULT_VIEW_FIT_PADDING;
    const focusWidthZoom = (focusBounds.width / bounds.width) * (ORTHOGRAPHIC_VIEW_SIZE * aspect) / objectDiameter;
    const focusHeightZoom = (focusBounds.height / bounds.height) * ORTHOGRAPHIC_VIEW_SIZE / objectDiameter;

    return Math.min(focusWidthZoom, focusHeightZoom);
  }

  setupEvents() {
    this.onPointerDown = (event) => {
      const isPrimaryPointer = event.button === 0 || event.pointerType === "touch";
      const isPanPointer = event.button === 1 || event.button === 2;
      const button = isPrimaryPointer ? this.visibilityButtonHit(event) : null;

      if (button) {
        event.preventDefault();
        this.toggleSliceVisibility(button.userData.axis, button.userData.index);
        return;
      }

      const tensorCube = isPrimaryPointer && this.editableValue && !this.axesValue ? this.tensorCubeHit(event) : null;

      if (isPanPointer) event.preventDefault();
      this.colorPopup?.remove();
      this.dragging = false;
      this.dragMode = isPanPointer ? "pan" : "rotate";
      this.pointerId = event.pointerId;
      this.pointerStart = { x: event.clientX, y: event.clientY };
      this.previousPointer = { x: event.clientX, y: event.clientY };
      this.pendingTensorCube = tensorCube;
      this.pendingTensorCubeAdditive = event.shiftKey;
      this.pendingVerticalDrag = 0;
      this.element.setPointerCapture(event.pointerId);
    };

    this.onPointerMove = (event) => {
      if (event.pointerId !== this.pointerId) return;

      if (!this.dragging) {
        const movedDistance = Math.hypot(
          event.clientX - this.pointerStart.x,
          event.clientY - this.pointerStart.y
        );

        if (movedDistance < CLICK_DRAG_THRESHOLD) return;

        this.dragging = true;
        this.pendingTensorCube = null;
        this.pendingTensorCubeAdditive = false;
        this.colorPopup?.remove();
        this.clearTensorSelection();
        this.element.classList.add("is-dragging");
      }

      const deltaX = event.clientX - this.previousPointer.x;
      const deltaY = event.clientY - this.previousPointer.y;

      if (this.dragMode === "pan") {
        event.preventDefault();
        this.panCamera(deltaX, deltaY);
      } else {
        this.viewChanged = true;
        this.resetViewTarget = null;
        this.cube.rotation.y += deltaX * DRAG_ROTATION_SPEED;
        this.updateAxisPositions();
        this.updateVisibilityButtonPositions();
        this.applyVerticalDrag(deltaY);
        this.syncResetViewButton();
      }

      this.previousPointer = { x: event.clientX, y: event.clientY };
    };

    this.onPointerUp = (event) => {
      if (event.pointerId !== this.pointerId) return;

      const clickedTensorCube = !this.dragging ? this.pendingTensorCube : null;
      const additiveSelection = !this.dragging ? this.pendingTensorCubeAdditive : false;
      this.dragging = false;
      this.dragMode = null;
      this.pointerId = null;
      this.pointerStart = null;
      this.pendingTensorCube = null;
      this.pendingTensorCubeAdditive = false;
      this.element.classList.remove("is-dragging");

      if (this.element.hasPointerCapture(event.pointerId)) {
        this.element.releasePointerCapture(event.pointerId);
      }

      if (clickedTensorCube) {
        event.preventDefault();
        this.showColorPopup(clickedTensorCube, event, { additiveSelection });
      }
    };

    this.onPointerCancel = (event) => {
      if (event.pointerId !== this.pointerId) return;

      this.dragging = false;
      this.dragMode = null;
      this.pointerId = null;
      this.pointerStart = null;
      this.pendingTensorCube = null;
      this.pendingTensorCubeAdditive = false;
      this.element.classList.remove("is-dragging");
    };

    this.onPointerLeave = () => {
      if (!this.dragging) this.markPointerLeft();
    };

    this.onPointerEnter = () => {
      this.markPointerEntered();
    };

    this.onWheel = (event) => {
      event.preventDefault();
      this.zoom(event.deltaY);
    };

    this.onContextMenu = (event) => {
      event.preventDefault();
    };

    this.onWindowScroll = () => {
      this.syncFocusPosition();
    };

    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerUp);
    this.element.addEventListener("pointercancel", this.onPointerCancel);
    this.element.addEventListener("pointerenter", this.onPointerEnter);
    this.element.addEventListener("pointerleave", this.onPointerLeave);
    this.element.addEventListener("wheel", this.onWheel, { passive: false });
    this.element.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("scroll", this.onWindowScroll, { passive: true });
  }

  setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.element);
  }

  setupThemeObserver() {
    this.themeObserver = new MutationObserver(() => this.syncTheme());
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    this.syncTheme();
  }

  syncTheme() {
    this.whiteMaterial?.color.set(this.tensorCubeColor());
    this.updateIconTextures();
    this.renderOnce();
  }

  tensorCubeColor() {
    return getComputedStyle(document.body).getPropertyValue("--tensor-cube-color").trim() || "#d8d8d8";
  }

  tensorButtonIconColor() {
    return getComputedStyle(document.body).getPropertyValue("--tensor-button-icon-color").trim() || "#111111";
  }

  updateIconTextures() {
    const color = this.tensorButtonIconColor();

    if (this.iconTextureColor === color) return;
    this.iconTextureColor = color;

    Promise.all([
      this.loadColoredIconTexture(EYE_ICON_PATH, color),
      this.loadColoredIconTexture(EYE_SLASH_ICON_PATH, color)
    ]).then(([eyeTexture, eyeSlashTexture]) => {
      if (this.iconTextureColor !== color) {
        eyeTexture.dispose();
        eyeSlashTexture.dispose();
        return;
      }

      this.disposeIconTextures();
      this.eyeTexture = eyeTexture;
      this.eyeSlashTexture = eyeSlashTexture;
      this.updateAllButtonIcons();
      this.renderOnce();
    });
  }

  visibilityButtonHit(event) {
    if (!this.visibilityButtons?.length) return null;
    const bounds = this.canvasTarget.getBoundingClientRect();

    this.setRaycasterFromEvent(event, bounds);

    return this.raycaster.intersectObjects(this.visibilityButtons, false).find((hit) => {
      const { axis, index } = hit.object.userData;

      return hit.object.material.opacity > 0.2 || !this.sliceVisibility[axis][index];
    })?.object || null;
  }

  tensorCubeHit(event) {
    if (!this.tensorInstancedMeshes || !this.whiteCubes?.length) return null;

    this.setRaycasterFromEvent(event, this.canvasTarget.getBoundingClientRect());

    const meshes = Object.values(this.tensorInstancedMeshes).filter((mesh) => mesh.visible && mesh.count > 0);
    const hit = this.raycaster.intersectObjects(meshes, false).find((candidate) => {
      const cubelet = this.whiteCubeByDrawId[candidate.object.userData.tensorValue]?.[candidate.instanceId];

      return cubelet && this.tensorCubeSelectable(cubelet);
    });

    return hit ? this.whiteCubeByDrawId[hit.object.userData.tensorValue]?.[hit.instanceId] || null : null;
  }

  tensorCubeSelectable(cubelet) {
    const { x, y, z } = cubelet.userData.tensorIndices;

    return cubelet.visible &&
      cubelet.userData.targetOpacity > 0.5 &&
      this.sliceVisibility.x[x] &&
      this.sliceVisibility.y[y] &&
      this.sliceVisibility.z[z];
  }

  setRaycasterFromEvent(event, bounds) {
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.cube.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  toggleSliceVisibility(axis, index) {
    this.sliceVisibility[axis][index] = !this.sliceVisibility[axis][index];
    this.updateButtonIcon(axis, index);
    this.applyTensorVisibility();
    this.updateVisibilityButtonTargets();
  }

  updateButtonIcon(axis, index) {
    const visible = this.sliceVisibility[axis][index];
    const button = this.visibilityButtons.find((candidate) => candidate.userData.axis === axis && candidate.userData.index === index);

    if (!button) return;

    button.material.map = visible ? this.eyeTexture : this.eyeSlashTexture;
    button.material.needsUpdate = true;
  }

  updateAllButtonIcons() {
    this.visibilityButtons?.forEach((button) => {
      this.updateButtonIcon(button.userData.axis, button.userData.index);
    });
  }

  showColorPopup(cubelet, event, { additiveSelection = false } = {}) {
    this.colorPopup?.remove();

    if (additiveSelection) {
      this.addSelectedTensorCube(cubelet);
    } else {
      this.selectOnlyTensorCube(cubelet);
    }

    const popup = document.createElement("div");
    popup.className = "tensor-color-popup";
    popup.addEventListener("pointerdown", (popupEvent) => popupEvent.stopPropagation());

    [0, 1, -1].forEach((value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tensor-color-swatch";
      button.setAttribute("aria-label", `Set tensor value to ${value}`);
      button.addEventListener("click", () => {
        this.setSelectedTensorCubeValues(value);
        popup.remove();
      });
      const swatch = document.createElement("span");
      swatch.className = "tensor-color-swatch-color";
      swatch.style.background = this.tensorColorForValue(value);

      const label = document.createElement("span");
      label.className = "tensor-color-swatch-label";
      label.textContent = value;

      button.append(swatch, label);
      popup.append(button);
    });

    const bounds = this.element.getBoundingClientRect();

    popup.style.left = `${event.clientX - bounds.left}px`;
    popup.style.top = `${event.clientY - bounds.top}px`;
    this.element.append(popup);
    this.colorPopup = popup;
  }

  setTensorCubeValue(cubelet, value) {
    const { x, y, z } = cubelet.userData.tensorIndices;

    this.currentTensor = this.normalizedTensor(this.currentTensor);
    this.currentTensor[z][y][x] = value;
    this.syncTensorCubeColors();
    this.selectTensorCube(cubelet);
    this.element.dispatchEvent(new CustomEvent("tensor-value-change", {
      bubbles: true,
      detail: { tensor: this.currentTensor }
    }));
    this.renderOnce();
  }

  setSelectedTensorCubeValues(value) {
    const selectedCubes = this.selectedTensorCubes.size > 0 ? Array.from(this.selectedTensorCubes) : [];

    if (!selectedCubes.length) return;

    this.currentTensor = this.normalizedTensor(this.currentTensor);
    selectedCubes.forEach((cubelet) => {
      const { x, y, z } = cubelet.userData.tensorIndices;

      this.currentTensor[z][y][x] = value;
    });
    this.syncTensorCubeColors();
    this.element.dispatchEvent(new CustomEvent("tensor-value-change", {
      bubbles: true,
      detail: { tensor: this.currentTensor }
    }));
    this.renderOnce();
  }

  syncTensorCubeColors() {
    this.rebuildVisibleTensorInstances();
  }

  syncTensorCubeColor(cubelet) {
    return cubelet;
  }

  selectTensorCube(cubelet) {
    this.selectOnlyTensorCube(cubelet);
  }

  selectOnlyTensorCube(cubelet) {
    this.clearTensorSelection();
    this.addSelectedTensorCube(cubelet);
  }

  addSelectedTensorCube(cubelet) {
    if (this.selectedTensorCubes.has(cubelet)) return;

    this.selectedTensorCubes.add(cubelet);

    const outline = new THREE.LineSegments(this.selectedOutlineGeometry, this.selectedOutlineMaterial);
    outline.position.copy(cubelet.position);
    this.cube.add(outline);
    this.selectedTensorOutlines.set(cubelet, outline);
  }

  removeSelectedTensorCube(cubelet) {
    if (!this.selectedTensorCubes.has(cubelet)) return;

    const outline = this.selectedTensorOutlines.get(cubelet);

    if (outline) {
      this.cube.remove(outline);
      this.selectedTensorOutlines.delete(cubelet);
    }

    this.selectedTensorCubes.delete(cubelet);
  }

  clearTensorSelection() {
    if (!this.selectedTensorCubes?.size) return;

    Array.from(this.selectedTensorCubes).forEach((cubelet) => this.removeSelectedTensorCube(cubelet));
  }

  clearSelectedTensorCube() {
    this.clearTensorSelection();
  }

  tensorValueFor(x, y, z) {
    return this.normalizedTensorValue(this.currentTensor?.[z]?.[y]?.[x]);
  }

  tensorColorForValue(value) {
    return TENSOR_VALUE_COLORS[value] || this.tensorCubeColor();
  }

  normalizedTensor(tensor) {
    const source = Array.isArray(tensor) ? tensor : [];

    return Array.from({ length: this.countValue("z") }, (_zValue, z) => (
      Array.from({ length: this.countValue("y") }, (_yValue, y) => (
        Array.from({ length: this.countValue("x") }, (_xValue, x) => this.normalizedTensorValue(source?.[z]?.[y]?.[x]))
      ))
    ));
  }

  blankTensor(xCount, yCount, zCount) {
    return Array.from({ length: zCount }, () => (
      Array.from({ length: yCount }, () => Array.from({ length: xCount }, () => 0))
    ));
  }

  normalizedTensorValue(value) {
    const number = Number.parseInt(value, 10);

    if (number > 0) return 1;
    if (number < 0) return -1;
    return 0;
  }

  applyTensorVisibility() {
    this.whiteCubes?.forEach((cubelet) => {
      const indices = cubelet.userData.tensorIndices;

      cubelet.userData.targetOpacity = TENSOR_AXES.every((axis) => this.sliceVisibility[axis][indices[axis]]) ? 1 : 0;
      cubelet.visible = cubelet.userData.targetOpacity > 0.5;
    });
    this.rebuildVisibleTensorInstances();

    const hiddenSelectedCubes = Array.from(this.selectedTensorCubes || []).filter((cubelet) => cubelet.userData.targetOpacity === 0);

    if (hiddenSelectedCubes.length) {
      hiddenSelectedCubes.forEach((cubelet) => this.removeSelectedTensorCube(cubelet));
      this.colorPopup?.remove();
    }
  }

  markPointerEntered() {
    this.pointerInside = true;
    this.pointerEnteredAt = performance.now();
    this.pointerLeftAt = null;
  }

  markPointerLeft() {
    this.pointerInside = false;
    this.pointerEnteredAt = null;
    this.pointerLeftAt = performance.now();
  }

  updateVisibilityButtonTargets() {
    const now = performance.now();
    const stageVisible = this.pointerInside
      ? this.pointerEnteredAt && now - this.pointerEnteredAt >= BUTTON_VISIBLE_DELAY
      : this.pointerLeftAt && now - this.pointerLeftAt < BUTTON_HIDDEN_DELAY;

    this.visibilityButtons?.forEach((button) => {
      const { axis, index } = button.userData;
      const forcedVisible = !this.sliceVisibility[axis][index];

      button.userData.targetOpacity = forcedVisible || stageVisible ? 1 : 0;
    });
  }

  updateButtonOpacity(delta) {
    this.visibilityButtons?.forEach((button) => {
      const targetOpacity = button.userData.targetOpacity ?? 0;

      button.material.opacity = THREE.MathUtils.damp(button.material.opacity, targetOpacity, BUTTON_OPACITY_DAMPING, delta);
      button.visible = button.material.opacity > 0.01;
    });
  }

  coordinateIndex(coordinates, coordinate) {
    return coordinates.findIndex((candidate) => candidate === coordinate);
  }

  emptyTensorDrawMap() {
    return { "-1": [], "0": [], "1": [] };
  }

  tensorValueKey(value) {
    return String(this.normalizedTensorValue(value));
  }

  tensorInstancedMeshForCubelet(cubelet) {
    return this.tensorInstancedMeshes?.[cubelet.userData.drawKey] || null;
  }

  rebuildVisibleTensorInstances() {
    if (!this.tensorInstancedMeshes) return;

    const drawCounts = { "-1": 0, "0": 0, "1": 0 };
    this.whiteCubeByDrawId = this.emptyTensorDrawMap();

    this.whiteCubes?.forEach((cubelet) => {
      if (!cubelet.visible) {
        cubelet.userData.drawId = null;
        cubelet.userData.drawKey = null;
        return;
      }

      const { x, y, z } = cubelet.userData.tensorIndices;
      const key = this.tensorValueKey(this.tensorValueFor(x, y, z));

      cubelet.userData.drawKey = key;
      cubelet.userData.drawId = drawCounts[key];
      this.whiteCubeByDrawId[key][cubelet.userData.drawId] = cubelet;
      this.syncTensorCubeMatrix(cubelet);
      drawCounts[key] += 1;
    });

    TENSOR_VALUE_KEYS.forEach((key) => {
      const mesh = this.tensorInstancedMeshes[key];

      mesh.count = drawCounts[key];
      mesh.visible = drawCounts[key] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }

  renderOnce() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
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
    this.viewChanged = true;
    this.resetViewTarget = null;
    this.camera.zoom = THREE.MathUtils.clamp(
      this.camera.zoom - deltaY * ZOOM_SPEED,
      MIN_CAMERA_ZOOM,
      MAX_CAMERA_ZOOM
    );
    this.camera.updateProjectionMatrix();
    this.syncResetViewButton();
  }

  panCamera(deltaX, deltaY) {
    this.viewChanged = true;
    this.resetViewTarget = null;
    const bounds = this.element.getBoundingClientRect();
    const visibleWidth = (this.camera.right - this.camera.left) / this.camera.zoom;
    const visibleHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;

    this.camera.position.x -= (deltaX / Math.max(bounds.width, 1)) * visibleWidth;
    this.camera.position.y += (deltaY / Math.max(bounds.height, 1)) * visibleHeight;
    this.syncResetViewButton();
  }

  resetCameraPosition({ immediate = false } = {}) {
    this.syncCameraClipping();
    const zoom = this.defaultCameraZoom();
    const position = this.defaultCameraPosition(zoom);
    const rotation = new THREE.Euler(DEFAULT_CUBE_ROTATION.x, DEFAULT_CUBE_ROTATION.y, DEFAULT_CUBE_ROTATION.z);

    if (immediate) {
      this.camera.zoom = zoom;
      this.camera.position.copy(position);
      this.camera.updateProjectionMatrix();
      this.cube?.rotation.copy(rotation);
      this.updateAxisPositions(true);
      this.updateVisibilityButtonPositions(true);
      this.viewChanged = false;
      this.resetViewTarget = null;
      this.syncResetViewButton();
      return;
    }

    this.resetViewTarget = { position, zoom, rotation };
    this.syncResetViewButton();
  }

  defaultCameraPosition(zoom = this.camera?.zoom || this.defaultCameraZoom()) {
    const position = new THREE.Vector3(0, 0, this.cameraDistance());
    const focusElement = this.focusElement();

    if (!focusElement || !this.element.isConnected) return position;

    const bounds = this.element.getBoundingClientRect();
    const focusBounds = focusElement.getBoundingClientRect();

    if (bounds.width <= 0 || bounds.height <= 0 || focusBounds.width <= 0 || focusBounds.height <= 0) {
      return position;
    }

    const focusCenterX = focusBounds.left + focusBounds.width / 2;
    const focusCenterY = focusBounds.top + focusBounds.height / 2;
    const offsetX = focusCenterX - (bounds.left + bounds.width / 2);
    const offsetY = focusCenterY - (bounds.top + bounds.height / 2);
    const visibleWidth = (this.camera.right - this.camera.left) / zoom;
    const visibleHeight = (this.camera.top - this.camera.bottom) / zoom;

    position.x = -(offsetX / bounds.width) * visibleWidth;
    position.y = (offsetY / bounds.height) * visibleHeight;

    return position;
  }

  focusElement() {
    if (!this.hasFocusSelectorValue || !this.focusSelectorValue) return null;

    return this.element.closest(".tensor-form-page")?.querySelector(this.focusSelectorValue) ||
      document.querySelector(this.focusSelectorValue);
  }

  viewIsDefault() {
    const defaultZoom = this.defaultCameraZoom();
    const defaultPosition = this.defaultCameraPosition(defaultZoom);

    return Math.abs(this.camera.position.x - defaultPosition.x) <= 0.01 &&
      Math.abs(this.camera.position.y - defaultPosition.y) <= 0.01 &&
      Math.abs(this.camera.zoom - defaultZoom) <= 0.01 &&
      Math.abs(this.cube.rotation.x - DEFAULT_CUBE_ROTATION.x) <= 0.01 &&
      Math.abs(this.cube.rotation.y - DEFAULT_CUBE_ROTATION.y) <= 0.01 &&
      Math.abs(this.cube.rotation.z - DEFAULT_CUBE_ROTATION.z) <= 0.01;
  }

  syncResetViewButton() {
    if (!this.resetViewButton) return;

    this.resetViewButton.hidden = !this.resetAlwaysValue && this.viewIsDefault();
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
    this.syncCameraClipping();
    this.camera.updateProjectionMatrix();
    this.syncFocusPosition();
  }

  animate() {
    const delta = this.clock.getDelta();

    this.updateResetViewAnimation(delta);
    this.updateVisibilityButtonTargets();
    this.updateAnimatedAxisPositions(delta);
    this.updateAnimatedButtonTransforms(delta);
    this.updateButtonOpacity(delta);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  updateResetViewAnimation(delta) {
    if (!this.resetViewTarget) return;

    const damping = 1 - Math.exp(-RESET_VIEW_DAMPING * delta);

    this.camera.position.lerp(this.resetViewTarget.position, damping);
    this.camera.zoom = THREE.MathUtils.lerp(this.camera.zoom, this.resetViewTarget.zoom, damping);
    this.camera.updateProjectionMatrix();
    this.cube.rotation.x = THREE.MathUtils.lerp(this.cube.rotation.x, this.resetViewTarget.rotation.x, damping);
    this.cube.rotation.y = THREE.MathUtils.lerp(this.cube.rotation.y, this.resetViewTarget.rotation.y, damping);
    this.cube.rotation.z = THREE.MathUtils.lerp(this.cube.rotation.z, this.resetViewTarget.rotation.z, damping);
    this.updateAxisPositions();
    this.updateVisibilityButtonPositions();

    if (this.viewIsDefault()) {
      this.camera.zoom = this.resetViewTarget.zoom;
      this.camera.position.copy(this.resetViewTarget.position);
      this.camera.updateProjectionMatrix();
      this.cube.rotation.copy(this.resetViewTarget.rotation);
      this.updateAxisPositions(true);
      this.updateVisibilityButtonPositions(true);
      this.viewChanged = false;
      this.resetViewTarget = null;
    }

    this.syncResetViewButton();
  }

  positionResetViewButton() {
    if (!this.resetViewButton) return;

    const focusElement = this.focusElement();

    if (!focusElement) {
      this.resetViewButton.style.removeProperty("--tensor-reset-top");
      this.resetViewButton.style.removeProperty("--tensor-reset-left");
      return;
    }

    const bounds = this.element.getBoundingClientRect();
    const focusBounds = focusElement.getBoundingClientRect();

    this.resetViewButton.style.setProperty("--tensor-reset-top", `${Math.max(0, focusBounds.top - bounds.top)}px`);
    this.resetViewButton.style.setProperty("--tensor-reset-left", `${Math.max(0, focusBounds.left - bounds.left)}px`);
  }

  syncFocusPosition() {
    this.positionResetViewButton();

    if (!this.viewChanged && !this.resetViewTarget) {
      const zoom = this.defaultCameraZoom();

      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.defaultCameraPosition(zoom));
    } else if (this.resetViewTarget) {
      this.resetViewTarget.zoom = this.defaultCameraZoom();
      this.resetViewTarget.position = this.defaultCameraPosition(this.resetViewTarget.zoom);
    }

    this.syncResetViewButton();
  }
}
