import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Simulation } from '../sim/simulation';
import { buildTown } from './town';
import { Characters } from './characters';

export class TownScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-150, 150, 110, -110, .1, 1000);
  readonly controls: OrbitControls;
  readonly characters: Characters;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private down = { x: 0, y: 0 };
  private blood: THREE.InstancedMesh;
  private bloodSeen = new Map<number, number>();
  private dummy = new THREE.Object3D();
  private stain = 0;
  onSelect: (id: number | null) => void = () => {};
  constructor(readonly element: HTMLElement, readonly sim: Simulation) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    this.renderer.setClearColor(0xaeb2ae); this.scene.background = new THREE.Color(0xaeb2ae);
    this.scene.fog = new THREE.Fog(0xaeb2ae, 310, 650);
    element.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D town. Drag to rotate, right-drag to pan, scroll to zoom, click a character to inspect.');
    this.renderer.domElement.tabIndex = 0;
    this.scene.add(new THREE.HemisphereLight(0xe5e8e5, 0x505852, 2.3));
    const sun = new THREE.DirectionalLight(0xf0eee5, 2.7); sun.position.set(-80, 160, 60);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -145; sun.shadow.camera.right = 145; sun.shadow.camera.top = 145; sun.shadow.camera.bottom = -145;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 350; sun.shadow.normalBias = .35; sun.shadow.bias = -.0002;
    this.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: 0xa4aaa3, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -2.55; ground.receiveShadow = true; this.scene.add(ground);
    buildTown(this.scene, sim.world);
    this.characters = new Characters(this.scene, sim.agents.length);
    this.blood = new THREE.InstancedMesh(new THREE.CircleGeometry(.32, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x633e30, transparent: true, opacity: .46, depthWrite: false }), 300);
    this.blood.count = 0; this.blood.frustumCulled = false; this.scene.add(this.blood);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .12;
    this.controls.minPolarAngle = .4; this.controls.maxPolarAngle = Math.PI / 2.7;
    this.controls.minZoom = .8; this.controls.maxZoom = 9;
    this.controls.maxTargetRadius = 115; this.controls.screenSpacePanning = false;
    this.controls.rotateSpeed = .45; this.controls.panSpeed = .8;
    this.resetCamera();
    this.renderer.domElement.addEventListener('pointerdown', e => { this.down = { x: e.clientX, y: e.clientY }; });
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (e.button !== 0 || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return;
      const bounds = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set((e.clientX - bounds.left) / bounds.width * 2 - 1, -(e.clientY - bounds.top) / bounds.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObject(this.characters.mesh)[0];
      if (hit && hit.instanceId !== undefined) { this.onSelect(this.sim.agents[this.characters.agentFromInstance(hit.instanceId)].id); return; }
      // Screen-space hit area keeps miniature characters selectable at the town overview.
      const p = new THREE.Vector3(); let best = 12, id: number | null = null;
      for (const a of this.sim.agents) {
        if (a.state === 'dead') continue;
        p.set(a.x, 1.5, a.z).project(this.camera);
        const d = Math.hypot((p.x - this.pointer.x) * bounds.width / 2, (p.y - this.pointer.y) * bounds.height / 2);
        if (d < best) { best = d; id = a.id; }
      }
      this.onSelect(id);
    });
    new ResizeObserver(() => this.resize()).observe(element); this.resize();
  }
  resetCamera() {
    this.controls.target.set(0, 0, 0); this.camera.position.set(180, 170, 180); this.camera.zoom = 1; this.camera.updateProjectionMatrix(); this.controls.update();
  }
  zoom(factor: number) { this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, .8, 9); this.camera.updateProjectionMatrix(); }
  focus(id: number) {
    const a = this.sim.agents.find(b => b.id === id); if (!a) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.set(a.x, 0, a.z); this.camera.position.copy(this.controls.target).add(offset); this.camera.zoom = 4.5; this.camera.updateProjectionMatrix(); this.controls.update();
  }
  resize() {
    const width = this.element.clientWidth, height = this.element.clientHeight, aspect = width / Math.max(1, height);
    const vertical = Math.max(212, 285 / aspect);
    this.camera.left = -vertical * aspect / 2; this.camera.right = vertical * aspect / 2; this.camera.top = vertical / 2; this.camera.bottom = -vertical / 2;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height);
  }
  resetEffects() { this.blood.count = 0; this.stain = 0; this.bloodSeen.clear(); }
  render(sim: Simulation, selected: number | null) {
    for (const a of sim.agents) if (a.hitAt > 0 && this.bloodSeen.get(a.id) !== a.hitAt) {
      this.bloodSeen.set(a.id, a.hitAt);
      this.dummy.position.set(a.x + Math.sin(a.id) * .4, .315, a.z); this.dummy.rotation.set(0, a.id, 0); this.dummy.scale.set(1, 1, .65); this.dummy.updateMatrix();
      this.blood.setMatrixAt(this.stain++ % 300, this.dummy.matrix); this.blood.count = Math.min(300, this.stain); this.blood.instanceMatrix.needsUpdate = true;
    }
    this.characters.update(sim.agents, sim.time, selected, !!sim.outcome);
    this.controls.update();
    this.element.parentElement?.classList.toggle('is-close', this.camera.zoom > 1.7);
    const target = this.controls.target, dx = THREE.MathUtils.clamp(target.x, -94, 94) - target.x, dz = THREE.MathUtils.clamp(target.z, -94, 94) - target.z;
    target.x += dx; target.z += dz; this.camera.position.x += dx; this.camera.position.z += dz;
    this.renderer.render(this.scene, this.camera);
  }
}
