import { Controller } from "@hotwired/stimulus";
import * as THREE from "three";

const DEFAULT_COUNT = 3;
const CUBE_SPACING = 0.78;
const VIEW_SIZE = 5.6;
const TENSOR_VALUE_COLORS = {
  "-1": "#00346b",
  0: null,
  1: "#ff9500"
};

export default class extends Controller {
  static values = {
    xCount: Number,
    yCount: Number,
    zCount: Number,
    tensor: Array
  };

  connect() {
    this.setupScene();
    this.setupThemeObserver();
    this.renderPreview();
    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.element);
  }

  disconnect() {
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
    this.geometry?.dispose();
    this.material?.dispose();
    this.renderer?.dispose();
  }

  updateDimensions(xCount, yCount, zCount) {
    this.xCountValue = xCount;
    this.yCountValue = yCount;
    this.zCountValue = zCount;
    this.renderPreview();
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-VIEW_SIZE / 2, VIEW_SIZE / 2, VIEW_SIZE / 2, -VIEW_SIZE / 2, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.camera.zoom = this.previewZoom();
    this.camera.updateProjectionMatrix();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.element,
      antialias: true,
      alpha: true
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.geometry = new THREE.BoxGeometry(0.56, 0.56, 0.56);
    this.material = new THREE.MeshStandardMaterial({ color: this.tensorCubeColor(), roughness: 0.48, metalness: 0.02 });
    this.group = new THREE.Group();
    this.group.rotation.set(0.46, 0.68, 0);
    this.scene.add(this.group);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2.2));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(3, 4, 5);
    this.scene.add(keyLight);
  }

  setupThemeObserver() {
    this.themeObserver = new MutationObserver(() => this.syncTheme());
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    this.syncTheme();
  }

  syncTheme() {
    this.material?.color.set(this.tensorCubeColor());
    this.renderPreview();
  }

  renderPreview() {
    this.group.clear();

    this.coordinateRange(this.countValue("x")).forEach((x) => {
      this.coordinateRange(this.countValue("y")).forEach((y) => {
        this.coordinateRange(this.countValue("z")).forEach((z) => {
          const material = this.material.clone();
          const cubelet = new THREE.Mesh(this.geometry, material);

          material.color.set(this.tensorColorForValue(this.tensorValueFor(x, y, z)));
          cubelet.position.set(x * CUBE_SPACING, y * CUBE_SPACING, z * CUBE_SPACING);
          this.group.add(cubelet);
        });
      });
    });

    this.camera.zoom = this.previewZoom();
    this.camera.updateProjectionMatrix();
    this.resize();
  }

  resize() {
    if (!this.renderer) return;

    const { width, height } = this.element.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    const aspect = nextWidth / nextHeight;

    this.renderer.setSize(nextWidth, nextHeight, false);
    this.camera.left = -VIEW_SIZE * aspect / 2;
    this.camera.right = VIEW_SIZE * aspect / 2;
    this.camera.top = VIEW_SIZE / 2;
    this.camera.bottom = -VIEW_SIZE / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  coordinateRange(count) {
    const centerOffset = (count - 1) / 2;

    return Array.from({ length: count }, (_value, index) => index - centerOffset);
  }

  countValue(axis) {
    const value = this[`${axis}CountValue`];

    return Number.isInteger(value) && value > 0 ? value : DEFAULT_COUNT;
  }

  tensorCubeColor() {
    return getComputedStyle(document.body).getPropertyValue("--tensor-cube-color").trim() || "#d8d8d8";
  }

  tensorValueFor(x, y, z) {
    const xIndex = this.coordinateRange(this.countValue("x")).indexOf(x);
    const yIndex = this.coordinateRange(this.countValue("y")).indexOf(y);
    const zIndex = this.coordinateRange(this.countValue("z")).indexOf(z);

    return this.normalizedTensorValue(this.tensorValue?.[zIndex]?.[yIndex]?.[xIndex]);
  }

  tensorColorForValue(value) {
    return TENSOR_VALUE_COLORS[value] || this.tensorCubeColor();
  }

  normalizedTensorValue(value) {
    const number = Number.parseInt(value, 10);

    if (number > 0) return 1;
    if (number < 0) return -1;
    return 0;
  }

  previewZoom() {
    const maxCount = Math.max(this.countValue("x"), this.countValue("y"), this.countValue("z"));
    const objectRadius = ((maxCount - 1) / 2) * CUBE_SPACING + 0.5;
    const fittedZoom = VIEW_SIZE / (objectRadius * 2.4);

    return THREE.MathUtils.clamp(fittedZoom, 0.55, 1.18);
  }
}
