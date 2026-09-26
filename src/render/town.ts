import * as THREE from 'three';
import { random } from '../sim/random';
import type { World } from '../sim/types';

type Shape = 'box' | 'roof' | 'cone' | 'cylinder';
const roofGeometry = () => {
  const g = new THREE.BufferGeometry();
  const v = [-.5,0,-.5, .5,0,-.5, 0,1,-.5, -.5,0,.5, 0,1,.5, .5,0,.5,
    -.5,0,-.5, 0,1,-.5, 0,1,.5, -.5,0,-.5, 0,1,.5, -.5,0,.5,
    .5,0,-.5, .5,0,.5, 0,1,.5, .5,0,-.5, 0,1,.5, 0,1,-.5];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
};
interface Item { x: number; y: number; z: number; w: number; h: number; d: number; color: number; rx: number; ry: number; rz: number }

export function buildTown(scene: THREE.Scene, world: World) {
  const rng = random(world.seed + 8), groups = new Map<Shape, Item[]>();
  const wallCracks: number[] = [];
  const add = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, shape: Shape = 'box', ry = 0, rz = 0, rx = 0) => {
    const items = groups.get(shape) ?? []; items.push({ x, y, z, w, h, d, color, rx, ry, rz }); groups.set(shape, items);
  };
  const half = world.size / 2;
  add(0, -1.25, 0, world.size + 2, 2.5, world.size + 2, 0x4d524d);
  add(0, -.1, 0, world.size, .3, world.size, 0x626863);
  // Worn roads are the substrate; raised block pavements form the street grid.
  for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
    const x = -75 + col * 30, z = -75 + row * 30;
    add(x - 1, .05, z, 25, .22, 25, 0x969a8e);
    add(x - 1, .18, z, 23.9, .08, 23.9, 0x838b7b);
    for (let k = 0; k < 7; k++) {
      const px = x - 10 + rng() * 20, pz = z - 10 + rng() * 20;
      add(px, .23, pz, 1 + rng() * 4, .015, 1 + rng() * 3, rng() > .5 ? 0x7a8272 : 0x8b907e, 'box', rng());
    }
    for (let k = 0; k < 5; k++) {
      add(x + 14.8, .075, z - 11 + k * 5, .13, .02, 2.1, 0x929281);
      add(x - 11 + k * 5, .075, z + 14.8, 2.1, .02, .13, 0x929281);
    }
    if ((row + col) % 3 === 0) for (let k = 0; k < 5; k++) add(x + 12.6 + k * .9, .08, z + 9.6, .4, .02, 2.2, 0xa5a593);
  }
  const walls = [0xa2a294, 0x898e84, 0xb3ae9c, 0x929489, 0x767e76];
  const roofs = [0x515b58, 0x64675d, 0x6c6458, 0x495552, 0x686c63];
  let shopIndex = 0;
  const signs = ['LAST STOP', 'GROCERY', 'MOTEL', 'AUTO REPAIR', 'PHARMACY', 'MARKET', 'DINER'];
  for (const o of world.obstacles) {
    if (o.kind === 'building') {
      const { x, z, w, d, height: h } = o;
      const flat = h < 5;
      const ruined = o.variant === 4;
      add(x, .28, z, w + 1, .16, d + 1, 0x73796f);
      if (ruined) {
        add(x, .5, z, w, .6, d, 0x454e46);
        add(x - w / 2 + .3, h / 2 + .25, z, .6, h, d, 0x7b8075);
        add(x, h / 2 + .25, z - d / 2 + .3, w, h, .6, 0x8a8b7d);
        add(x + w / 2 - .3, h * .3, z, .6, h * .6, d, 0x777d70);
        add(x - w * .25, h * .3, z + d / 2 - .3, w * .5, h * .6, .6, 0x7c8073);
        add(x + w * .13, h * .12, z + d / 2 - .3, w * .25, h * .24, .6, 0x8b8b7c);
        for (let k = 0; k < 4; k++) {
          add(x - w * .4 + k * w * .25, h + .3, z - d * .27, .2, .25, d * .47, 0x484d41);
          add(x + (rng() - .5) * (w - 1), .8, z + (rng() - .5) * (d - 1), .7 + rng(), .6 + rng(), .8 + rng(), 0x797e70, 'box', rng() * 4, .3);
        }
        add(x + w * .1, h * .22, z + .6, .28, h * .75, .3, 0x514c3d, 'box', .3, .9);
      } else add(x, h / 2 + .25, z, w, h, d, walls[o.variant]);
      add(x, .55, z, w + .12, .55, d + .12, 0x6b746b);
      if (!ruined) add(x, h + .3, z, w + .55, .35, d + .55, 0x454e49);
      if (flat && !ruined) {
        add(x, h + .52, z, w + .1, .18, d + .1, 0x777c70);
        add(x - w / 2, h + .75, z, .3, .7, d, walls[o.variant]);
        add(x + w / 2, h + .75, z, .3, .7, d, walls[o.variant]);
        add(x, h + .75, z - d / 2, w, .7, .3, walls[o.variant]);
        add(x + 1.7, h + .85, z - 1, 2.1, .65, 1.7, 0x5b645f);
        for (let k = 0; k < 4; k++) add(x + 1.7, h + .9, z - 1.6 + k * .4, 2.13, .08, .09, 0x3c4743);
        add(x, 2.1, z + d / 2 + .05, w * .75, 2.9, .12, 0x464f4b);
        for (let k = 0; k < 8; k++) add(x, .85 + k * .31, z + d / 2 + .13, w * .75, .06, .07, 0x72796e);
        if (shopIndex % 2 === 0) makeSign(scene, signs[shopIndex % signs.length], x, h - .25, z + d / 2 + .22, w * .83);
        shopIndex++;
      } else if (!ruined) {
        const rotated = o.variant === 1;
        add(x, h + .45, z, (rotated ? d : w) + .85, 2.6, (rotated ? w : d) + .8, roofs[o.variant], 'roof', rotated ? Math.PI / 2 : 0);
        add(x - w * .22, h + 2, z - d * .25, .95, 2.1, 1, 0x76776a);
        add(x - w * .22, h + 3.1, z - d * .25, 1.12, .25, 1.18, 0x464e48);
        // Missing roof panels, patched sheet metal and collapsed masonry.
        if (o.variant % 2 === 0) {
          add(x + w * .24, h + 1.7, z + d * .18, 2.8, .12, 2.5, 0x333f3a, 'box', 0, -.55);
          add(x - w * .25, h + 1.73, z - d * .18, 2.2, .1, 3.2, 0x7d7d69, 'box', 0, .55);
        }
        for (const level of [2, h > 7 ? 5 : 2]) for (const side of [-1, 1]) {
          add(x + side * w * .26, level, z + d / 2 + .04, 1.35, 1.6, .14, 0x303e38);
          add(x + side * w * .26, level - .87, z + d / 2 + .18, 1.6, .12, .4, 0xb1ae98);
          if ((o.variant + side) % 2 === 0 || o.variant === 3) {
            add(x + side * w * .26, level, z + d / 2 + .17, 1.7, .24, .13, 0x7c7661, 'box', 0, .25);
            add(x + side * w * .26, level + .4, z + d / 2 + .18, 1.7, .24, .13, 0x726d58, 'box', 0, -.18);
          }
          add(x - w / 2 - .04, level, z + side * d * .26, .14, 1.5, 1.3, 0x34413a);
        }
        add(x, 1.25, z + d / 2 + .1, 1.1, 2.1, .16, 0x494e42);
        add(x, .27, z + d / 2 + .55, 1.6, .3, .9, 0x9b9a87);
      }
      if (!ruined) {
        const cx = x + w * .16, cz = z + d / 2 + .12;
        wallCracks.push(cx,h-.2,cz, cx-.6,h*.72,cz, cx-.6,h*.72,cz, cx+.15,h*.5,cz, cx+.15,h*.5,cz, cx-.6,h*.26,cz);
        add(x - w / 2 - .025, h * .3, z - d * .18, .04, h * .35, .4 + rng() * 1.1, 0x656f62);
        add(x + w * .3, 1.3, z + d / 2 + .08, .6, 1.5, .03, 0x7a806d);
      }
      for (let k = 0; k < 3; k++) {
        const rx = x + (rng() - .5) * w;
        add(rx, .35, z + d / 2 + .65, .35 + rng() * .5, .35 + rng() * .5, .5, 0x6f7569, 'box', rng(), rng() * .3);
      }
    } else if (o.kind === 'car') {
      // Axis-aligned chassis keeps visual and navigation footprints consistent.
      const col = [0x707768, 0x847666, 0x576765, 0x8b8a7a][o.variant];
      add(o.x, .55, o.z, 2.1, .6, 4.4, col);
      add(o.x, 1.12, o.z - .25, 1.85, .75, 2.1, col);
      add(o.x, 1.24, o.z + .82, 1.65, .48, .04, 0x293e3b);
      add(o.x, 1.24, o.z - 1.32, 1.65, .48, .04, 0x293e3b);
      add(o.x - 1, 1.17, o.z - .25, .05, .45, 1.8, 0x344740);
      add(o.x + 1, 1.17, o.z - .25, .05, .45, 1.8, 0x344740);
      add(o.x + .2, .94, o.z + 1.5, 1.5, .13, 1.1, 0x765c46, 'box', 0, 0, -.18);
      for (const side of [-1, 1]) for (const front of [-1.4, 1.4]) add(o.x + side * 1.02, .4, o.z + front, .34, .65, .65, 0x303932);
      add(o.x, .5, o.z + 2.27, 1.9, .18, .12, 0xa3a38c);
      add(o.x - .62, .69, o.z + 2.24, .4, .22, .1, 0xc6b98d);
      add(o.x + .62, .69, o.z + 2.24, .4, .22, .1, 0xc6b98d);
      if (o.variant === 1) add(o.x + 1.48, .65, o.z + .3, .12, .9, 1.3, col, 'box', -.8);
    } else if (o.kind === 'dumpster') {
      add(o.x, .7, o.z, o.w, 1.3, o.d, 0x465f54);
      add(o.x, 1.43, o.z, o.w + .15, .18, o.d + .12, 0x34483f);
      add(o.x, .8, o.z + o.d / 2 + .03, .6, .38, .05, 0xaca78e);
      add(o.x - .7, 1.54, o.z + .2, 1.1, .13, 1.15, 0x5c6555, 'box', 0, 0, -.28);
    }
  }
  // Empty civic square, dry fountain, benches and a fallen monument.
  add(-15, .25, -15, 22, .25, 22, 0x9a9c8a);
  add(-15, .5, -15, 7, .7, 7, 0x656f64, 'cylinder');
  add(-15, .88, -15, 5.8, .08, 5.8, 0x444f48, 'cylinder');
  add(-15, 1.4, -15, 1, 1.8, 1, 0x989d89, 'cylinder');
  add(-15, 2.2, -15, 3.4, .35, 3.4, 0x7a8373, 'cylinder');
  for (const dx of [-7, 7]) for (const dz of [-7, 7]) {
    add(-15 + dx, .85, -15 + dz, 3, .25, .7, 0x655f4e);
    add(-15 + dx - 1, .45, -15 + dz, .2, .8, .7, 0x3b4940);
    add(-15 + dx + 1, .45, -15 + dz, .2, .8, .7, 0x3b4940);
  }
  // Trees remain decorative outside traversable collision footprints.
  for (let i = 0; i < 80; i++) {
    const x = (rng() - .5) * (world.size - 9), z = (rng() - .5) * (world.size - 9);
    if (world.obstacles.some(o => Math.abs(o.x - x) < o.w / 2 + 1 && Math.abs(o.z - z) < o.d / 2 + 1)) continue;
    const h = 3.2 + rng() * 3;
    add(x, h / 2, z, .35, h, .35, 0x505a49, 'cylinder');
    add(x + .6, h * .68, z, .16, h * .6, .16, 0x505a49, 'cylinder', 0, -.55);
    add(x - .6, h * .75, z + .3, .13, h * .55, .13, 0x505a49, 'cylinder', .5, .65);
  }
  for (let i = 0; i < 65; i++) {
    const edge = i % 4, along = (rng() - .5) * (world.size - 6);
    const x = edge < 2 ? along : (edge === 2 ? -half + 1 : half - 1);
    const z = edge < 2 ? (edge === 0 ? -half + 1 : half - 1) : along;
    add(x, .35, z, .5 + rng() * .7, .7, .6, 0x6b7561, 'cone');
  }
  // Cracks and oil stains add detail without textures or external assets.
  const cracks: number[] = [...wallCracks];
  for (let i = 0; i < 180; i++) {
    const x = -90 + Math.floor(rng() * 7) * 30 + (rng() - .5) * 3, z = (rng() - .5) * 180;
    const dx = rng() * 1.4, dz = rng() * 2.6;
    cracks.push(x,.09,z, x+dx,.09,z+dz, x+dx,.09,z+dz, x+dx-.7,.09,z+dz+1.3);
  }
  const crackGeo = new THREE.BufferGeometry(); crackGeo.setAttribute('position', new THREE.Float32BufferAttribute(cracks, 3));
  scene.add(new THREE.LineSegments(crackGeo, new THREE.LineBasicMaterial({ color: 0x424e44, transparent: true, opacity: .55 })));
  const geometry: Record<Shape, THREE.BufferGeometry> = { box: new THREE.BoxGeometry(1, 1, 1), roof: roofGeometry(), cone: new THREE.ConeGeometry(.5, 1, 5), cylinder: new THREE.CylinderGeometry(.5, .5, 1, 8) };
  const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
  const dummy = new THREE.Object3D(), color = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  for (const [shape, items] of groups) {
    const mesh = new THREE.InstancedMesh(geometry[shape], material, items.length);
    items.forEach((o, i) => { dummy.position.set(o.x, o.y, o.z); dummy.scale.set(o.w, o.h, o.d); dummy.rotation.set(o.rx, o.ry, o.rz); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); color.setHex(o.color).getHSL(hsl); color.setHSL(hsl.h, hsl.s * .4, hsl.l); mesh.setColorAt(i, color); });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh);
  }
}

function makeSign(scene: THREE.Scene, text: string, x: number, y: number, z: number, width: number) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 80;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#465047'; ctx.fillRect(0, 0, 512, 80);
  ctx.strokeStyle = '#8e9682'; ctx.lineWidth = 3; ctx.strokeRect(5, 5, 502, 70);
  ctx.fillStyle = '#c4bea2'; ctx.font = 'bold 39px monospace'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 54);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 6.4), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
  mesh.position.set(x, y, z); scene.add(mesh);
}
