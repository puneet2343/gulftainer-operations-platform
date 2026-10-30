'use client';

/*
 * Login shell: a dark indigo-to-night gradient with drifting glows and a dot grid,
 * holding one glass card. Left 45%: brand and welcome. Right 55%: the form (children).
 * Uses Sora (local) for the login screen only; the rest of the app is Figtree.
 */

import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { motion, Variants } from 'framer-motion';
import localFont from 'next/font/local';
import { BRAND } from '@/lib/brand';

const sora = localFont({
  src: '../../../public/fonts/sora/Sora-Regular.ttf',
  display: 'swap',
  variable: '--font-login',
});

const PREMIUM_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.965, y: 26, filter: 'blur(14px)' },
  visible: {
    opacity: 1, scale: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 1, ease: PREMIUM_EASE, when: 'beforeChildren', staggerChildren: 0.08 },
  },
};

const leftPanelVariants: Variants = {
  hidden: { opacity: 0, x: -22 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.85, ease: PREMIUM_EASE } },
};

const rightPanelVariants: Variants = {
  hidden: { opacity: 0, x: 42, scale: 0.985 },
  visible: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.95, ease: PREMIUM_EASE, delay: 0.04 } },
};

const textVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.72, ease: PREMIUM_EASE, delay: 0.14 } },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => setMounted(true));
  }, []);

  return (
    <main className={`relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-secondary px-4 py-6 antialiased sm:px-6 sm:py-8 ${sora.className}`}>
      {/* Background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--color-primary)_0%,var(--color-secondary-mid)_46%,var(--color-secondary-dark)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_5%,rgba(255,255,255,0.28),transparent_28%),radial-gradient(circle_at_90%_88%,rgba(40,63,143,0.30),transparent_34%),radial-gradient(circle_at_55%_45%,rgba(255,255,255,0.08),transparent_34%)]" />

        <motion.div
          animate={{ x: [0, 46, -18, 0], y: [0, -38, 20, 0], scale: [1, 1.08, 0.96, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -left-[18%] -top-[34%] h-[780px] w-[780px] rounded-full bg-white/[0.14] blur-[125px]"
        />
        <motion.div
          animate={{ x: [0, -34, 18, 0], y: [0, 30, -24, 0], scale: [1, 0.95, 1.08, 1] }}
          transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-[38%] -right-[20%] h-[760px] w-[760px] rounded-full bg-primary/[0.30] blur-[140px]"
        />
        <div className="absolute left-[40%] top-[12%] h-[420px] w-[420px] rounded-full bg-white/[0.06] blur-[110px]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 0.6px, transparent 0.6px)', backgroundSize: '18px 18px' }}
        />
      </div>

      {/* Main Card */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        style={{ WebkitFontSmoothing: 'antialiased', perspective: 1200 }}
        className="relative z-10 flex h-[610px] w-full max-w-[980px] overflow-hidden rounded-[46px] border border-white/[0.20] shadow-[0_50px_140px_-30px_rgba(0,0,0,0.52)] sm:h-[590px]"
      >
        {/* Glass shell */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-white/[0.10] backdrop-blur-[42px] backdrop-saturate-150" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.30)_0%,rgba(255,255,255,0.12)_35%,rgba(255,255,255,0.025)_100%)]" />
          <div className="absolute inset-[1px] rounded-[45px] border border-white/[0.12]" />
          <div className="absolute left-[8%] top-0 h-px w-[70%] bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        </div>

        {/* Left Side */}
        <motion.section
          variants={leftPanelVariants}
          className="pointer-events-none absolute inset-y-0 left-0 z-20 hidden w-[45%] flex-col justify-between overflow-hidden p-12 text-white md:flex"
        >
          <div className="pointer-events-none absolute -bottom-28 -left-28 h-[360px] w-[360px] rounded-full bg-primary/[0.28] blur-[95px]" />
          <div className="pointer-events-none absolute -right-24 top-12 h-[320px] w-[320px] rounded-full bg-white/[0.08] blur-[90px]" />

          {/* Logo */}
          <motion.div variants={textVariants} className="pointer-events-auto relative z-10 flex items-center gap-3.5">
            <motion.div
              whileHover={{ scale: 1.04, rotate: 1.5 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="relative grid h-[54px] w-[54px] place-items-center overflow-hidden rounded-[17px] border border-white/[0.34] bg-white/[0.15] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_14px_34px_rgba(0,0,0,0.12)] backdrop-blur-2xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.22] to-transparent" />
              <Image src={BRAND.mark} alt={`${BRAND.shortName} logo`} width={32} height={32} className="relative h-8 w-8 object-contain drop-shadow-md" />
            </motion.div>
            <span className="text-[19px] font-semibold tracking-[-0.025em] text-white drop-shadow-sm">{BRAND.product}</span>
          </motion.div>

          {/* Welcome */}
          <motion.div variants={textVariants} className="pointer-events-auto relative z-10 mb-4 max-w-[330px]">
            <p className="mb-2 text-[17px] font-medium tracking-wide text-white/[0.78]">Welcome to</p>
            <h1 className="bg-gradient-to-b from-white to-white/[0.80] bg-clip-text text-[48px] font-bold leading-[1.04] tracking-[-0.05em] text-transparent drop-shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
              {BRAND.company}
              <br />
              {BRAND.portal}
            </h1>
            <motion.div
              whileHover={{ scale: 1.03 }}
              className="mt-7 inline-flex items-center rounded-full border border-white/[0.32] bg-white/[0.12] px-5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_12px_28px_rgba(0,0,0,0.08)] backdrop-blur-2xl"
            >
              <span className="text-[12px] font-bold uppercase tracking-[0.23em] text-white/[0.92]">{BRAND.company}</span>
            </motion.div>
          </motion.div>
        </motion.section>

        {/* Right Side */}
        <div className={`absolute inset-y-0 right-0 z-30 h-full w-full transform-gpu transition-opacity duration-500 md:w-[55%] ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <motion.section
            variants={rightPanelVariants}
            className="relative flex h-full w-full flex-col justify-center overflow-hidden bg-white/[0.93] px-6 py-10 backdrop-blur-[36px] sm:px-10 md:rounded-l-[44px] md:rounded-r-[46px] md:border-l md:border-white/[0.76] md:px-14 md:shadow-[-18px_0_55px_rgba(0,0,0,0.09)]"
          >
            <div className="pointer-events-none absolute -right-28 -top-28 h-[300px] w-[300px] rounded-full bg-primary/[0.045] blur-[75px]" />
            <div className="pointer-events-none absolute -bottom-24 left-10 h-[260px] w-[260px] rounded-full bg-secondary/[0.035] blur-[80px]" />
            <div className="pointer-events-none absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-white to-transparent" />
            <div className="relative z-10">{children}</div>
          </motion.section>
        </div>
      </motion.div>
    </main>
  );
}
