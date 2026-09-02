import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import './RotatingText.css';

function splitText(text, splitBy) {
  if (splitBy === 'lines') return String(text).split('\n');
  if (splitBy === 'words') return String(text).split(' ');
  if (splitBy === 'characters') return Array.from(String(text));
  return String(text).split(splitBy);
}

const RotatingText = forwardRef(function RotatingText({
  texts = [],
  rotationInterval = 2000,
  staggerDuration = 0,
  staggerFrom = 'first',
  loop = true,
  auto = true,
  splitBy = 'characters',
  onNext,
  mainClassName = '',
  splitLevelClassName = '',
  elementLevelClassName = '',
  ...rest
}, ref) {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const hasTexts = texts.length > 0;
  const currentText = hasTexts ? String(texts[currentTextIndex] ?? '') : '';

  const changeIndex = useCallback((nextIndex) => {
    setCurrentTextIndex((index) => {
      if (nextIndex === index) return index;
      onNext?.(nextIndex);
      return nextIndex;
    });
  }, [onNext]);

  const next = useCallback(() => {
    if (!hasTexts) return;
    const nextIndex = currentTextIndex === texts.length - 1 ? (loop ? 0 : currentTextIndex) : currentTextIndex + 1;
    changeIndex(nextIndex);
  }, [changeIndex, currentTextIndex, hasTexts, loop, texts.length]);

  const previous = useCallback(() => {
    if (!hasTexts) return;
    const previousIndex = currentTextIndex === 0 ? (loop ? texts.length - 1 : 0) : currentTextIndex - 1;
    changeIndex(previousIndex);
  }, [changeIndex, currentTextIndex, hasTexts, loop, texts.length]);

  const jumpTo = useCallback((index) => {
    if (!hasTexts) return;
    changeIndex(Math.max(0, Math.min(index, texts.length - 1)));
  }, [changeIndex, hasTexts, texts.length]);

  const reset = useCallback(() => changeIndex(0), [changeIndex]);

  useImperativeHandle(ref, () => ({ next, previous, jumpTo, reset }), [jumpTo, next, previous, reset]);

  useEffect(() => {
    if (!auto || !hasTexts || texts.length < 2) return undefined;
    const intervalId = window.setInterval(next, rotationInterval);
    return () => window.clearInterval(intervalId);
  }, [auto, hasTexts, next, rotationInterval, texts.length]);

  const elements = splitText(currentText, splitBy);
  const getDelayIndex = (index) => {
    if (staggerFrom === 'last') return elements.length - 1 - index;
    if (staggerFrom === 'center') return Math.abs(Math.floor(elements.length / 2) - index);
    return index;
  };

  return (
    <span className={`text-rotate ${mainClassName}`} {...rest}>
      <span className="text-rotate-sr-only">{currentText}</span>
      <span key={currentTextIndex} className={`text-rotate-track ${splitBy === 'lines' ? 'text-rotate-lines' : ''} ${splitBy === 'words' ? 'text-rotate-words' : ''}`} aria-hidden="true">
        {elements.map((element, index) => (
          <span key={`${currentTextIndex}-${index}`} className={`text-rotate-element-wrap ${splitLevelClassName}`}>
            <span className={`text-rotate-element ${elementLevelClassName}`} style={{ animationDelay: `${getDelayIndex(index) * staggerDuration}s` }}>{element}</span>
          </span>
        ))}
      </span>
    </span>
  );
});

RotatingText.displayName = 'RotatingText';

export default RotatingText;