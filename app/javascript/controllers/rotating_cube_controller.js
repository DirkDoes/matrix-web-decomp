import { Controller } from "@hotwired/stimulus";
import * as THREE from "three";

const DRAG_ROTATION_SPEED = 0.01;
const MAX_VERTICAL_ROTATION = Math.PI / 2;
const VERTICAL_DRAG_THRESHOLD = 8;
const CUBE_SPACING = 0.96;
const WHITE_COORDINATES = [-1, 0, 1];
const AXIS_COORDINATES = [-1, 0, 1];

export default class extends Controller {
  static targets = ["canvas"];

  connect() {
    this.dragging = false;
    this.pointerId = null;
    this.previousPointer = { x: 0, y: 0 };
    this.pendingVerticalDrag = 0;

    this.setupScene();
    this.setupEvents();
    this.resize();
    this.animate();
  }

  disconnect() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();

    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerUp);

    this.geometry?.dispose();
    this.whiteMaterial?.dispose();
    this.limeMaterial?.dispose();
    this.yellowMaterial?.dispose();
    this.renderer?.dispose();
  }

  setupScene() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.set(0, 0, 8.8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasTarget,
      antialias: true,
      alpha: true
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.geometry = new THREE.BoxGeometry(0.72, 0.72, 0.72);
    this.whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.02 });
    this.limeMaterial = new THREE.MeshStandardMaterial({ color: 0x40ff00, roughness: 0.44, metalness: 0.02 });
    this.yellowMaterial = new THREE.MeshStandardMaterial({ color: 0xffe100, roughness: 0.44, metalness: 0.02 });
    this.cube = new THREE.Group();
    this.yAxisCubes = [];
    this.xAxisCubes = [];
    this.zAxisCubes = [];

    this.addWhiteCubes();
    this.addAxisCubes();

    this.cube.rotation.set(-0.35, 0.55, 0);
    this.updateAxisPositions();
    this.scene.add(this.cube);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.1));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(3, 4, 5);
    this.scene.add(keyLight);
  }

  addWhiteCubes() {
    WHITE_COORDINATES.forEach((x) => {
      WHITE_COORDINATES.forEach((y) => {
        WHITE_COORDINATES.forEach((z) => {
          this.addCube(this.whiteMaterial, x, y, z);
        });
      });
    });
  }

  addAxisCubes() {
    AXIS_COORDINATES.forEach(() => {
      this.yAxisCubes.push(this.addCube(this.limeMaterial, 0, 0, 0));
      this.xAxisCubes.push(this.addCube(this.yellowMaterial, 0, 0, 0));
      this.zAxisCubes.push(this.addCube(this.limeMaterial, 0, 0, 0));
    });
  }

  addCube(material, x, y, z) {
    const cubelet = new THREE.Mesh(this.geometry, material);

    this.positionCube(cubelet, x, y, z);
    this.cube.add(cubelet);

    return cubelet;
  }

  positionCube(cubelet, x, y, z) {
    cubelet.position.set(
      x * CUBE_SPACING,
      y * CUBE_SPACING,
      z * CUBE_SPACING
    );
  }

  updateAxisPositions() {
    const closestCorner = this.closestCorner();
    const yAxisCorner = this.leftmostVisibleVerticalCorner(closestCorner);

    this.yAxisCubes.forEach((cubelet, index) => {
      this.positionCube(cubelet, yAxisCorner.x * 2, AXIS_COORDINATES[index], yAxisCorner.z * 2);
    });

    this.xAxisCubes.forEach((cubelet, index) => {
      this.positionCube(cubelet, AXIS_COORDINATES[index], -2, closestCorner.z * 2);
    });

    this.zAxisCubes.forEach((cubelet, index) => {
      this.positionCube(cubelet, closestCorner.x * 2, -2, AXIS_COORDINATES[index]);
    });
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

  setupEvents() {
    this.onPointerDown = (event) => {
      this.dragging = true;
      this.pointerId = event.pointerId;
      this.previousPointer = { x: event.clientX, y: event.clientY };
      this.pendingVerticalDrag = 0;
      this.element.classList.add("is-dragging");
      this.element.setPointerCapture(event.pointerId);
    };

    this.onPointerMove = (event) => {
      if (!this.dragging || event.pointerId !== this.pointerId) return;

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

      if (this.element.hasPointerCapture(event.pointerId)) {
        this.element.releasePointerCapture(event.pointerId);
      }
    };

    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerUp);
    this.element.addEventListener("pointercancel", this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.element);
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

  resize() {
    const { width, height } = this.element.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));

    this.renderer.setSize(nextWidth, nextHeight, false);
    this.camera.aspect = nextWidth / nextHeight;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }
}
