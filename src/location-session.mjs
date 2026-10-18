export const FIX_MAX_AGE = 20000;
export function usableFix(fix, now = Date.now()) {
  return !!fix && Number.isFinite(fix.timestamp) && now - fix.timestamp <= FIX_MAX_AGE && now >= fix.timestamp - 5000 &&
    Number.isFinite(fix.coords.latitude) && Math.abs(fix.coords.latitude) <= 85 &&
    Number.isFinite(fix.coords.longitude) && Math.abs(fix.coords.longitude) <= 180 &&
    Number.isFinite(fix.coords.accuracy) && fix.coords.accuracy >= 0 && fix.coords.accuracy <= 50;
}
export function canArrive(distance, fix, now = Date.now(), radius = 70) {
  return usableFix(fix, now) && distance + fix.coords.accuracy <= radius;
}
export function locationMessage(error) {
  const code = String(error?.code ?? '');
  if (['1','OS-PLUG-GLOC-0003'].includes(code)) return 'Location access is off. In Settings, allow Quavi to use your location while using the app, then try again. You can also choose Demo walk.';
  if (['3','OS-PLUG-GLOC-0010'].includes(code)) return 'GPS timed out. Move somewhere with a clearer view of the sky and try again.';
  return 'Location is unavailable. Check that Location Services is on and try again. You can still read your plan and add notes.';
}
/** Owns the asynchronous native watch ID, including cancellation before creation finishes. */
export function beginLocationWatch(adapter, prompt, onPosition, onError) {
  let stopped = false, id;
  void (async () => {
    try {
      const permission = await adapter.permission(prompt);
      if (stopped) return;
      if (permission !== 'granted') throw Object.assign(new Error('Location access is off'), {code: '1'});
      id = await adapter.watch((position, error) => {
        if (stopped) return;
        if (error) onError(error); else if (position) onPosition(position);
      });
      if (stopped) await adapter.clear(id);
    } catch (error) { if (!stopped) onError(error); }
  })();
  return () => { stopped = true; if (id !== undefined) void adapter.clear(id).catch(() => {}); };
}
