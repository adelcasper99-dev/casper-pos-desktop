"use client";

import React, { ElementType } from "react";
import { AnimatePresence, motion, HTMLMotionProps, Variants } from "framer-motion";

type AnimationType =
  | "fadeIn"
  | "blurIn"
  | "blurInUp"
  | "blurInDown"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight"
  | "scaleUp"
  | "scaleDown";

type AnimationVariant = "word" | "character" | "line";

export interface TextAnimateProps extends HTMLMotionProps<"p"> {
  /**
   * The text content to animate
   */
  children: string;
  /**
   * The HTML element to render
   * @default "p"
   */
  as?: ElementType;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Animation pattern
   * @default "fadeIn"
   */
  animation?: AnimationType;
  /**
   * Split mode: word, character, or line
   * @default "word"
   */
  by?: AnimationVariant;
  /**
   * Delay before animation starts (seconds)
   * @default 0
   */
  delay?: number;
  /**
   * Duration of each item animation (seconds)
   * @default 0.3
   */
  duration?: number;
  /**
   * Stagger delay between items (seconds)
   * @default 0.05
   */
  staggerDelay?: number;
}

const defaultVariants: Record<AnimationType, { container: Variants; item: Variants }> = {
  fadeIn: {
    container: {
      hidden: { opacity: 0 },
      show: (i = 1) => ({
        opacity: 1,
        transition: { staggerChildren: 0.05 * i, delayChildren: 0 },
      }),
    },
    item: {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { duration: 0.3 } },
    },
  },
  blurIn: {
    container: {
      hidden: { opacity: 0 },
      show: (i = 1) => ({
        opacity: 1,
        transition: { staggerChildren: 0.05 * i, delayChildren: 0 },
      }),
    },
    item: {
      hidden: { opacity: 0, filter: "blur(10px)" },
      show: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.3 } },
    },
  },
  blurInUp: {
    container: {
      hidden: { opacity: 0 },
      show: (i = 1) => ({
        opacity: 1,
        transition: { staggerChildren: 0.05 * i, delayChildren: 0 },
      }),
    },
    item: {
      hidden: { opacity: 0, filter: "blur(10px)", y: 20 },
      show: { opacity: 1, filter: "blur(0px)", y: 0, transition: { duration: 0.3 } },
    },
  },
  blurInDown: {
    container: {
      hidden: { opacity: 0 },
      show: (i = 1) => ({
        opacity: 1,
        transition: { staggerChildren: 0.05 * i, delayChildren: 0 },
      }),
    },
    item: {
      hidden: { opacity: 0, filter: "blur(10px)", y: -20 },
      show: { opacity: 1, filter: "blur(0px)", y: 0, transition: { duration: 0.3 } },
    },
  },
  slideUp: {
    container: {
      hidden: { opacity: 0 },
      show: (i = 1) => ({
        opacity: 1,
        transition: { staggerChildren: 0.05 * i, delayChildren: 0 },
      }),
    },
    item: {
      hidden: { opacity: 0, y: 20 },
      show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    },
  },
  slideDown: {
    container: {
      hidden: { opacity: 0 },
      show: (i = 1) => ({
        opacity: 1,
        transition: { staggerChildren: 0.05 * i, delayChildren: 0 },
      }),
    },
    item: {
      hidden: { opacity: 0, y: -20 },
      show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    },
  },
  slideLeft: {
    container: {
      hidden: { opacity: 0 },
      show: (i = 1) => ({
        opacity: 1,
        transition: { staggerChildren: 0.05 * i, delayChildren: 0 },
      }),
    },
    item: {
      hidden: { opacity: 0, x: 20 },
      show: { opacity: 1, x: 0, transition: { duration: 0.3 } },
    },
  },
  slideRight: {
    container: {
      hidden: { opacity: 0 },
      show: (i = 1) => ({
        opacity: 1,
        transition: { staggerChildren: 0.05 * i, delayChildren: 0 },
      }),
    },
    item: {
      hidden: { opacity: 0, x: -20 },
      show: { opacity: 1, x: 0, transition: { duration: 0.3 } },
    },
  },
  scaleUp: {
    container: {
      hidden: { opacity: 0 },
      show: (i = 1) => ({
        opacity: 1,
        transition: { staggerChildren: 0.05 * i, delayChildren: 0 },
      }),
    },
    item: {
      hidden: { opacity: 0, scale: 0.8 },
      show: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
    },
  },
  scaleDown: {
    container: {
      hidden: { opacity: 0 },
      show: (i = 1) => ({
        opacity: 1,
        transition: { staggerChildren: 0.05 * i, delayChildren: 0 },
      }),
    },
    item: {
      hidden: { opacity: 0, scale: 1.2 },
      show: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
    },
  },
};

export function TextAnimate({
  children,
  as: Component = "p",
  className,
  animation = "fadeIn",
  by = "word",
  delay = 0,
  duration = 0.3,
  staggerDelay = 0.05,
  ...props
}: TextAnimateProps) {
  const MotionComponent = motion(Component as React.ComponentType<HTMLMotionProps<"p">>);

  let segments: string[] = [];
  if (by === "word") {
    segments = children.split(" ");
  } else if (by === "character") {
    segments = children.split("");
  } else {
    segments = [children];
  }

  const selectedVariants = defaultVariants[animation] || defaultVariants.fadeIn;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        delayChildren: delay,
        staggerChildren: staggerDelay,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: selectedVariants.item.hidden,
    show: {
      ...selectedVariants.item.show,
      transition: {
        duration,
        ...(typeof selectedVariants.item.show === "object" &&
        selectedVariants.item.show !== null &&
        "transition" in selectedVariants.item.show
          ? (selectedVariants.item.show as { transition?: object }).transition
          : {}),
      },
    },
  };

  return (
    <AnimatePresence mode="wait">
      <MotionComponent
        initial="hidden"
        animate="show"
        exit="hidden"
        variants={containerVariants}
        className={className}
        {...props}
      >
        {segments.map((segment, index) => (
          <motion.span
            key={`${segment}-${index}`}
            variants={itemVariants}
            style={{ display: "inline-block", whiteSpace: "pre" }}
          >
            {segment}
            {by === "word" && index < segments.length - 1 && "\u00A0"}
          </motion.span>
        ))}
      </MotionComponent>
    </AnimatePresence>
  );
}
