import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import infraticLogo from '../../../infratic.png';

const headlineText = 'Control. Observe. Deploy.';

const useTypewriter = (text: string, startDelay: number, stepDelay: number, prefersReducedMotion: boolean | null): string => {
  const [visibleText, setVisibleText] = useState(prefersReducedMotion ? text : '');

  useEffect(() => {
    if (prefersReducedMotion) {
      setVisibleText(text);
      return;
    }

    setVisibleText('');
    let index = 0;
    let interval: number | undefined;
    const startTimer = window.setTimeout(() => {
      interval = window.setInterval(() => {
        index += 1;
        setVisibleText(text.slice(0, index));

        if (index >= text.length) {
          window.clearInterval(interval);
        }
      }, stepDelay);
    }, startDelay);

    return () => {
      window.clearTimeout(startTimer);
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [prefersReducedMotion, startDelay, stepDelay, text]);

  return visibleText;
};

export const SplashScreen = (): JSX.Element => {
  const prefersReducedMotion = useReducedMotion();
  const typedHeadline = useTypewriter(headlineText, 180, 42, prefersReducedMotion);

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[100] isolate overflow-hidden bg-bg-primary"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: prefersReducedMotion ? 0.18 : 0.8, ease: [0.22, 1, 0.36, 1] } }}
    >
      <div className="absolute inset-0 bg-[#10182a]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_50%,rgba(79,142,247,0.14),transparent_28%),radial-gradient(circle_at_72%_35%,rgba(255,255,255,0.05),transparent_32%),linear-gradient(135deg,#0c1321_0%,#14213a_48%,#0d1628_100%)]" />
      <motion.div
        className="absolute left-[28%] top-1/2 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-blue/18 blur-3xl"
        initial={{ scale: 0.72, opacity: 0.25 }}
        animate={{
          scale: prefersReducedMotion ? 1 : [0.84, 1.05, 0.96],
          opacity: prefersReducedMotion ? 0.35 : [0.22, 0.45, 0.3]
        }}
        transition={{ duration: 2.2, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_55%_50%,rgba(79,142,247,0.08),transparent_45%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: prefersReducedMotion ? 0.65 : [0.4, 0.75, 0.55] }}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: prefersReducedMotion ? 0 : Infinity, repeatType: 'mirror' }}
      />

      <div className="relative flex h-full items-center justify-center px-6 md:px-10 xl:px-16">
        <div className="flex w-full max-w-[128rem] flex-col items-center gap-10 md:flex-row md:items-center md:justify-between md:gap-16">
          <motion.div
            className="relative flex flex-[1.35] justify-center md:justify-start"
            initial={{ opacity: 0, x: prefersReducedMotion ? 0 : -36, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0.18 : 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.img
              src={infraticLogo}
              alt="Infratic logo"
              className="relative h-[28rem] w-[28rem] object-contain drop-shadow-[0_0_110px_rgba(79,142,247,0.5)] md:h-[52rem] md:w-[52rem] xl:h-[64rem] xl:w-[64rem]"
              initial={{ opacity: 0, scale: 0.65, rotate: prefersReducedMotion ? 0 : -10 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.08, duration: prefersReducedMotion ? 0.18 : 0.85, ease: [0.16, 1, 0.3, 1] }}
            />
          </motion.div>

          <motion.div
            className="flex flex-[0.75] flex-col items-center text-center md:items-start md:text-left"
            initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: prefersReducedMotion ? 0 : 0.2, duration: prefersReducedMotion ? 0.18 : 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.55em] text-accent-blue/80">Infratic</p>
              <h1
                className="max-w-xl text-3xl font-semibold leading-[0.95] tracking-[0.03em] text-white md:text-4xl xl:text-5xl"
                style={{ fontFamily: '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif' }}
              >
                {typedHeadline}
                <motion.span
                  className="ml-1 inline-block h-[0.9em] w-[0.08em] bg-accent-blue align-[-0.08em]"
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: [1, 0, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                />
              </h1>
            </div>

            <motion.div
              className="mt-10 flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-text-secondary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.45, duration: prefersReducedMotion ? 0.18 : 0.6 }}
            >
              <span className="h-px w-10 bg-accent-blue/60" />
              <motion.span
                animate={prefersReducedMotion ? undefined : { opacity: [0.45, 1, 0.45] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                Initializing command center
              </motion.span>
              <span className="h-px w-10 bg-accent-blue/60" />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};
