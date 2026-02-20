import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface SuccessAnimationProps {
  show: boolean;
  emoji?: string;
  message?: string;
  onComplete?: () => void;
}

const particles = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  angle: (i * 30) * (Math.PI / 180),
  distance: 60 + Math.random() * 40,
  delay: Math.random() * 0.2,
  emoji: ["⭐", "🎉", "✨", "🪙", "🏆", "💫"][Math.floor(Math.random() * 6)],
}));

export const SuccessAnimation = memo(function SuccessAnimation({ show, emoji = "✅", message, onComplete }: SuccessAnimationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute text-lg"
              initial={{ opacity: 1, x: 0, y: 0, scale: 0 }}
              animate={{
                opacity: [1, 1, 0],
                x: Math.cos(p.angle) * p.distance,
                y: Math.sin(p.angle) * p.distance,
                scale: [0, 1.2, 0.8],
              }}
              transition={{ duration: 1.2, delay: p.delay, ease: "easeOut" }}
            >
              {p.emoji}
            </motion.span>
          ))}

          <motion.div
            className="flex flex-col items-center gap-2"
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: [0, 1.3, 1], rotate: [-20, 10, 0] }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: "backOut" }}
          >
            <span className="text-6xl drop-shadow-lg">{emoji}</span>
            {message && (
              <motion.span
                className="rounded-full bg-background/90 px-4 py-1.5 text-sm font-display font-bold text-foreground shadow-lg backdrop-blur-sm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {message}
              </motion.span>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
