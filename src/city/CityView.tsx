import { useEffect, useRef } from 'react';
import { getLiveMap, useGame } from '../state/store';

export default function CityView() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let game: import('phaser').Game | null = null;
    let cancelled = false;
    const ro = new ResizeObserver(() => {
      const el = host.current;
      if (game && el && el.clientWidth > 0 && el.clientHeight > 0) game.scale.resize(el.clientWidth, el.clientHeight);
    });
    if (host.current) ro.observe(host.current);
    (async () => {
      const Phaser = (await import('phaser')).default;
      const { CityScene } = await import('./CityScene');
      if (cancelled || !host.current) return;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host.current,
        transparent: false,
        backgroundColor: '#f0eadb',
        scale: { mode: Phaser.Scale.RESIZE, width: Math.max(320, host.current.clientWidth), height: Math.max(180, host.current.clientHeight) },
        banner: false,
        audio: { noAudio: true },
      });
      const bridge: import('./CityScene').CityBridge = {
          getState: () => useGame.getState().game,
          getHighlight: () => {
            const st = useGame.getState();
            return st.selected ? { type: 'plot' as const, id: st.selected } : st.inspect;
          },
          onPick: (p: import('../engine/map').Pick | null) => useGame.getState().onPick(p),
          getMap: () => getLiveMap(useGame.getState().game),
          getTool: () => useGame.getState().tool,
          getMode: () => useGame.getState().mapMode,
          onToolClick: (x: number, y: number) => useGame.getState().toolClick(x, y),
          onHover: (h: { x: number; y: number } | null) => useGame.getState().setHover(h),
          onCamera: (k: 'pan' | 'zoom') => useGame.getState().tutorialEvent(k),
          animations: () => useGame.getState().settings.animations,
      };
      game.scene.add('city', CityScene, true, { bridge });
    })();
    return () => {
      cancelled = true;
      ro.disconnect();
      const g = game;
      if (!g) return;
      // destroying a renderer mid-boot breaks WebGL framebuffers (seen with StrictMode/HMR remounts)
      if (g.isBooted) g.destroy(true);
      else g.events.once('ready', () => g.destroy(true));
    };
  }, []);
  return <div className="city-canvas" ref={host} aria-label="Interactive city map. Click a plot to build or upgrade." />;
}
