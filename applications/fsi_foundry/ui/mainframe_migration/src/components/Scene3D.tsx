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
   MATRIX GRID SHADER
   ============================================ */

const gridVertexShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vec3 pos = position;

    float wave1 = sin(pos.x * 0.6 + uTime * 0.5) * 0.4;
    float wave2 = sin(pos.z * 0.8 + uTime * 0.7) * 0.3;
    float wave3 = sin((pos.x + pos.z) * 0.4 + uTime * 0.3) * 0.2;
    pos.y += wave1 + wave2 + wave3;

    float dx = cos(pos.x * 0.6 + uTime * 0.5) * 0.6 * 0.4
             + cos((pos.x + pos.z) * 0.4 + uTime * 0.3) * 0.4 * 0.2;
    float dz = cos(pos.z * 0.8 + uTime * 0.7) * 0.8 * 0.3
             + cos((pos.x + pos.z) * 0.4 + uTime * 0.3) * 0.4 * 0.2;
    vNormal = normalize(vec3(-dx, 1.0, -dz));

    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const gridFragmentShader = `
  uniform float uTime;
  uniform vec3 uCameraPos;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);

    vec3 deepColor = vec3(0.0, 0.02, 0.0);
    vec3 shallowColor = vec3(0.0, 0.08, 0.0);
    vec3 gridColor = mix(deepColor, shallowColor, fresnel * 0.6);

    // Phosphor grid lines
    vec2 grid = abs(fract(vWorldPos.xz * 0.15) - 0.5);
    float gridLine = smoothstep(0.02, 0.0, min(grid.x, grid.y));
    gridColor += vec3(0.0, 1.0, 0.25) * gridLine * 0.12;

    // Matrix rain effect
    float rain = sin(vWorldPos.z * 2.0 + uTime * 3.0) * sin(vWorldPos.x * 0.5);
    gridColor += vec3(0.0, 0.3, 0.05) * smoothstep(0.6, 1.0, rain) * 0.1;

    vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(vNormal, halfDir), 0.0), 128.0);
    vec3 specColor = vec3(0.0, 1.0, 0.25) * spec * 1.2;

    vec3 finalColor = gridColor + specColor;

    float dist = length(vWorldPos - uCameraPos);
    float fogFactor = 1.0 - exp(-dist * 0.006);
    vec3 fogColor = vec3(0.01, 0.02, 0.01);
    finalColor = mix(finalColor, fogColor, fogFactor);

    gl_FragColor = vec4(finalColor, 0.88);
  }
`;

/* ============================================
   TERRAIN SHADER
   ============================================ */

const terrainFragmentShader = `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vHeight;
  uniform vec3 uCameraPos;

  void main() {
    vec3 rockColor = vec3(0.05, 0.12, 0.05);
    vec3 snowColor = vec3(0.2, 0.5, 0.2);
    vec3 midColor = vec3(0.03, 0.08, 0.03);
    vec3 baseColor = vec3(0.01, 0.03, 0.01);

    float h = vHeight;
    vec3 color = baseColor;
    if (h > 0.2) color = mix(baseColor, midColor, (h - 0.2) / 0.3);
    if (h > 0.5) color = mix(midColor, rockColor, (h - 0.5) / 0.25);
    if (h > 0.75) color = mix(rockColor, snowColor, (h - 0.75) / 0.25);

    vec3 lightDir = normalize(vec3(0.4, 0.8, 0.3));
    float diff = max(dot(normalize(vNormal), lightDir), 0.0);
    float ambient = 0.15;
    color *= (ambient + diff * 0.85);

    float rimDot = 1.0 - max(dot(normalize(vNormal), normalize(uCameraPos - vWorldPos)), 0.0);
    color += vec3(0.0, 0.4, 0.1) * pow(rimDot, 4.0) * 0.2;

    float dist = length(vWorldPos - uCameraPos);
    float fogFactor = 1.0 - exp(-dist * 0.005);
    vec3 fogColor = vec3(0.01, 0.02, 0.01);
    color = mix(color, fogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const terrainVertexShader = `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vHeight;

  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    vHeight = clamp(position.y / 18.0, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* ============================================
   SKY SHADER
   ============================================ */

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

    vec3 bottomColor = vec3(0.01, 0.02, 0.01);
    vec3 midColor = vec3(0.02, 0.04, 0.02);
    vec3 topColor = vec3(0.0, 0.01, 0.0);

    vec3 color = mix(bottomColor, midColor, smoothstep(0.0, 0.3, y));
    color = mix(color, topColor, smoothstep(0.3, 0.8, y));

    // Phosphor green aurora on horizon
    float horizonGlow = exp(-pow((y - 0.15) * 8.0, 2.0));
    color += vec3(0.0, 0.3, 0.05) * horizonGlow * 0.4;

    // Amber accent
    float amberGlow = exp(-pow((y - 0.2) * 6.0, 2.0));
    color += vec3(0.2, 0.14, 0.0) * amberGlow * 0.3 * (0.5 + 0.5 * dir.x);

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
    renderer.toneMappingExposure = 0.8;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010201, 0.004);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 500);
    camera.position.set(0, 12, 45);
    camera.lookAt(0, 5, 0);

    const clock = new THREE.Clock();
    const noise = createNoise(42);

    // Sky Dome
    const skyGeo = new THREE.SphereGeometry(200, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Stars (green tinted)
    const starCount = 800;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.3 + Math.random() * 0.7);
      const r = 150 + Math.random() * 40;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x88ff88,
      size: 0.6,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(starGeo, starMat));

    // Terrain
    const terrainSize = 160;
    const terrainSeg = 200;
    const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSeg, terrainSeg);
    terrainGeo.rotateX(-Math.PI / 2);

    const positions = terrainGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      let h = 0;
      h += noise(x * 0.015, z * 0.015) * 14;
      h += noise(x * 0.04, z * 0.04) * 5;
      h += noise(x * 0.1, z * 0.1) * 1.5;
      h += noise(x * 0.25, z * 0.25) * 0.5;
      const ridge = noise(x * 0.02 + 100, z * 0.02 + 100);
      h += Math.abs(ridge) * 8;
      h = Math.max(h, -0.5);
      const edgeDist = Math.max(Math.abs(x) / (terrainSize * 0.5), Math.abs(z) / (terrainSize * 0.5));
      const edgeFade = 1 - Math.pow(Math.max(edgeDist - 0.4, 0) / 0.6, 2);
      h *= edgeFade;
      positions.setY(i, h);
    }
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.ShaderMaterial({
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader,
      uniforms: { uCameraPos: { value: camera.position } },
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.position.set(0, 0, -20);
    scene.add(terrain);

    // Matrix Grid
    const gridGeo = new THREE.PlaneGeometry(300, 300, 128, 128);
    gridGeo.rotateX(-Math.PI / 2);
    const gridUniforms = { uTime: { value: 0 }, uCameraPos: { value: camera.position } };
    const gridMat = new THREE.ShaderMaterial({
      vertexShader: gridVertexShader,
      fragmentShader: gridFragmentShader,
      uniforms: gridUniforms,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.position.y = -0.5;
    scene.add(gridMesh);

    // Particles (green)
    const particleCount = 1500;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities: number[] = [];
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 120;
      particlePositions[i * 3 + 1] = Math.random() * 40;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 120;
      particleVelocities.push(
        (Math.random() - 0.5) * 0.02,
        -0.01 - Math.random() * 0.03,
        (Math.random() - 0.5) * 0.02,
      );
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x00ff41,
      size: 0.3,
      transparent: true,
      opacity: 0.4,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Neon beams
    const beamGeo = new THREE.CylinderGeometry(0.02, 0.15, 30, 8, 1, true);
    const beamMat1 = new THREE.MeshBasicMaterial({
      color: 0x00ff41,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beamMat2 = new THREE.MeshBasicMaterial({
      color: 0xffb000,
      transparent: true,
      opacity: 0.04,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const beam1 = new THREE.Mesh(beamGeo, beamMat1);
    beam1.position.set(-15, 15, -30);
    beam1.rotation.z = 0.2;
    scene.add(beam1);

    const beam2 = new THREE.Mesh(beamGeo, beamMat2);
    beam2.position.set(20, 15, -25);
    beam2.rotation.z = -0.15;
    scene.add(beam2);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x0a1a0a, 0.5);
    scene.add(ambientLight);

    const moonLight = new THREE.DirectionalLight(0x44cc44, 0.8);
    moonLight.position.set(20, 40, 30);
    scene.add(moonLight);

    const greenLight = new THREE.PointLight(0x00ff41, 2, 60);
    greenLight.position.set(-10, 8, 10);
    scene.add(greenLight);

    const amberLight = new THREE.PointLight(0xffb000, 1.5, 50);
    amberLight.position.set(15, 6, 5);
    scene.add(amberLight);

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseRef.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const baseCamPos = new THREE.Vector3(0, 12, 45);
    const camTarget = new THREE.Vector3(0, 12, 45);
    const lookTarget = new THREE.Vector3(0, 5, 0);

    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      gridUniforms.uTime.value = t;

      const autoX = Math.sin(t * 0.08) * 3;
      const autoY = Math.sin(t * 0.06) * 1.5;

      camTarget.set(
        baseCamPos.x + mouseRef.current.x * 8 + autoX,
        baseCamPos.y - mouseRef.current.y * 3 + autoY,
        baseCamPos.z,
      );
      camera.position.lerp(camTarget, 0.02);

      lookTarget.set(
        mouseRef.current.x * 4 + Math.sin(t * 0.1) * 2,
        5 + mouseRef.current.y * -2,
        0,
      );
      camera.lookAt(lookTarget);

      const pPos = particles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        let px = pPos.getX(i) + particleVelocities[i * 3] + Math.sin(t + i) * 0.005;
        let py = pPos.getY(i) + particleVelocities[i * 3 + 1];
        let pz = pPos.getZ(i) + particleVelocities[i * 3 + 2] + Math.cos(t + i) * 0.005;
        if (py < -1) {
          px = (Math.random() - 0.5) * 120;
          py = 35 + Math.random() * 5;
          pz = (Math.random() - 0.5) * 120;
        }
        pPos.setXYZ(i, px, py, pz);
      }
      pPos.needsUpdate = true;

      beam1.rotation.y = t * 0.1;
      beam2.rotation.y = -t * 0.08;
      beamMat1.opacity = 0.04 + Math.sin(t * 0.5) * 0.02;
      beamMat2.opacity = 0.03 + Math.sin(t * 0.7 + 1) * 0.015;

      greenLight.intensity = 2 + Math.sin(t * 0.8) * 0.5;
      amberLight.intensity = 1.5 + Math.sin(t * 0.6 + 2) * 0.4;

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
      style={{ zIndex: 0, pointerEvents: 'auto' }}
    />
  );
}
