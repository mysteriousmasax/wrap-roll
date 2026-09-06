import { useEffect, useMemo, useRef, useState } from 'react';
import './DriftWall.css';

const columnFactor = (index, variance) => {
  const pseudo = ((index * 0.6180339887 + 0.35) % 1) * 2 - 1;
  return 1 + variance * pseudo;
};

export default function DriftWall({
  items = [],
  columns = 4,
  tileWidth = 250,
  tileHeight = 210,
  gap = 18,
  radius = 22,
  perspective = 1200,
  depth = 80,
  speed = 28,
  direction = 'up',
  variance = 0.35,
  pauseOnHover = true,
  className = '',
  onTileClick,
}) {
  const containerRef = useRef(null);
  const planeRef = useRef(null);
  const trackRefs = useRef([]);
  const offsetsRef = useRef([]);
  const lastTimestampRef = useRef(null);
  const dragRef = useRef({ active: false, lastY: 0 });
  const [containerHeight, setContainerHeight] = useState(600);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hovered, setHovered] = useState(false);

  const columnItems = useMemo(() => {
    const nextColumns = Array.from({ length: columns }, () => []);
    items.forEach((item, index) => nextColumns[index % columns].push(item));
    return nextColumns.map((column) => (column.length ? column : items.slice(0, 1)));
  }, [columns, items]);

  const columnMeta = useMemo(() => columnItems.map((column) => ({
    copyHeight: Math.max(tileHeight + gap, column.length * (tileHeight + gap)),
    copies: Math.max(2, Math.ceil((containerHeight * 1.7) / Math.max(tileHeight + gap, column.length * (tileHeight + gap))) + 1),
  })), [columnItems, containerHeight, gap, tileHeight]);

  const velocities = useMemo(() => columnItems.map((_, index) => {
    const baseDirection = direction === 'up' ? 1 : -1;
    return speed * columnFactor(index, variance) * baseDirection * (index % 2 === 0 ? 1 : -1);
  }), [columnItems, direction, speed, variance]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(mediaQuery.matches);
    updateMotion();
    mediaQuery.addEventListener('change', updateMotion);
    return () => mediaQuery.removeEventListener('change', updateMotion);
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setContainerHeight(entry.contentRect.height || 600));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    offsetsRef.current = columnMeta.map((meta, index) => meta.copyHeight * ((index * 0.37) % 1));
  }, [columnMeta]);

  const shiftTracks = (delta) => {
    trackRefs.current.forEach((track, index) => {
      const meta = columnMeta[index];
      if (!track || !meta) return;
      const nextOffset = ((offsetsRef.current[index] + delta) % meta.copyHeight + meta.copyHeight) % meta.copyHeight;
      offsetsRef.current[index] = nextOffset;
      track.style.transform = `translate3d(0, ${-nextOffset}px, 0)`;
    });
  };

  const handleWheel = (event) => {
    event.preventDefault();
    setHovered(true);
    shiftTracks(event.deltaY);
  };

  const handlePointerDown = (event) => {
    dragRef.current = { active: true, lastY: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current.active) return;
    shiftTracks(dragRef.current.lastY - event.clientY);
    dragRef.current.lastY = event.clientY;
  };

  const handlePointerUp = (event) => {
    dragRef.current.active = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  useEffect(() => {
    let animationFrame;
    const animate = (timestamp) => {
      const previous = lastTimestampRef.current ?? timestamp;
      const elapsed = Math.min(0.05, Math.max(0, timestamp - previous) / 1000);
      lastTimestampRef.current = timestamp;

      if (!reducedMotion && !(pauseOnHover && hovered)) {
        trackRefs.current.forEach((track, index) => {
          const meta = columnMeta[index];
          if (!track || !meta) return;
          const nextOffset = ((offsetsRef.current[index] + velocities[index] * elapsed) % meta.copyHeight + meta.copyHeight) % meta.copyHeight;
          offsetsRef.current[index] = nextOffset;
          track.style.transform = `translate3d(0, ${-nextOffset}px, 0)`;
        });
      }

      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrame);
      lastTimestampRef.current = null;
    };
  }, [columnMeta, hovered, pauseOnHover, reducedMotion, velocities]);

  return (
    <div
      ref={containerRef}
      className={`drift-wall ${className}`.trim()}
      style={{ '--dw-tile-w': `${tileWidth}px`, '--dw-tile-h': `${tileHeight}px`, '--dw-gap': `${gap}px`, '--dw-radius': `${radius}px`, '--dw-perspective': `${perspective}px`, '--dw-depth': `${depth}px` }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      role="region"
      aria-label="All menu items"
    >
      <div ref={planeRef} className="drift-wall__plane">
        {columnItems.map((column, columnIndex) => (
          <div className="drift-wall__column" key={`column-${columnIndex}`}>
            <div className="drift-wall__track" ref={(element) => { trackRefs.current[columnIndex] = element; }}>
              {Array.from({ length: columnMeta[columnIndex]?.copies || 2 }).flatMap((_, copyIndex) => column.map((item, itemIndex) => (
                <button
                  type="button"
                  className="drift-wall__tile"
                  key={`${columnIndex}-${copyIndex}-${item.id || itemIndex}`}
                  onClick={() => onTileClick?.(item)}
                  aria-label={`View ${item.name}`}
                >
                  <span className="drift-wall__inner">
                    <img src={item.image} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false" />
                    <span className="drift-wall__caption">{item.name}</span>
                  </span>
                </button>
              )))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
