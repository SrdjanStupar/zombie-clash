import * as THREE from 'three';
import type { Agent } from '../sim/types';

const PARTS = 18;
export class Characters {
  readonly mesh: THREE.InstancedMesh;
  readonly markers: THREE.InstancedMesh;
  private root = new THREE.Object3D();
  private part = new THREE.Object3D();
  private joint = new THREE.Object3D();
  private matrix = new THREE.Matrix4();
  private color = new THREE.Color();
  readonly selection: THREE.Mesh;
  constructor(scene: THREE.Scene, count: number) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: .92, flatShading: true }), count * PARTS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.castShadow = true; this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.markers = new THREE.InstancedMesh(new THREE.RingGeometry(.59, .78, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: .7, depthWrite: false }), count);
    this.markers.frustumCulled = false; scene.add(this.markers);
    this.selection = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.35, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf1dfb2, depthTest: false, transparent: true, opacity: .9 }));
    this.selection.renderOrder = 4; this.selection.visible = false; scene.add(this.selection);
  }
  update(agents: Agent[], time: number, selected: number | null, ended = false) {
    for (let index = 0; index < agents.length; index++) {
      const a = agents[index], human = a.faction === 'human', dead = a.state === 'dead', turning = a.state === 'turning';
      const gait = a.distance * 4.5, walk = a.moving ? Math.sin(gait) * .55 : Math.sin(time * 1.7 + a.id) * .025;
      const attack = time - a.attackStarted, swinging = attack >= 0 && attack < .8;
      const bite = !human && swinging && (a.id + Math.round(a.attackStarted)) % 2 === 0 ? Math.sin(attack / .8 * Math.PI) : 0;
      const hit = Math.max(0, 1 - (time - a.hitAt) / .32);
      const death = ended ? 1 : Math.min(1, Math.max(0, (time - a.deathAt) / .7));
      const transform = turning ? Math.min(1, (time - a.stateSince) / 4) : 0;
      this.root.position.set(a.x, dead ? .25 : .22 + (a.moving ? Math.abs(Math.sin(gait)) * .05 : 0), a.z);
      this.root.rotation.set(dead ? -Math.PI / 2 * death : turning ? -.9 * Math.sin(transform * Math.PI) : hit * -.18 + bite * .2, a.heading, turning && transform < 1 ? Math.sin(time * 18) * .08 : 0);
      this.root.scale.setScalar(1.2); this.root.updateMatrix();
      const skin = dead ? 0x6c7161 : human ? (a.id % 3 === 0 ? 0xb4977c : 0xc2ac8b) : 0x9ba486;
      const shirt = dead ? 0x616b59 : human ? [0xa29876, 0x8e9174, 0xbaa58a, 0x788978][a.id % 4] : [0x697769, 0x747b65, 0x7c756b][a.id % 3];
      const pants = human ? 0x424f49 : 0x505d50;
      let partIndex = 0;
      const part = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, rx = 0, rz = 0, joint?: { x: number; y: number; z: number; rx: number; rz: number }) => {
        this.part.position.set(x, y, z); this.part.scale.set(w, h, d); this.part.rotation.set(rx, 0, rz); this.part.updateMatrix();
        if (joint) {
          this.joint.position.set(joint.x, joint.y, joint.z); this.joint.rotation.set(joint.rx, 0, joint.rz); this.joint.scale.setScalar(1); this.joint.updateMatrix();
          this.matrix.multiplyMatrices(this.root.matrix, this.joint.matrix).multiply(this.part.matrix);
        } else this.matrix.multiplyMatrices(this.root.matrix, this.part.matrix);
        const id = index * PARTS + partIndex++; this.mesh.setMatrixAt(id, this.matrix); this.mesh.setColorAt(id, this.color.setHex(color));
      };
      part(0, 1.15, human ? 0 : .07, .58, .72, .34, shirt, human ? 0 : .18);
      part(0, 1.76 - bite * .13, human ? 0 : .19 + bite * .13, .38, .44, .36, skin, human ? -.02 : .17 - bite * .3);
      part(0, 1.97, human ? -.025 : .15, .4, .12, .38, human ? 0x4c4d3f : 0x53604a);
      part(0, 1.79, human ? .188 : .375, .26, .045, .025, human ? 0x403e32 : 0x4d342b);
      part(0, 1.66, human ? .185 : .375, human ? .09 : .18, .055, .025, human ? skin : 0xc6b995);
      part(0, .78, 0, .51, .2, .32, pants);
      for (const side of [-1, 1]) {
        const leg = { x: side * .155, y: .8, z: 0, rx: side * walk, rz: 0 };
        part(0, -.32, 0, .22, .65, .24, pants, 0, 0, leg);
        part(0, -.64, .07, .25, .16, .36, 0x343d34, 0, 0, leg);
      }
      const right = { x: -.4, y: 1.43, z: 0, rx: human ? -walk : -.65 + walk * .3, rz: .08 };
      if (swinging) { right.rx = human ? -2.3 + Math.min(1, attack / .6) * 3 : -1.7 + Math.min(1, attack / .6) * 1.9; right.rz = human ? -.45 * Math.sin(attack * 6) : .2; }
      part(0, -.24, 0, .2, .48, .22, shirt, 0, 0, right);
      part(0, -.52, 0, .17, .16, .19, skin, 0, 0, right);
      const left = { x: .4, y: 1.43, z: 0, rx: human ? walk : -.9 - walk * .3, rz: -.12 };
      part(0, -.24, 0, .2, .48, .22, shirt, 0, 0, left);
      part(0, -.52, 0, .17, .16, .19, skin, 0, 0, left);
      part(0, -.52, .16, .1, .13, .32, human ? 0x3e4439 : skin, 0, 0, right);
      part(0, -.52, human ? .62 : .33, human ? .14 : .19, .055, human ? .63 : .16, human ? 0xc6ccbf : 0xc9bea0, 0, 0, right);
      part(0, 1.22, -.28, human ? .42 : .001, .5, .24, 0x665f48);
      part(.12, 1.35, .2, .075, .13, .025, human ? 0xd1b475 : 0x75604d);
      this.part.position.set(a.x, .31, a.z); this.part.scale.setScalar(dead ? 0 : 1); this.part.rotation.set(0, 0, 0); this.part.updateMatrix();
      this.markers.setMatrixAt(index, this.part.matrix); this.markers.setColorAt(index, this.color.setHex(human ? 0xddc382 : 0xb66e56));
      if (a.id === selected) { this.selection.visible = true; this.selection.position.set(a.x, .34, a.z); }
    }
    if (selected === null) this.selection.visible = false;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.markers.instanceMatrix.needsUpdate = true; if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
  }
  agentFromInstance(id: number) { return Math.floor(id / PARTS); }
}
