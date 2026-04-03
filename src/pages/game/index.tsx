import { PageContainer } from '@ant-design/pro-components';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const obstacleHalfWidth = 100;
const obstacleHalfDepth = 250;
const spawnZ = -2600;
const despawnZ = 1200;
const baseObstacleSpeed = 900;
const initialSpawnInterval = 1.2;

export default function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 500, 1100);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    const laneSpacing = { current: 360 };
    const laneCenters = [-laneSpacing.current, 0, laneSpacing.current];
    const state = {
      currentLane: 1,
      targetLane: 1,
      carHalfWidth: 80,
      carHalfDepth: 120,
      gameTime: 0,
      spawnTimer: 0,
      obstacleSpeed: baseObstacleSpeed,
      gameOver: false,
      score: 0,
    };
    let model: THREE.Object3D | null = null;
    let animationFrameId = 0;
    let disposed = false;

    const obstacles: THREE.Mesh[] = [];
    const clock = new THREE.Clock();

    const syncLaneSpacing = () => {
      laneSpacing.current = Math.max(
        300,
        obstacleHalfWidth + state.carHalfWidth + 80,
      );
      laneCenters[0] = -laneSpacing.current;
      laneCenters[1] = 0;
      laneCenters[2] = laneSpacing.current;
    };

    const fallbackGeometry = new THREE.BoxGeometry(1, 1, 1);
    const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x1677ff });
    const fallbackPlayer = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
    fallbackPlayer.position.set(0, -2.5, 0);
    scene.add(fallbackPlayer);
    model = fallbackPlayer;

    const loader = new GLTFLoader();
    loader.load(
      '/model/old_rusty_car.glb',
      (gltf) => {
        if (disposed) return;

        scene.remove(fallbackPlayer);
        fallbackGeometry.dispose();
        fallbackMaterial.dispose();

        model = gltf.scene;
        model.position.set(0, -0.25, 0);

        const carBounds = new THREE.Box3().setFromObject(model);
        const carSize = new THREE.Vector3();
        carBounds.getSize(carSize);
        state.carHalfWidth = THREE.MathUtils.clamp(carSize.x * 0.45, 40, 160);
        state.carHalfDepth = THREE.MathUtils.clamp(carSize.z * 0.45, 60, 220);
        syncLaneSpacing();

        scene.add(model);
      },
      undefined,
      () => {
        syncLaneSpacing();
      },
    );

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    const textureLoader = new THREE.TextureLoader();
    const backgroundTexture = textureLoader.load(
      '/asphault.webp',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        scene.background = texture;
      },
      undefined,
      undefined,
    );

    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({
      map: backgroundTexture,
      roughness: 0.8,
      metalness: 0.2,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3;
    scene.add(ground);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const hdriLoader = new RGBELoader();
    hdriLoader.load('/derelict_airfield_01_1k.hdr', (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }

      const envMap = pmremGenerator.fromEquirectangular(texture).texture;
      scene.environment = envMap;
      texture.dispose();
      pmremGenerator.dispose();
    });

    const color = textureLoader.load('/texture/paper_0025_color_1k.jpg');
    const roughness = textureLoader.load('/texture/paper_0025_roughness_1k.jpg');
    const normal = textureLoader.load('/texture/paper_0025_normal_opengl_1k.png');
    color.colorSpace = THREE.SRGBColorSpace;

    const obstacleGeometry = new THREE.BoxGeometry(200, 100, 500, 100, 100);
    const obstacleMaterial = new THREE.MeshStandardMaterial({
      map: color,
      roughnessMap: roughness,
      normalMap: normal,
    });

    for (let index = 0; index < 3; index += 1) {
      const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
      obstacle.visible = false;
      obstacle.userData.active = false;
      obstacle.userData.lane = 1;
      obstacles.push(obstacle);
      scene.add(obstacle);
    }

    const spawnWave = () => {
      const inactive = obstacles.filter((obstacle) => !obstacle.userData.active);
      if (inactive.length === 0) return;

      const activeCount = obstacles.length - inactive.length;
      if (activeCount >= 2) return;

      const spawnCount = Math.min(
        2 - activeCount,
        1 + Math.floor(Math.random() * 2),
        inactive.length,
      );
      const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);

      for (let index = 0; index < spawnCount; index += 1) {
        const obstacle = inactive[index];
        const lane = lanes[index];
        obstacle.position.set(laneCenters[lane], 50, spawnZ);
        obstacle.userData.active = true;
        obstacle.userData.lane = lane;
        obstacle.visible = true;
      }
    };

    const resetGame = () => {
      state.gameOver = false;
      state.gameTime = 0;
      state.score = 0;
      state.spawnTimer = 0;
      state.obstacleSpeed = baseObstacleSpeed;
      state.currentLane = 1;
      state.targetLane = 1;

      setGameOver(false);
      setScore(0);

      for (const obstacle of obstacles) {
        obstacle.visible = false;
        obstacle.userData.active = false;
        obstacle.position.set(0, 50, spawnZ);
      }

      if (model) {
        model.position.x = laneCenters[1];
      }

      spawnWave();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        state.targetLane = Math.max(0, state.targetLane - 1);
      } else if (event.key === 'ArrowRight') {
        state.targetLane = Math.min(2, state.targetLane + 1);
      } else if ((event.key === 'r' || event.key === 'R') && state.gameOver) {
        resetGame();
      }
    };

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      animationFrameId = window.requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (model) {
        model.rotation.y = Math.PI;

        const targetX = laneCenters[state.targetLane];
        const laneMoveSpeed = 700;
        const dx = targetX - model.position.x;
        const step = laneMoveSpeed * delta;

        if (Math.abs(dx) <= step) {
          model.position.x = targetX;
          state.currentLane = state.targetLane;
        } else {
          model.position.x += Math.sign(dx) * step;
        }

        if (!state.gameOver) {
          state.gameTime += delta;
          state.obstacleSpeed = Math.min(
            baseObstacleSpeed + state.gameTime * 45,
            1800,
          );
          state.spawnTimer += delta;

          const spawnInterval = Math.max(0.45, initialSpawnInterval - state.gameTime * 0.02);
          const activeCount = obstacles.filter((obstacle) => obstacle.userData.active).length;
          if (state.spawnTimer >= spawnInterval && activeCount < 2) {
            spawnWave();
            state.spawnTimer = 0;
          }

          for (const obstacle of obstacles) {
            if (!obstacle.userData.active) continue;

            obstacle.position.z += state.obstacleSpeed * delta;

            if (obstacle.position.z > despawnZ) {
              obstacle.userData.active = false;
              obstacle.visible = false;
              state.score += 1;
              setScore(state.score);
              continue;
            }

            const offsetX = Math.abs(obstacle.position.x - model.position.x);
            const offsetZ = Math.abs(obstacle.position.z - model.position.z);
            const overlapX = offsetX < obstacleHalfWidth + state.carHalfWidth;
            const overlapZ = offsetZ < obstacleHalfDepth + state.carHalfDepth;

            if (overlapX && overlapZ) {
              state.gameOver = true;
              setGameOver(true);
            }
          }
        }
      }

      renderer.render(scene, camera);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', resize);
    resize();
    resetGame();
    animate();

    return () => {
      disposed = true;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(animationFrameId);

      for (const obstacle of obstacles) {
        scene.remove(obstacle);
      }
      scene.remove(ground);
      if (model) {
        scene.remove(model);
      }

      obstacleGeometry.dispose();
      obstacleMaterial.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <PageContainer>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 'calc(100vh - 200px)',
          minHeight: 480,
          borderRadius: 12,
          overflow: 'hidden',
          background: '#0f172a',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            zIndex: 2,
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            fontSize: 18,
            fontWeight: 700,
            textShadow: '0 2px 6px rgba(0,0,0,0.9)',
          }}
        >
          Score: {score} {gameOver ? '| GAME OVER (Press R to restart)' : ''}
        </div>
      </div>
    </PageContainer>
  );
}