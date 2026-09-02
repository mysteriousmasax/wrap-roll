import { useCallback } from 'react';
import { translate } from './translations';

export default function useTranslation(language) {
  return useCallback((key) => translate(language, key), [language]);
}