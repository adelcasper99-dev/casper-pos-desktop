import { useCallback } from 'react';

/**
 * Custom hook to generalize "Enter to next" keyboard navigation.
 * Can be used on inputs, selects, and textareas.
 */
export function useKeyboardNavigation() {
  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number, totalItems: number, onComplete?: () => void) => {
    if (e.key === 'Enter') {
      // Don't prevent default for textareas unless we want to submit
      if (e.currentTarget.tagName === 'TEXTAREA' && e.shiftKey) return;

      e.preventDefault();
      
      if (index < totalItems - 1) {
        // Move to next input by data-index
        const nextInput = document.querySelector(`[data-nav-index="${index + 1}"]`) as HTMLElement;
        if (nextInput) {
          nextInput.focus();
          if (nextInput instanceof HTMLInputElement) {
            nextInput.select();
          }
        }
      } else if (onComplete) {
        onComplete();
      }
    }
  }, []);

  const getNavProps = (index: number) => ({
    'data-nav-index': index,
  });

  return { handleKeyDown, getNavProps };
}
