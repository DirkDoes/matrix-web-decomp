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
const SLICE_OPACITY_DAMPING = 18;
const BUTTON_OPACITY_DAMPING = 9;
const BUTTON_VISIBLE_DELAY = 1000;
const BUTTON_HIDDEN_DELAY = 1000;
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

export default class extends Controller {
  static targets = ["canvas"];
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
    this.pointerInside = false;
    this.pointerEnteredAt = null;
    this.pointerLeftAt = null;

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
    this.element.removeEventListener("pointerenter", this.onPointerEnter);
    this.element.removeEventListener("pointerleave", this.onPointerLeave);
    this.element.removeEventListener("wheel", this.onWheel);

    this.geometry?.dispose();
    this.whiteMaterial?.dispose();
    this.disposeWhiteCubeMaterials();
    this.disposeButtonMaterials();
    this.buttonGeometry?.dispose();
    this.limeMaterial?.dispose();
    this.yellowMaterial?.dispose();
    this.renderer?.dispose();
  }

  updateDimensions(xCount, yCount, zCount) {
    this.xCountValue = xCount;
    this.yCountValue = yCount;
    this.zCountValue = zCount;
    this.rebuildCubes();
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
    this.buttonGeometry = new THREE.PlaneGeometry(BUTTON_SIZE, BUTTON_SIZE);
    this.textureLoader = new THREE.TextureLoader();
    this.eyeTexture = this.loadIconTexture(EYE_ICON_PATH);
    this.eyeSlashTexture = this.loadIconTexture(EYE_SLASH_ICON_PATH);
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
    this.disposeButtonMaterials();
    this.cube.clear();
    this.updateCoordinateRanges();
    this.resetSliceVisibility();
    this.yAxisCubes = [];
    this.xAxisCubes = [];
    this.zAxisCubes = [];
    this.axisCubes = [];
    this.whiteCubes = [];
    this.whiteCubeMaterials = [];
    this.visibilityButtons = [];
    this.visibilityButtonMaterials = [];

    this.addWhiteCubes();
    this.addVisibilityButtons();

    if (this.axesValue) {
      this.addAxisCubes();
      this.updateAxisPositions(immediate);
    }

    this.updateVisibilityButtonPositions(immediate);
    this.applyMatrixVisibility();
  }

  updateCoordinateRanges() {
    this.xCoordinates = this.coordinateRange(this.countValue("x"));
    this.yCoordinates = this.coordinateRange(this.countValue("y"));
    this.zCoordinates = this.coordinateRange(this.countValue("z"));
  }

  resetSliceVisibility() {
    this.sliceVisibility = {
      x: this.xCoordinates.map(() => true),
      y: this.yCoordinates.map(() => true),
      z: this.zCoordinates.map(() => true)
    };
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
    cubelet.userData.matrixIndices = {
      x: this.coordinateIndex(this.xCoordinates, x),
      y: this.coordinateIndex(this.yCoordinates, y),
      z: this.coordinateIndex(this.zCoordinates, z)
    };
    cubelet.userData.targetOpacity = 1;

    return cubelet;
  }

  addVisibilityButtons() {
    this.xCoordinates.forEach((_coordinate, index) => {
      this.visibilityButtons.push(this.addVisibilityButton("x", index));
    });

    this.yCoordinates.forEach((_coordinate, index) => {
      this.visibilityButtons.push(this.addVisibilityButton("y", index));
    });

    this.zCoordinates.forEach((_coordinate, index) => {
      this.visibilityButtons.push(this.addVisibilityButton("z", index));
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

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;

    return texture;
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

  updateVisibilityButtonPositions(immediate = false) {
    const closestCorner = this.closestCorner();
    const yAxisCorner = this.leftmostVisibleVerticalCorner(closestCorner);
    const buttonX = this.visibilityButtonAnchorCoordinate("x");
    const buttonY = this.visibilityButtonAnchorCoordinate("y");
    const buttonZ = this.visibilityButtonAnchorCoordinate("z");

    this.visibilityButtons.forEach((button) => {
      const { axis, index } = button.userData;

      if (axis === "x") {
        this.setButtonTransform(
          button,
          this.xCoordinates[index],
          -buttonY - CUBE_SIZE / 2,
          closestCorner.z * (buttonZ + BUTTON_SIDE_OFFSET),
          -Math.PI / 2,
          0,
          closestCorner.z > 0 ? 0 : Math.PI,
          immediate
        );
      } else if (axis === "z") {
        this.setButtonTransform(
          button,
          closestCorner.x * (buttonX + BUTTON_SIDE_OFFSET),
          -buttonY - CUBE_SIZE / 2,
          this.zCoordinates[index],
          -Math.PI / 2,
          0,
          closestCorner.x > 0 ? Math.PI / 2 : -Math.PI / 2,
          immediate
        );
      } else {
        const yButtonTransform = this.yVisibilityButtonTransform(closestCorner, yAxisCorner, buttonX, buttonZ);
        const rotationY = immediate
          ? yButtonTransform.rotationY
          : this.closestEquivalentAngle(button.rotation.y, yButtonTransform.rotationY);

        this.setButtonTransform(
          button,
          yButtonTransform.x,
          this.yCoordinates[index],
          yButtonTransform.z,
          yButtonTransform.rotationX,
          rotationY,
          yButtonTransform.rotationZ,
          immediate
        );
      }
    });
  }

  visibilityButtonAnchorCoordinate(axis) {
    return this.axesValue ? this.outsideCoordinate(axis) : this.edgeCoordinate(axis);
  }

  yVisibilityButtonTransform(closestCorner, yAxisCorner, outsideX, outsideZ) {
    const offsetDirection = this.rightSideDirectionForYButton(closestCorner, yAxisCorner);
    const backDirection = this.directionFromClosestCorner(closestCorner, yAxisCorner);
    const baseX = yAxisCorner.x * outsideX + offsetDirection.x * BUTTON_WALL_OFFSET + backDirection.x * BUTTON_BACK_EDGE_OFFSET;
    const baseZ = yAxisCorner.z * outsideZ + offsetDirection.z * BUTTON_WALL_OFFSET + backDirection.z * BUTTON_BACK_EDGE_OFFSET;
    const directionToPillar = { x: -offsetDirection.x, z: -offsetDirection.z };

    if (!this.yVisibilityButtonSecondaryRotationActive(directionToPillar)) {
      return {
        x: baseX,
        z: baseZ,
        rotationX: 0,
        rotationY: this.rotationYForLocalXDirection(directionToPillar),
        rotationZ: 0
      };
    }

    const hingeX = baseX + directionToPillar.x * BUTTON_HALF_OFFSET;
    const hingeZ = baseZ + directionToPillar.z * BUTTON_HALF_OFFSET;
    const pivotX = hingeX + directionToPillar.x * BUTTON_GAP_OFFSET;
    const pivotZ = hingeZ + directionToPillar.z * BUTTON_GAP_OFFSET;
    const rotatedDirectionToPillar = this.rotateDirectionRight(directionToPillar);

    return {
      x: pivotX - rotatedDirectionToPillar.x * (BUTTON_HALF_OFFSET + BUTTON_GAP_OFFSET),
      z: pivotZ - rotatedDirectionToPillar.z * (BUTTON_HALF_OFFSET + BUTTON_GAP_OFFSET),
      rotationX: 0,
      rotationY: this.rotationYForLocalXDirection(rotatedDirectionToPillar),
      rotationZ: 0
    };
  }

  yVisibilityButtonSecondaryRotationActive(directionToPillar) {
    const baseRotation = this.rotationYForLocalXDirection(directionToPillar);
    const rotatedRotation = this.rotationYForLocalXDirection(this.rotateDirectionRight(directionToPillar));

    return this.buttonFacingScore(rotatedRotation) > this.buttonFacingScore(baseRotation);
  }

  rotateDirectionRight(direction) {
    return { x: -direction.z, z: direction.x };
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

  setButtonTransform(button, x, y, z, rotationX, rotationY, rotationZ, immediate = false) {
    if (!button.userData.targetPosition) button.userData.targetPosition = new THREE.Vector3();
    if (!button.userData.targetRotation) button.userData.targetRotation = new THREE.Euler();

    button.userData.targetPosition.set(x * CUBE_SPACING, y * CUBE_SPACING, z * CUBE_SPACING);
    button.userData.targetRotation.set(rotationX, rotationY, rotationZ);

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

  disposeWhiteCubeMaterials() {
    this.whiteCubeMaterials?.forEach((material) => material.dispose());
  }

  disposeButtonMaterials() {
    this.visibilityButtonMaterials?.forEach((material) => material.dispose());
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

  edgeCoordinate(axis) {
    const coordinates = this[`${axis}Coordinates`];

    return Math.max(...coordinates.map((coordinate) => Math.abs(coordinate)));
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
      const button = this.visibilityButtonHit(event);

      if (button) {
        event.preventDefault();
        this.toggleSliceVisibility(button.userData.axis, button.userData.index);
        return;
      }

      this.dragging = true;
      this.pointerId = event.pointerId;
      this.previousPointer = { x: event.clientX, y: event.clientY };
      this.pendingVerticalDrag = 0;
      this.element.classList.add("is-dragging");
      this.element.setPointerCapture(event.pointerId);
    };

    this.onPointerMove = (event) => {
      if (!this.dragging) return;

      if (event.pointerId !== this.pointerId) return;

      const deltaX = event.clientX - this.previousPointer.x;
      const deltaY = event.clientY - this.previousPointer.y;

      this.cube.rotation.y += deltaX * DRAG_ROTATION_SPEED;
      this.updateAxisPositions();
      this.updateVisibilityButtonPositions();
      this.applyVerticalDrag(deltaY);
      this.previousPointer = { x: event.clientX, y: event.clientY };
    };

    this.onPointerUp = (event) => {
      if (event.pointerId !== this.pointerId) return;

      this.dragging = false;
      this.pointerId = null;
      this.element.classList.remove("is-dragging");

      if (this.element.hasPointerCapture(event.pointerId)) {
        this.element.releasePointerCapture(event.pointerId);
      }
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

    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerUp);
    this.element.addEventListener("pointercancel", this.onPointerUp);
    this.element.addEventListener("pointerenter", this.onPointerEnter);
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

  visibilityButtonHit(event) {
    if (!this.visibilityButtons?.length) return null;
    const bounds = this.canvasTarget.getBoundingClientRect();

    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.cube.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    return this.raycaster.intersectObjects(this.visibilityButtons, false).find((hit) => {
      const { axis, index } = hit.object.userData;

      return hit.object.material.opacity > 0.2 || !this.sliceVisibility[axis][index];
    })?.object || null;
  }

  toggleSliceVisibility(axis, index) {
    this.sliceVisibility[axis][index] = !this.sliceVisibility[axis][index];
    this.updateButtonIcon(axis, index);
    this.applyMatrixVisibility();
    this.updateVisibilityButtonTargets();
  }

  updateButtonIcon(axis, index) {
    const visible = this.sliceVisibility[axis][index];
    const button = this.visibilityButtons.find((candidate) => candidate.userData.axis === axis && candidate.userData.index === index);

    if (!button) return;

    button.material.map = visible ? this.eyeTexture : this.eyeSlashTexture;
    button.material.needsUpdate = true;
  }

  applyMatrixVisibility() {
    this.whiteCubes?.forEach((cubelet) => {
      const { x, y, z } = cubelet.userData.matrixIndices;

      cubelet.userData.targetOpacity = this.sliceVisibility.x[x] && this.sliceVisibility.y[y] && this.sliceVisibility.z[z] ? 1 : 0;
    });
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

  renderOnce() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  updateSliceOpacity(delta) {
    this.whiteCubes?.forEach((cubelet) => {
      const targetOpacity = cubelet.userData.targetOpacity ?? 1;

      cubelet.material.opacity = THREE.MathUtils.damp(cubelet.material.opacity, targetOpacity, SLICE_OPACITY_DAMPING, delta);
      cubelet.material.depthWrite = cubelet.material.opacity > 0.92;
      cubelet.visible = cubelet.material.opacity > 0.01;
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

    this.updateVisibilityButtonTargets();
    this.updateSliceOpacity(delta);
    this.updateAnimatedAxisPositions(delta);
    this.updateAnimatedButtonTransforms(delta);
    this.updateButtonOpacity(delta);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }
}
