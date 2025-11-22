\"use client\";

import { useCallback, useEffect, useMemo, useRef, useState } from \"react\";
import * as THREE from \"three\";

type Resolution = \"720p\" | \"1080p\" | \"4k\";

const RESOLUTION_TO_SIZE: Record<Resolution, { w: number; h: number }> = {
  \"720p\": { w: 1280, h: 720 },
  \"1080p\": { w: 1920, h: 1080 },
  \"4k\": { w: 3840, h: 2160 }
};

function latLonToVector3(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.sin(lat);
  const z = -Math.cos(lat) * Math.sin(lon);
  return new THREE.Vector3(x, y, z);
}

export default function GlobeRecorder() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const earthRef = useRef<THREE.Mesh | null>(null);
  const animationRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [resolution, setResolution] = useState<Resolution>(\"1080p\");
  const [durationSec, setDurationSec] = useState<number>(10);
  const [fps, setFps] = useState<number>(30);
  const [isRecording, setIsRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const targetIndia = useMemo(() => ({ lat: 22, lon: 78 }), []);

  useEffect(() => {
    const mount = mountRef.current!;
    const canvas = document.createElement(\"canvas\");
    canvasRef.current = canvas;
    canvas.style.width = \"100%\";
    canvas.style.height = \"100%\";
    canvas.style.display = \"block\";
    mount.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000c1f, 1);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 1000);
    camera.position.set(0, 0, 4);
    cameraRef.current = camera;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 2, 5);
    scene.add(dir);

    // Stars background
    {
      const starGeo = new THREE.BufferGeometry();
      const starCount = 2000;
      const positions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const r = 80 + Math.random() * 40;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
      }
      starGeo.setAttribute(\"position\", new THREE.BufferAttribute(positions, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, sizeAttenuation: true });
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);
    }

    // Earth
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const earthGeometry = new THREE.SphereGeometry(1, 128, 128);
    const textureLoader = new THREE.TextureLoader();
    const diffuse = textureLoader.load(\"https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg\");
    diffuse.colorSpace = THREE.SRGBColorSpace;

    const earthMaterial = new THREE.MeshPhongMaterial({
      map: diffuse,
      shininess: 10,
      specular: new THREE.Color(0x222222)
    });
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    earthRef.current = earthMesh;
    earthGroup.add(earthMesh);

    // Subtle atmosphere glow
    const atmGeometry = new THREE.SphereGeometry(1.01, 64, 64);
    const atmMaterial = new THREE.MeshBasicMaterial({
      color: 0x66aaff,
      transparent: true,
      opacity: 0.12,
    });
    const atmosphere = new THREE.Mesh(atmGeometry, atmMaterial);
    earthGroup.add(atmosphere);

    const onResize = () => {
      const rect = mount.getBoundingClientRect();
      const aspect = rect.width / (rect.height || (rect.width * 9) / 16);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);
    onResize();

    let rafId = 0;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      earthGroup.rotation.y += 0.0008;
      renderer.render(scene, camera);
    };
    tick();
    animationRef.current = rafId;

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      ro.disconnect();
      renderer.dispose();
      while (mount.firstChild) mount.removeChild(mount.firstChild);
    };
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setVideoUrl(null);
    setProgress(0);
    setIsRecording(true);

    const canvas = canvasRef.current!;
    const renderer = rendererRef.current!;
    const scene = sceneRef.current!;
    const camera = cameraRef.current!;
    const earth = earthRef.current!;

    const { w, h } = RESOLUTION_TO_SIZE[resolution];
    const captureFps = fps;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const stream = canvas.captureStream(captureFps);
    recordedChunksRef.current = [];

    let mimeType = \"video/webm;codecs=vp9\";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = \"video/webm;codecs=vp8\";
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = \"video/webm\";
    }

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setIsRecording(false);
      setProgress(100);
      // Restore renderer size to container after recording
      const mount = mountRef.current!;
      const rect = mount.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    };

    // Define animation plan
    const totalFrames = Math.max(1, Math.round(durationSec * captureFps));
    const startQuaternion = earth.quaternion.clone();
    const indiaVec = latLonToVector3(targetIndia.lat, targetIndia.lon).normalize();
    const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(indiaVec, new THREE.Vector3(0, 0, 1));

    const startCamZ = 4.5;
    const endCamZ = 2.0;
    camera.position.set(0, 0, startCamZ);
    camera.lookAt(0, 0, 0);

    const clock = new THREE.Clock();
    let frame = 0;
    recorder.start();

    const renderFrame = () => {
      const t = frame / (totalFrames - 1);
      // Smooth easing (easeInOutCubic)
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      // Rotate earth so India centers
      THREE.Quaternion.slerp(startQuaternion, targetQuaternion, earth.quaternion, eased);
      // Gentle axial tilt
      earth.rotateX(THREE.MathUtils.degToRad(0.03));
      // Zoom camera inward
      const z = THREE.MathUtils.lerp(startCamZ, endCamZ, eased);
      camera.position.set(0, 0, z);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      setProgress(Math.round((frame / totalFrames) * 100));

      frame++;
      if (frame < totalFrames) {
        // Use setTimeout to pace frames approximately to fps
        setTimeout(renderFrame, 1000 / captureFps);
      } else {
        stopRecording();
      }
    };

    renderFrame();
  }, [durationSec, fps, resolution, stopRecording, targetIndia]);

  const onDownload = useCallback(() => {
    if (!videoUrl) return;
    const a = document.createElement(\"a\");
    a.href = videoUrl;
    a.download = `india-from-space-${resolution}-${durationSec}s.webm`;
    a.click();
  }, [videoUrl, resolution, durationSec]);

  return (
    <div style={{ height: \"100%\", display: \"flex\", flexDirection: \"column\" }}>
      <div className=\"controls\">
        <div className=\"control\">
          <label className=\"label\">Resolution</label>
          <select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)}>
            <option value=\"720p\">1280?720</option>
            <option value=\"1080p\">1920?1080</option>
            <option value=\"4k\">3840?2160</option>
          </select>
        </div>
        <div className=\"control\">
          <label className=\"label\">Duration (seconds)</label>
          <input
            type=\"number\"
            min={3}
            max={30}
            step={1}
            value={durationSec}
            onChange={(e) => setDurationSec(Math.max(3, Math.min(30, Number(e.target.value))))}
          />
        </div>
        <div className=\"control\">
          <label className=\"label\">Frame rate (fps)</label>
          <input
            type=\"number\"
            min={10}
            max={60}
            step={1}
            value={fps}
            onChange={(e) => setFps(Math.max(10, Math.min(60, Number(e.target.value))))}
          />
        </div>
        <div className=\"control\" style={{ alignSelf: \"end\" }}>
          <button className=\"primary\" onClick={startRecording} disabled={isRecording}>
            {isRecording ? \"Recording?\" : \"Generate Video\"}
          </button>
        </div>
      </div>

      <div style={{ padding: \"0 16px 16px 16px\" }}>
        <div style={{ height: 8, background: \"rgba(255,255,255,0.08)\", borderRadius: 999 }}>
          <div
            style={{
              width: `${progress}%`,
              height: \"8px\",
              borderRadius: 999,
              background: \"linear-gradient(90deg, var(--brand), var(--brand-2))\",
              transition: \"width .2s ease\"
            }}
          />
        </div>
        <div style={{ fontSize: 12, color: \"#9fb1e6\", marginTop: 6 }}>
          {isRecording ? `Rendering and recording (${progress}%)?` : progress > 0 ? `Progress: ${progress}%` : \"Idle\"}
        </div>
      </div>

      <div ref={mountRef} style={{ flex: 1, minHeight: 0, position: \"relative\" }} />

      <div style={{ padding: 16, display: \"grid\", gap: 12 }}>
        {error && <div style={{ color: \"#ff7b7b\" }}>{error}</div>}
        {videoUrl ? (
          <>
            <video className=\"videoPreview\" src={videoUrl} controls />
            <div>
              <button className=\"primary\" onClick={onDownload}>Download Video</button>
            </div>
          </>
        ) : (
          <div style={{ color: \"#9fb1e6\" }}>Video preview will appear here after generation.</div>
        )}
      </div>
    </div>
  );
}

