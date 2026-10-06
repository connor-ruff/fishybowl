// A non-destructive connection indicator. It overlays the current screen
// instead of replacing it, so a player who drops for a few seconds keeps
// whatever they were looking at (and whatever they were typing).
function ConnectionBanner({ connected, onRetry }) {
  if (connected) return null;

  return (
    <div className="conn-banner" role="status" aria-live="polite">
      <span className="conn-dot" />
      <span>Reconnecting&hellip; your spot is being held</span>
      {onRetry && (
        <button className="conn-retry" onClick={onRetry}>
          Retry now
        </button>
      )}
    </div>
  );
}

export default ConnectionBanner;
