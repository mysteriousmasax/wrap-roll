import { getShiftProgress } from '../utils/shiftProgress';

export default function ShiftProgressAvatar({ staff, currentMinute, currentDate, size = 40 }) {
  const progress = getShiftProgress(staff, currentMinute, currentDate);
  const strokeWidth = Math.max(3, Math.round(size * 0.1));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const visibleProgress = progress.progress > 0 ? Math.max(progress.progress, 3) : progress.ringProgress;
  const dashOffset = circumference * (1 - visibleProgress / 100);

  return (
    <div
      role="img"
      aria-label={`${staff.name}: ${progress.label}`}
      title={`${progress.label}${progress.progress > 0 ? ` · ${progress.progress}% of scheduled shift` : ''}`}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg aria-hidden="true" className="absolute inset-0 -rotate-90" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e7e5e4" strokeWidth={strokeWidth} />
        {visibleProgress > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={progress.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        )}
      </svg>
      <div className="absolute inset-[5px] flex items-center justify-center rounded-full bg-surface-container text-xs font-bold text-surface-on-variant">
          {staff.avatar || staff.name?.slice(0, 2)?.toUpperCase()}
      </div>
    </div>
  );
}
