import './DepthText.css';

export default function DepthText({
  text,
  faceColor = 'currentColor',
  depthColor = '#ae002a',
  fontSize = 'inherit',
  fontWeight = 'inherit',
  shadow = true,
  className = '',
}) {
  return (
    <span
      className={`depth-text-modern ${shadow ? 'has-shadow' : ''} ${className}`}
      style={{
        '--depth-face': faceColor,
        '--depth-color': depthColor,
        '--depth-size': fontSize,
        '--depth-weight': fontWeight,
      }}
    >
      <span className="depth-text-content">{text}</span>
    </span>
  );
}