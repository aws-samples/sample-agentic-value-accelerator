import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/* ============================================
   SIMPLEX NOISE (self-contained)
   ============================================ */

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const grad3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function createNoise(seed: number) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  return function noise2D(x: number, y: number): number {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = x - X0, y0 = y - Y0;
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;

    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      const gi0 = perm[ii + perm[jj]] % 12;
      n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      const gi1 = perm[ii + i1 + perm[jj + j1]] % 12;
      n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      const gi2 = perm[ii + 1 + perm[jj + 1]] % 12;
      n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  };
}

/* ============================================
   DATA LANDSCAPE SHADERS
   ============================================ */

const terrainVertexShader = `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vHeight;

  void main() {
    vec3 pos = position;
    // Subtle wave animation for data terrain
    pos.y += sin(pos.x * 0.3 + uTime * 0.4) * 0.15;
    pos.y += sin(pos.z * 0.4 + uTime * 0.3) * 0.1;

    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    vHeight = clamp(position.y / 12.0, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const terrainFragmentShader = `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vHeight;
  uniform vec3 uCameraPos;

  void main() {
    // Indigo-tinted gradient terrain
    vec3 baseColor = vec3(0.94, 0.95, 0.97);
    vec3 midColor = vec3(0.85, 0.84, 0.95);
    vec3 peakColor = vec3(0.31, 0.27, 0.90);
    vec3 topColor = vec3(0.39, 0.40, 0.95);

    float h = vHeight;
    vec3 color = baseColor;
    if (h > 0.15) color = mix(baseColor, midColor, (h - 0.15) / 0.3);
    if (h > 0.45) color = mix(midColor, peakColor, (h - 0.45) / 0.3);
    if (h > 0.75) color = mix(peakColor, topColor, (h - 0.75) / 0.25);

    // Soft directional lighting
    vec3 lightDir = normalize(vec3(0.4, 0.8, 0.3));
    float diff = max(dot(normalize(vNormal), lightDir), 0.0);
    float ambient = 0.55;
    color *= (ambient + diff * 0.45);

    // Soft indigo rim
    float rimDot = 1.0 - max(dot(normalize(vNormal), normalize(uCameraPos - vWorldPos)), 0.0);
    color += vec3(0.31, 0.27, 0.90) * pow(rimDot, 3.0) * 0.1;

    // Atmospheric fade to white
    float dist = length(vWorldPos - uCameraPos);
    float fogFactor = 1.0 - exp(-dist * 0.008);
    vec3 fogColor = vec3(0.97, 0.97, 0.99);
    color = mix(color, fogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const skyVertexShader = `
  varying vec3 vWorldDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = `
  varying vec3 vWorldDir;
  void main() {
    vec3 dir = normalize(vWorldDir);
    float y = dir.y * 0.5 + 0.5;

    // Clean white-to-light-indigo sky
    vec3 bottomColor = vec3(0.96, 0.96, 0.98);
    vec3 midColor = vec3(0.92, 0.93, 0.98);
    vec3 topColor = vec3(0.86, 0.87, 0.96);

    vec3 color = mix(bottomColor, midColor, smoothstep(0.0, 0.4, y));
    color = mix(color, topColor, smoothstep(0.4, 0.85, y));

    // Subtle indigo glow near horizon
    float horizonGlow = exp(-pow((y - 0.12) * 10.0, 2.0));
    color += vec3(0.20, 0.18, 0.45) * horizonGlow * 0.08;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/* ============================================
   MAIN SCENE COMPONENT
   ============================================ */

export default function Scene3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf8f9fc, 0.006);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 500);
    camera.position.set(0, 14, 45);
    camera.lookAt(0, 4, 0);

    const clock = new THREE.Clock();
    const noise = createNoise(88);

    // Sky Dome
    const skyGeo = new THREE.SphereGeometry(200, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Data Terrain (abstract data landscape)
    const terrainSize = 140;
    const terrainSeg = 180;
    const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSeg, terrainSeg);
    terrainGeo.rotateX(-Math.PI / 2);

    const positions = terrainGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);

      let h = 0;
      h += noise(x * 0.018, z * 0.018) * 10;
      h += noise(x * 0.045, z * 0.045) * 4;
      h += noise(x * 0.1, z * 0.1) * 1.2;
      h += noise(x * 0.22, z * 0.22) * 0.4;

      const ridge = noise(x * 0.025 + 50, z * 0.025 + 50);
      h += Math.abs(ridge) * 6;
      h = Math.max(h, -0.3);

      const edgeDist = Math.max(
        Math.abs(x) / (terrainSize * 0.5),
        Math.abs(z) / (terrainSize * 0.5)
      );
      const edgeFade = 1 - Math.pow(Math.max(edgeDist - 0.35, 0) / 0.65, 2);
      h *= edgeFade;

      positions.setY(i, h);
    }
    terrainGeo.computeVertexNormals();

    const terrainUniforms = {
      uTime: { value: 0 },
      uCameraPos: { value: camera.position },
    };

    const terrainMat = new THREE.ShaderMaterial({
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader,
      uniforms: terrainUniforms,
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.position.set(0, 0, -20);
    scene.add(terrain);

    // Floating data particles (like data points in the air)
    const particleCount = 600;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const particleVelocities: number[] = [];

    const indigoR = 79 / 255, indigoG = 70 / 255, indigoB = 229 / 255;
    const emeraldR = 16 / 255, emeraldG = 185 / 255, emeraldB = 129 / 255;
    const amberR = 245 / 255, amberG = 158 / 255, amberB = 11 / 255;

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 100;
      particlePositions[i * 3 + 1] = 2 + Math.random() * 35;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 100;
      particleVelocities.push(
        (Math.random() - 0.5) * 0.01,
        0.005 + Math.random() * 0.015,
        (Math.random() - 0.5) * 0.01,
      );

      // Mix of indigo, emerald, amber particles
      const colorChoice = Math.random();
      if (colorChoice < 0.5) {
        particleColors[i * 3] = indigoR;
        particleColors[i * 3 + 1] = indigoG;
        particleColors[i * 3 + 2] = indigoB;
      } else if (colorChoice < 0.8) {
        particleColors[i * 3] = emeraldR;
        particleColors[i * 3 + 1] = emeraldG;
        particleColors[i * 3 + 2] = emeraldB;
      } else {
        particleColors[i * 3] = amberR;
        particleColors[i * 3 + 1] = amberG;
        particleColors[i * 3 + 2] = amberB;
      }
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.35,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xe8e8f0, 0.8);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    sunLight.position.set(20, 40, 30);
    scene.add(sunLight);

    const indigoLight = new THREE.PointLight(0x4F46E5, 1.5, 80);
    indigoLight.position.set(-10, 12, 10);
    scene.add(indigoLight);

    const emeraldLight = new THREE.PointLight(0x10B981, 0.8, 60);
    emeraldLight.position.set(15, 8, 5);
    scene.add(emeraldLight);

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseRef.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Resize
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    const baseCamPos = new THREE.Vector3(0, 14, 45);
    const camTarget = new THREE.Vector3(0, 14, 45);
    const lookTarget = new THREE.Vector3(0, 4, 0);

    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      terrainUniforms.uTime.value = t;

      const autoX = Math.sin(t * 0.07) * 2.5;
      const autoY = Math.sin(t * 0.05) * 1;

      camTarget.set(
        baseCamPos.x + mouseRef.current.x * 6 + autoX,
        baseCamPos.y - mouseRef.current.y * 2 + autoY,
        baseCamPos.z,
      );
      camera.position.lerp(camTarget, 0.02);

      lookTarget.set(
        mouseRef.current.x * 3 + Math.sin(t * 0.08) * 1.5,
        4 + mouseRef.current.y * -1.5,
        0,
      );
      camera.lookAt(lookTarget);

      // Animate particles (floating data points rising)
      const pPos = particles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        let px = pPos.getX(i) + particleVelocities[i * 3] + Math.sin(t * 0.5 + i) * 0.003;
        let py = pPos.getY(i) + particleVelocities[i * 3 + 1];
        let pz = pPos.getZ(i) + particleVelocities[i * 3 + 2] + Math.cos(t * 0.5 + i) * 0.003;

        if (py > 40) {
          px = (Math.random() - 0.5) * 100;
          py = 2 + Math.random() * 3;
          pz = (Math.random() - 0.5) * 100;
        }
        pPos.setXYZ(i, px, py, pz);
      }
      pPos.needsUpdate = true;

      // Animate lights
      indigoLight.intensity = 1.5 + Math.sin(t * 0.6) * 0.3;
      emeraldLight.intensity = 0.8 + Math.sin(t * 0.5 + 1) * 0.2;

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        zIndex: 0,
        pointerEvents: 'auto',
      }}
    />
  );
}
