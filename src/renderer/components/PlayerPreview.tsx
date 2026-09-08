import { useEffect, useMemo, useState } from 'react';

interface Props {
  skinDataUrl: string | null;
}

function crop(src: string, sx: number, sy: number, sw: number, sh: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = sw * 8;
      canvas.height = sh * 8;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}

export default function PlayerPreview({ skinDataUrl }: Props) {
  const [rot, setRot] = useState({ x: 0, y: 0 });
  const [parts, setParts] = useState<Record<string, string>>({});

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / 1000) * 2 - 1;
      const ny = (e.clientY / 700) * 2 - 1;
      setRot({
        y: nx * 38,
        x: -ny * 18,
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    if (!skinDataUrl) {
      setParts({});
      return;
    }
    void (async () => {
      const [head, body, arm, leg] = await Promise.all([
        crop(skinDataUrl, 8, 8, 8, 8),
        crop(skinDataUrl, 20, 20, 8, 12),
        crop(skinDataUrl, 44, 20, 4, 12),
        crop(skinDataUrl, 4, 20, 4, 12),
      ]);
      setParts({ head, body, arm, leg });
    })();
  }, [skinDataUrl]);

  const headStyle = useMemo(
    () => ({
      transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
      backgroundImage: parts.head ? `url(${parts.head})` : undefined,
      backgroundColor: parts.head ? 'transparent' : '#c68642',
    }),
    [rot, parts.head]
  );

  return (
    <div className="player-scene">
      <div className="player">
        <div className="rig">
          <div className="part head" style={headStyle} />
          <div
            className="part body"
            style={{
              backgroundImage: parts.body ? `url(${parts.body})` : undefined,
              backgroundColor: parts.body ? 'transparent' : '#2d6cdf',
            }}
          />
          <div
            className="part arm left"
            style={{
              backgroundImage: parts.arm ? `url(${parts.arm})` : undefined,
              backgroundColor: parts.arm ? 'transparent' : '#c68642',
            }}
          />
          <div
            className="part arm right"
            style={{
              backgroundImage: parts.arm ? `url(${parts.arm})` : undefined,
              backgroundColor: parts.arm ? 'transparent' : '#c68642',
            }}
          />
          <div
            className="part leg left"
            style={{
              backgroundImage: parts.leg ? `url(${parts.leg})` : undefined,
              backgroundColor: parts.leg ? 'transparent' : '#3d5a99',
            }}
          />
          <div
            className="part leg right"
            style={{
              backgroundImage: parts.leg ? `url(${parts.leg})` : undefined,
              backgroundColor: parts.leg ? 'transparent' : '#3d5a99',
            }}
          />
        </div>
      </div>
    </div>
  );
}
