import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// FR-032 — single hook for every caller that needs to opt out of motion.
// Initial value comes from AccessibilityInfo.isReduceMotionEnabled(); the
// `reduceMotionChanged` subscription keeps it live across OS-level toggles.
// (001-wolof-translate-mobile:T111)
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (v: boolean) => {
        setReduceMotion(v);
      },
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}

export default useReduceMotion;
