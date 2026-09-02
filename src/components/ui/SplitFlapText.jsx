import { useEffect, useRef, useState } from 'react';
import './SplitFlapText.css';

function FlapCharacter({ character }) {
  const previousCharacter = useRef(character);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    if (previousCharacter.current === character) return undefined;

    previousCharacter.current = character;
    setIsFlipping(true);
    const timer = window.setTimeout(() => setIsFlipping(false), 360);
    return () => window.clearTimeout(timer);
  }, [character]);

  return (
    <span className={`split-flap-character${isFlipping ? ' is-flipping' : ''}`} aria-hidden="true">
      <span className="split-flap-face split-flap-face-top">{character}</span>
      <span className="split-flap-face split-flap-face-bottom">{character}</span>
    </span>
  );
}

export default function SplitFlapText({ text, className = '' }) {
  return (
    <span className={`split-flap-text ${className}`} aria-label={text}>
      {String(text).split('').map((character, index) => (
        <FlapCharacter key={index} character={character} />
      ))}
    </span>
  );
}