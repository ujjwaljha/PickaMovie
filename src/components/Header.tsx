import { RotateCcw } from "lucide-react";
import { useState } from "react";

export function Header({ saved, canClear, onClear }: { saved: boolean; canClear: boolean; onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <header className="site-header">
      <div className="header-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            2
          </span>
          <div>
            <h1 className="wordmark">
              What<span>2</span>Watch
            </h1>
            <p className="tagline">Pick up to 4 titles.</p>
          </div>
        </div>
        <div className="header-actions">
          {saved ? (
            <p className="saved is-fresh" role="status">
              Saved
            </p>
          ) : null}
          {canClear ? (
            confirming ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setConfirming(false);
                    onClear();
                  }}
                >
                  Clear picks
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
                <RotateCcw size={16} aria-hidden="true" />
                Clear
              </button>
            )
          ) : null}
        </div>
      </div>
    </header>
  );
}
