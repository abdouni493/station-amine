import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import { cn } from '../lib/utils';

export const useRtl = () => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';

  const rtlCn = useCallback(
    (...inputs: any[]) => {
      const classes = cn(...inputs);
      if (!isRtl) return classes;

      // Basic RTL replacements for common Tailwind classes
      return classes
        .replace(/\bml-/g, 'mr-')
        .replace(/\bmr-/g, 'ml-')
        .replace(/\bpl-/g, 'pr-')
        .replace(/\bpr-/g, 'pl-')
        .replace(/\bright-/g, 'left-')
        .replace(/\bleft-/g, 'right-')
        .replace(/\btext-left\b/g, 'text-right')
        .replace(/\btext-right\b/g, 'text-left')
        .replace(/\bflex-row\b/g, 'flex-row-reverse')
        .replace(/\brounded-l-/g, 'rounded-r-TEMP')
        .replace(/\brounded-r-/g, 'rounded-l-')
        .replace(/rounded-r-TEMP/g, 'rounded-r-')
        .replace(/\bborder-l-/g, 'border-r-TEMP')
        .replace(/\bborder-r-/g, 'border-l-')
        .replace(/border-r-TEMP/g, 'border-r-');
    },
    [isRtl]
  );

  return { isRtl, rtlCn };
};
