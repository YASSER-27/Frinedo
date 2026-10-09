import { useEffect, useRef } from 'react';
import { SkinViewer as SkinViewer3D, WalkingAnimation } from 'skinview3d';

interface Props {
  skinUrl: string;
}

export default function SkinViewer({ skinUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<SkinViewer3D | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const viewer = new SkinViewer3D({
      canvas: canvasRef.current,
      width: 220,
      height: 180,
      skin: skinUrl,
    });
    viewer.controls.enableZoom = true;
    viewer.controls.enableRotate = true;
    viewer.controls.enablePan = false;
    viewer.animation = new WalkingAnimation();
    viewer.animation.speed = 0.6;
    viewerRef.current = viewer;

    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [skinUrl]);

  return <canvas ref={canvasRef} className="skin-viewer-canvas" aria-label="3D skin preview" />;
}
