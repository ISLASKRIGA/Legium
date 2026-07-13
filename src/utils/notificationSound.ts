let audioCtx: AudioContext | null = null;

/** Short two-note chime, synthesized via Web Audio API (no external asset needed). */
export const playNotificationSound = (): void => {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch (e) {
    console.warn('[Sound] No se pudo reproducir el sonido de notificación:', e);
  }
};
