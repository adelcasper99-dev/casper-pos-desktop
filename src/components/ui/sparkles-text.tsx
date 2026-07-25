"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface SparklesTextProps {
  text: string;
  className?: string;
  sparklesCount?: number;
  colors?: {
    first: string;
    second: string;
  };
}

interface Sparkle {
  id: string;
  x: string;
  y: string;
  color: string;
  delay: number;
  scale: number;
  lifespan: number;
}

export function SparklesText({
  text,
  className = "",
  sparklesCount = 10,
  colors = { first: "#ffb829", second: "#8052ff" },
}: SparklesTextProps) {
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);

  useEffect(() => {
    const generateSparkles = () => {
      const newSparkles: Sparkle[] = [];
      for (let i = 0; i < sparklesCount; i++) {
        newSparkles.push({
          id: `sparkle-${i}-${Math.random()}`,
          x: `${Math.random() * 100}%`,
          y: `${Math.random() * 100}%`,
          color: Math.random() > 0.5 ? colors.first : colors.second,
          delay: Math.random() * 2,
          scale: Math.random() * 0.8 + 0.5,
          lifespan: Math.random() * 1.5 + 1,
        });
      }
      setSparkles(newSparkles);
    };

    generateSparkles();
    const interval = setInterval(generateSparkles, 3000);
    return () => clearInterval(interval);
  }, [sparklesCount, colors.first, colors.second]);

  return (
    <div className={`relative inline-block ${className}`}>
      <span className="relative z-10">{text}</span>
      {sparkles.map((sparkle) => (
        <motion.span
          key={sparkle.id}
          className="absolute pointer-events-none z-20 block w-2 h-2 rounded-full"
          style={{
            left: sparkle.x,
            top: sparkle.y,
            backgroundColor: sparkle.color,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, sparkle.scale, 0],
          }}
          transition={{
            duration: sparkle.lifespan,
            repeat: Infinity,
            delay: sparkle.delay,
          }}
        />
      ))}
    </div>
  );
}
